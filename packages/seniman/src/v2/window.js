import { Buffer } from 'node:buffer';
import { useState, useEffect, useDisposableEffect, onCleanup, untrack, useMemo, createContext, useContext, getActiveWindow, setActiveWindow, processWorkQueue, getActiveNode, runInNode, useCallback } from './state.js';
import { clientFunctionDefinitions, streamBlockTemplateInstall } from '../declare.js';
import { bufferPool, PAGE_SIZE } from '../buffer-pool.js';
import { ErrorHandler } from './errors.js';
import { HeadContext, createHeadContextValue } from '../head.js';

const ClientContext = createContext(null);

export function useWindow() {
  return useClient();
}

export function useClient() {
  return useContext(ClientContext);
}

const camelCaseToKebabCaseRegex = /([a-z0-9])([A-Z])/g;

// TODO: use a LRU cache
const camelCache = new Map();

function camelCaseToKebabCase(str) {
  if (camelCache.has(str)) {
    return camelCache.get(str);
  }

  const result = str.replace(camelCaseToKebabCaseRegex, '$1-$2').toLowerCase();
  camelCache.set(str, result);
  return result;
}

const getCookieValue = (cookieString, key) => {
  let keyStart = 0;
  let valueStart = -1;
  for (let i = 0; i < cookieString.length; i++) {
    if (cookieString[i] === '=' && keyStart === i) {
      return null;
    }
    if (cookieString[i] === '=' && keyStart !== i) {
      if (cookieString.substring(keyStart, i).trim() === key) {
        valueStart = i + 1;
        break;
      }
      keyStart = -1;
    }
    if (cookieString[i] === ' ' || cookieString[i] === ';') {
      if (keyStart !== -1) {
        if (cookieString.substring(keyStart, i).trim() === key) {
          valueStart = i + 1;
          break;
        }
        keyStart = -1;
      }
    }
    if (keyStart === -1 && cookieString[i] !== ' ' && cookieString[i] !== ';') {
      keyStart = i;
    }
  }
  if (valueStart === -1) {
    return null;
  }
  let valueEnd = valueStart;
  while (valueEnd < cookieString.length && cookieString[valueEnd] !== ';') {
    valueEnd++;
  }
  return decodeURIComponent(cookieString.substring(valueStart, valueEnd));
}

function setCookieValue(cookieString, key, value) {
  var keyValue = key + "=" + value + ";";
  var newCookieString = keyValue;
  var keyIndex = cookieString.indexOf(key + "=");
  if (keyIndex !== -1) {
    var endOfKey = cookieString.indexOf(";", keyIndex);
    if (endOfKey === -1) {
      endOfKey = cookieString.length;
    }
    newCookieString = cookieString.substring(0, keyIndex) + keyValue + cookieString.substring(endOfKey);
  } else if (cookieString) {
    newCookieString = keyValue + " " + cookieString;
  }
  return newCookieString;
}

class WorkQueue {

  constructor() {
    this.queue = [];
  }

  add(item) {
    // looping from the end of the list, find the first item that has the similar or less depth,
    // if so, insert after it. otherwise, insert at the beginning
    let i = this.queue.length - 1;
    while (i >= 0) {
      if (this.queue[i].depth <= item.depth) {
        this.queue.splice(i + 1, 0, item);
        return;
      }

      i--;
    }

    this.queue.unshift(item);
  }

  isEmpty() {
    return this.queue.length === 0;
  }

  poll() {
    return this.queue.shift();
  }
}

function processInput(window, inputQueue) {

  setActiveWindow(window);

  while (inputQueue.length) {
    let msg = inputQueue.shift();

    untrack(() => {
      try {
        window._onMessage(msg);
      } catch (e) {
        console.error(e);
      }
    });
  }

  setActiveWindow(null);
}

function createNoArgClientFunction(fn) {
  return $c(() => {
    $s(fn)();
  });
}

function BackButtonListener(props) {
  let client = useClient();
  let onPopState = createHandler((pathname) => {
    props.onBackButton(pathname);
  });

  client.exec($c(() => {
    window.onpopstate = () => {
      $s(onPopState)(location.pathname);
    }
  }));
}

function WindowResizeListener(props) {
  let client = useClient();
  let onResize = createHandler((width, height) => {
    props.onResize(width, height);
  });

  client.exec($c(() => {
    let throttle = (func, delay) => {
      let lastCall = 0;
      let timeoutId;
      let latestArgs;

      return (...args) => {
        latestArgs = args;
        clearTimeout(timeoutId);

        let _now = Date.now();
        if (_now - lastCall >= delay) {
          lastCall = _now;
          func.apply(null, latestArgs);
        } else {
          timeoutId = setTimeout(() => {
            lastCall = Date.now();
            func.apply(null, latestArgs);
          }, delay - (_now - lastCall));
        }
      };
    }

    window.addEventListener('resize', throttle(() => {
      $s(onResize)(window.innerWidth, window.innerHeight);
    }, 500));
  }));
}

//let CMD_PING = 0;
//let CMD_INSTALL_TEMPLATE = 1;
let CMD_INIT_WINDOW = 2;
let CMD_ATTACH_ANCHOR = 3;
let CMD_ATTACH_EVENT_V2 = 5;
let CMD_ELEMENT_UPDATE = 7;
let CMD_INIT_BLOCK = 8;
let CMD_REMOVE_BLOCKS = 9;
let CMD_INSTALL_CLIENT_FUNCTION = 10;
let CMD_RUN_CLIENT_FUNCTION = 11;
let CMD_INIT_SEQUENCE = 13;
let CMD_MODIFY_SEQUENCE = 14;
let CMD_MODIFY_HEAD = 16;

let pingBuffer = Buffer.from([0]);
const scratchBuffer = Buffer.alloc(32768);

export class Window {

  constructor(windowManager, bufferFn, pageParams, RootComponent) {
    this.windowManager = windowManager;

    let { windowId,
      currentPath,
      viewportSize,
      cookieString } = pageParams;

    this.id = windowId;
    this.destroyFnCallback = null;
    this.connected = true;

    this.pages = [];
    this.global_readOffset = 0;
    this.global_writeOffset = 0;
    this.mutationGroup = null;

    this.bufferFn = bufferFn;

    this._streamInitWindow();

    this.latestBlockId = 10;

    // reuse the same buffer for all block delete commands
    this.deleteBlockCommandBuffer = Buffer.alloc(1000 * 2);
    this.deleteBlockCount = 0;

    this.clientTemplateInstallationSet = new Set();
    this.clientFunctionInstallationSet = new Set();

    this.lastEventHandlerId = 0;
    this.eventHandlers = new Map();

    this.tokenList = new Map();
    // fill out the 0 index to make it easier for templating system to do 1-indexing
    this.tokenList.set('', 0);

    this.inputMessageQueue = [];
    this.hasPendingInput = false;
    this.hasPendingWork = false;
    this.workQueue = new WorkQueue();

    this.lastPongTime = Date.now();

    this.rootDisposer = useDisposableEffect(() => {
      let [path, setPath] = useState(currentPath);
      // let [pageTitle, set_pageTitle] = useState('');
      let [getCookie, setCookie] = useState(cookieString);
      let [viewportSizeSignal, setViewportSize] = useState({ width: viewportSize[0], height: viewportSize[1] });
      let [shouldSendPostScript, setShouldSendPostScript] = useState(false);

      let clientContext = {
        viewportSize: viewportSizeSignal,

        cookie: (cookieKey) => {
          return useMemo(() => {
            let cookieString = getCookie();
            return cookieString ? getCookieValue(cookieString, cookieKey) : null;
          });
        },

        setCookie: (cookieKey, cookieValue, expirationTime) => {

          untrack(() => {
            let cookieString = getCookie();
            let newCookieString = setCookieValue(cookieString, cookieKey, cookieValue);

            setCookie(newCookieString);

            if (!expirationTime) {
              expirationTime = new Date();
              // set default expiration to one hour after now
              expirationTime.setHours(expirationTime.getHours() + 1);
            }

            // build the cookie string
            let cookieSetString = `${cookieKey}=${cookieValue}; expires=${expirationTime.toUTCString()}; path=/`;

            clientContext.exec($c(() => {
              document.cookie = $s(cookieSetString);
            }));
          });
        },

        path,

        navigate: (path) => {
          clientContext.exec($c(() => {
            window.history.pushState({}, '', $s(path));
          }));
          setPath(path);
        },

        exec: (clientFnSpec) => {
          let { clientFnId, serverBindFns } = clientFnSpec;

          this._streamFunctionInstallCommand(clientFnId);

          let sbvBuffer = this._encodeServerBoundValues(serverBindFns || []);
          let buf = this._allocCommandBuffer(1 + 2 + sbvBuffer.length);

          buf.writeUInt8(CMD_RUN_CLIENT_FUNCTION, 0);
          buf.writeUInt16BE(clientFnId, 1);

          sbvBuffer.copy(buf, 3);
        },

        _modifyHead: (command) => {
          let sbvBuffer = this._encodeServerBoundValues([command]);

          let buf = this._allocCommandBuffer(1 + sbvBuffer.length);

          buf.writeUInt8(CMD_MODIFY_HEAD, 0);
          sbvBuffer.copy(buf, 1);
        }
      };

      let onBackButton = (pathname) => {
        setPath(pathname);
      }

      let onResize = (width, height) => {
        setViewportSize({ width, height });
      }

      getActiveNode().context = {
        [ClientContext.id]: clientContext,
        [HeadContext.id]: createHeadContextValue(clientContext)
      };

      this._attach(1, 0,
        <ErrorHandler>
          <RootComponent />
          <BackButtonListener onBackButton={onBackButton} />
          {shouldSendPostScript() ? <WindowResizeListener onResize={onResize} /> : null}
        </ErrorHandler>
      );

      setTimeout(() => {
        setShouldSendPostScript(true);
      }, 2000);
    }, null, this);

    this.lifecycleInterval = setInterval(() => {
      let pongDiff = Date.now() - this.lastPongTime;

      if (pongDiff >= 6000) {
        this.connected = false;
      }

      if (!this.connected) {
        let destroyTimeout = 60000;
        let lowMemoryMode = this.windowManager.lowMemoryMode;

        if (lowMemoryMode || pongDiff >= destroyTimeout) {
          this.destroy();
          return;
        }
      }

      this.sendPing();
      this.flushBlockDeleteQueue();
    }, 2500);
  }

  onBuffer(bufferFn) {
    this.bufferFn = bufferFn;
  }

  submitWork(node) {
    this.workQueue.add(node);

    if (!this.hasPendingWork) {
      this.windowManager.requestExecution(this);
      this.hasPendingWork = true;
    }
  }

  scheduleWork() {

    // TODO: probably do the queue loop here, 
    // in high-traffic situations, cross check the output buffer if there's enough generated there
    // to start yielding to another window even though queue is not completely processed
    // to make sure everyone's windows are sufficiently responsive
    processWorkQueue(this, this.workQueue);

    this._flushMutationGroup();

    // for now, always assume we're done with work, and set this.hasPendingWork to false
    // later, we'll need to check if there's still work to do since we'll only be allowed to do a certain amount of work per frame
    this.hasPendingWork = false;
  }

  sendPing() {
    this.bufferFn(pingBuffer);
  }

  _handleBlockCleanup(blockId) {

    // if the buffer is full, send it
    if (this.deleteBlockCount == 1000) {
      this.flushBlockDeleteQueue();
    }

    this.deleteBlockCommandBuffer.writeUint16BE(blockId, this.deleteBlockCount * 2);
    this.deleteBlockCount++;
  }

  flushBlockDeleteQueue() {
    //return;
    if (this.deleteBlockCount > 0) {
      let buf = this._allocCommandBuffer(1 + 2 * this.deleteBlockCount + 2);

      buf.writeUint8(CMD_REMOVE_BLOCKS, 0);

      // copy over the block ids
      this.deleteBlockCommandBuffer.copy(buf, 1, 0, this.deleteBlockCount * 2);

      // write the end marker
      buf.writeUint16BE(0, 1 + 2 * this.deleteBlockCount);

      this.deleteBlockCount = 0;
    }
  }

  registerPong(pongBuffer) {
    this.lastPongTime = Date.now();
    this.connected = true;

    let readOffset = senimanDecode(pongBuffer.subarray(2))[0];
    this.registerReadOffset(readOffset);
  }

  registerReadOffset(readOffset) {

    // TODO: check against writeOffset to make sure we're not reading ahead
    if (readOffset < this.global_readOffset) {
      throw new Error(`Invalid offset: ${readOffset} : ${this.global_readOffset}`);
    }

    this.global_readOffset = readOffset;

    // free unused pages
    while (true) {
      let page = this.pages[0];

      // if page finalSize is 0, it means the page is still being actively written to
      // and not ready to be freed yet
      if (page.finalSize == 0) {
        break;
      }

      // if the page is fully read, remove it
      if (readOffset >= (page.global_headOffset + page.finalSize)) {
        let page = this.pages.shift();

        // return the page to the pool for later reuse
        bufferPool.returnBuffer(page.buffer);
      } else {
        break;
      }
    }
  }

  _restreamUnreadPages() {
    // if there are new commands generated during disconnection,
    // let's restream them
    if (this.global_writeOffset > this.global_readOffset) {
      let readOffset = this.global_readOffset;

      for (let i = 0; i < this.pages.length; i++) {
        let page = this.pages[i];
        let size;
        let offset = readOffset - page.global_headOffset;

        if (page.finalSize > 0) {
          size = (page.global_headOffset + page.finalSize) - readOffset;
        } else {
          size = this.global_writeOffset - readOffset; // 6 - 3
        }

        this.bufferFn(page.buffer.subarray(offset, offset + size));

        readOffset += size;
      }

      if (readOffset != this.global_writeOffset) {
        throw new Error();
      }
    }
  }

  reconnect(pageParams) {

    let { windowId,
      currentPath,
      viewportSize,
      readOffset,
      cookieString } = pageParams;

    //setCookie(cookieString);

    console.log('reconnected in window', this.id, readOffset);

    this.connected = true;
    this.lastPongTime = Date.now();

    this.registerReadOffset(readOffset);
    this._restreamUnreadPages();
  }

  disconnect() {
    console.log('window disconnect', this.id);
    this.connected = false;
  }

  destroy() {
    this.treeDisposer();
  }

  enqueueInputMessage(msg) {
    this.inputMessageQueue.push(msg);
  }

  scheduleInput() {
    processInput(this, this.inputMessageQueue);
    this.hasPendingInput = false;
  }

  _onMessage(buffer) {
    let txPortId = buffer.readUint16LE(0);

    if (!this.eventHandlers.has(txPortId)) {
      return;
    }

    let handler = this.eventHandlers.get(txPortId);
    let argsList = senimanDecode(buffer.subarray(2));

    handler.apply(null, argsList);
  }

  onDestroy(fn) {
    this.destroyFnCallback = fn;
  }

  destroy() {
    this.rootDisposer();
    this.destroyFnCallback();

    clearInterval(this.lifecycleInterval);

    // return active pages' buffers to the pool
    this.pages.forEach(page => {
      bufferPool.returnBuffer(page.buffer);
    });
  }

  _allocPage(headOffset) {
    //console.log('_allocPage', headOffset);
    //let pageCount = this.pages.length;

    let page = {
      global_headOffset: headOffset,
      buffer: bufferPool.alloc(),
      finalSize: 0
    };

    this.pages.push(page);

    return page;
  }

  _flushMutationGroup() {

    let mg = this.mutationGroup;

    if (this.connected && mg && ((this.global_writeOffset - mg.pageStartOffset) > 0)) {

      let buffer = mg.page.buffer;
      let offset = mg.pageStartOffset - mg.page.global_headOffset;
      let size = this.global_writeOffset - mg.pageStartOffset;

      this.bufferFn(buffer.subarray(offset, offset + size));
    }

    this.mutationGroup = null;
  }

  _allocCommandBuffer(size) {

    if (size > PAGE_SIZE) {
      // TODO: support command-stitching so that we can support commands larger than the default page size
      throw new Error(`Command size is too large. The current page size is ${PAGE_SIZE} bytes, but the command size is ${size} bytes. This is currently unsupported; try setting the env var SENIMAN_PAGE_SIZE=${size} or a larger value.`);
    }

    if (!this.mutationGroup) {
      let pageCount = this.pages.length;
      let page = pageCount == 0 ? this._allocPage(this.global_writeOffset) : this.pages[pageCount - 1];

      this.mutationGroup = {
        page,
        pageStartOffset: this.global_writeOffset,
      };

      setImmediate(() => {
        this._flushMutationGroup();
      });
    }

    let mg = this.mutationGroup;

    let currentPageOffset = this.global_writeOffset - mg.page.global_headOffset;

    // if we're about to overflow the current page, let's allocate a new one
    if ((currentPageOffset + size) >= PAGE_SIZE) {
      let page = mg.page;
      page.finalSize = currentPageOffset;

      this._flushMutationGroup();

      let newPage = this._allocPage(this.global_writeOffset);

      mg = this.mutationGroup = {
        page: newPage,
        pageStartOffset: this.global_writeOffset
      };

      currentPageOffset = 0;
    }

    this.global_writeOffset += size;

    return mg.page.buffer.subarray(currentPageOffset, currentPageOffset + size);
  }

  _allocateEventHandler(handlerFunction) {
    this.lastEventHandlerId++;

    this.eventHandlers.set(this.lastEventHandlerId, handlerFunction);

    return this.lastEventHandlerId;
  }

  _deallocateEventHandlers(handlerIds) {
    handlerIds.forEach(handlerId => this.eventHandlers.delete(handlerId));
  }

  _streamInitWindow() {
    let buf = this._allocCommandBuffer(1 + 21)
    buf.writeUint8(CMD_INIT_WINDOW, 0);
    buf.write(this.id, 1, 21);
  }

  _streamEventInitCommandV2(blockId, targetId, eventType, clientFnId, serverBindFns) {
    let sbvBuffer = this._encodeServerBoundValues(serverBindFns);

    let buf = this._allocCommandBuffer(1 + 2 + 1 + 1 + 2 + sbvBuffer.length);

    buf.writeUint8(CMD_ATTACH_EVENT_V2, 0);
    buf.writeUint16BE(blockId, 1);
    buf.writeUint8(targetId, 3);
    buf.writeUint8(eventType, 4);
    buf.writeUint16BE(clientFnId, 5);

    sbvBuffer.copy(buf, 7);
  }

  _encodeServerBoundValues(serverBindFns) {
    // create a buffer to hold the encoded server bound values
    let buf = scratchBuffer;
    let offset = 0;

    // TODO: move these constants
    const ARGTYPE_STRING = 1;
    const ARGTYPE_INT16 = 2;
    const ARGTYPE_INT32 = 3;
    const ARGTYPE_FLOAT64 = 4;
    const ARGTYPE_BOOLEAN = 5;
    const ARGTYPE_NULL = 6;
    const ARGTYPE_HANDLER = 7;
    const ARGTYPE_ARRAY = 8;
    const ARGTYPE_OBJECT = 9;

    let argsCount = serverBindFns.length;

    buf.writeUint8(argsCount, offset);
    offset++;

    function encodeValue(arg) {

      // throw error if arg is a function
      if (typeof arg === 'function') {
        throw new Error('Starting from Seniman v0.0.90, referring to a function in a $s(fn) call within a custom $c function requires wrapping the function in a createHandler(fn) call.');
      }

      // check if arg is string, number, boolean, object, null, a callback, or a channel
      if (typeof arg === 'string') {
        buf.writeUint8(ARGTYPE_STRING, offset);
        offset++;

        let str = arg;
        let strLen = Buffer.byteLength(str);

        buf.writeUInt16BE(strLen, offset);
        offset += 2;
        buf.write(str, offset);
        offset += strLen;
      } else if (typeof arg === 'number') {
        let isInt = Number.isInteger(arg);

        if (isInt && Math.abs(arg) < 32768) {
          buf.writeUint8(ARGTYPE_INT16, offset);
          offset++;

          buf.writeInt16BE(arg, offset);
          offset += 2;
        } else if (isInt) {
          buf.writeUint8(ARGTYPE_INT32, offset);
          offset++;

          buf.writeInt32BE(arg, offset);
          offset += 4;
        } else {
          buf.writeUint8(ARGTYPE_FLOAT64, offset);
          offset++;

          buf.writeDoubleBE(arg, offset);
          offset += 8;
        }
      } else if (typeof arg === 'boolean') {
        buf.writeUint8(ARGTYPE_BOOLEAN, offset);
        offset++;
        buf.writeUint8(arg ? 1 : 0, offset);
        offset++;
      } else if (arg === null || arg === undefined) {
        buf.writeUint8(ARGTYPE_NULL, offset);
        offset++;
      } else if (arg.type == 'handler') {
        buf.writeUint8(ARGTYPE_HANDLER, offset);
        offset++;
        buf.writeUInt16BE(arg.id, offset);
        offset += 2;
      } else if (Array.isArray(arg)) {
        buf.writeUint8(ARGTYPE_ARRAY, offset);
        offset++;
        buf.writeUint16BE(arg.length, offset);
        offset += 2;

        for (let j = 0; j < arg.length; j++) {
          encodeValue(arg[j]);
        }
      } else if (typeof arg === 'object') {
        buf.writeUint8(ARGTYPE_OBJECT, offset);
        offset++;

        let keys = Object.keys(arg);
        buf.writeUint16BE(keys.length, offset);
        offset += 2;

        for (let j = 0; j < keys.length; j++) {
          let key = keys[j];
          let keyLength = Buffer.byteLength(key);

          buf.writeUint16BE(keyLength, offset);
          offset += 2;

          buf.write(key, offset);
          offset += keyLength;

          encodeValue(arg[key]);
        }
      } else {
        throw new Error('Invalid argument type: ' + typeof arg);
      }
    }

    for (let i = 0; i < argsCount; i++) {
      let arg = serverBindFns[i];

      encodeValue(arg);
    }

    return buf.subarray(0, offset);
  }

  _streamTemplateInstallCommand(templateId) {
    if (!this.clientTemplateInstallationSet.has(templateId)) {

      streamBlockTemplateInstall(this, templateId);
      this.clientTemplateInstallationSet.add(templateId);
    }
  }

  _streamFunctionInstallCommand(functionId) {

    if (!this.clientFunctionInstallationSet.has(functionId)) {
      let cfDef = clientFunctionDefinitions.get(functionId);
      let sbvBuffer = this._encodeServerBoundValues([cfDef.argNames, cfDef.body]);
      let buf = this._allocCommandBuffer(1 + 2 + sbvBuffer.length);

      buf.writeUInt8(CMD_INSTALL_CLIENT_FUNCTION, 0);
      buf.writeUInt16BE(functionId, 1);
      sbvBuffer.copy(buf, 3);

      this.clientFunctionInstallationSet.add(functionId);
    }
  }

  _createBlockId() {
    this.latestBlockId++;

    return this.latestBlockId;
  }

  _streamBlockInitCommand2(blockId, blockTemplateIds) {
    let buf = this._allocCommandBuffer(1 + 2 + 2);

    buf.writeUint8(CMD_INIT_BLOCK, 0);
    buf.writeUint16BE(blockId, 1);
    buf.writeUint16BE(blockTemplateIds, 3);
  }

  _createSequence(listLength) {
    let _seqId = this._createBlockId();

    // stream the sequence initialization command
    // CMD + BLOCK_ID + LIST_LENGTH
    let bufferLength = 1 + 2 + 2;

    let buf = this._allocCommandBuffer(bufferLength);

    buf.writeUInt8(CMD_INIT_SEQUENCE, 0);
    buf.writeUInt16BE(_seqId, 1);
    buf.writeUInt16BE(listLength, 3);

    onCleanup(() => {
      this._handleBlockCleanup(_seqId);
    });

    return _seqId;
  }

  _streamTextInitCommand(blockId, anchorIndex, value) {

    //console.log('attaching text to block', blockId, anchorIndex, value);
    // for both cases:

    // 2 bytes (16b LE)
    // take the first byte:
    // check first bit if value is 0
    // if 0, this is a text
    // if 1, this is a blockId


    // if text:
    // bit-shift the 16-bit value to exclude the first bit
    // get the value
    // if larger than 0, then interpret the value as the string length
    // if 0, then stop 


    // if blockId.
    // bit-shift the 16-bit value to exclude the first bit
    // get the value
    // value is blockId

    let textBuffer = Buffer.from(value, "utf-8")
    let textLength = textBuffer.length;

    // TODO: handle string length longer than 32K
    let buf2 = this._allocCommandBuffer(1 + 2 + 2 + 2 + textLength);

    buf2.writeUint8(CMD_ATTACH_ANCHOR, 0);
    buf2.writeUint16BE(blockId, 1);

    buf2.writeUint16BE(anchorIndex, 3);

    if (textLength > 32677) {
      throw new Error();
    }

    buf2.writeUint16BE(textLength, 5);
    textBuffer.copy(buf2, 7);
  }

  _streamAttachBlockCommand(parentBlockId, anchorIndex, blockId) {
    let buf2 = this._allocCommandBuffer(1 + 2 + 2 + 2);

    buf2.writeUint8(CMD_ATTACH_ANCHOR, 0);
    buf2.writeUint16BE(parentBlockId, 1);
    buf2.writeUint16BE(anchorIndex, 3);

    buf2.writeUint16BE(blockId |= (1 << 15), 5);
  }

  _createBlock3(blockTemplateId, anchors, eventHandlers, elementEffects) {

    let newBlockId = this._createBlockId();

    this._streamTemplateInstallCommand(blockTemplateId);
    this._streamBlockInitCommand2(newBlockId, blockTemplateId);

    eventHandlers && this._handleBlockEventHandlers(newBlockId, eventHandlers);
    elementEffects && this._handleElementEffects(newBlockId, elementEffects);

    anchors && anchors.map((anchorNodeResult, anchorIndex) => {
      this._attach(newBlockId, anchorIndex, anchorNodeResult);
    });

    return new Block(newBlockId);
  }

  _handleBlockEventHandlers(newBlockId, eventHandlers) {
    let eventHandlersCount = eventHandlers.length;

    for (let i = 0; i < eventHandlersCount; i++) {
      let eventHandler = eventHandlers[i];
      let clientFnId;
      let serverBindFns;

      // 4 possible cases:
      // 1. eventHandler.fn is undefined / null
      // 2. eventHandler.fn is a function instance -- e.g. <... onClick={() => { ... }}
      // 3. eventHandler.fn is a handler instance 
      //    e.g. let handler = createHandler(() => { ... });
      //         <... onClick={handler}
      // 4. eventHandler.fn is a client function instance

      // ultimately we want to operate against a client function instance
      // #2 and #3 handling is basically turning either the function instance or the handler instance
      // into a client function instance

      // do nothing if the event handler is undefined
      if (!eventHandler.fn) {
        continue;
      } else if (eventHandler.fn instanceof Function) {
        // this is a shortcut for the case where the event handler is just a function instance
        // in which case we automatically create a no-argument client function that wraps the event handler
        // and calls it directly.
        // for other cases, the developer must create a client function explicitly
        let handler = this._allocateHandler(eventHandler.fn);
        let clientFn = createNoArgClientFunction(handler);

        // if the event handler is just a function instance, 
        // assign a client function that wraps the event handler
        // and calls it directly without arguments
        clientFnId = clientFn.clientFnId;
        serverBindFns = clientFn.serverBindFns;

      } else if (eventHandler.fn.type === 'handler') {
        let clientFn = createNoArgClientFunction(eventHandler.fn);

        clientFnId = clientFn.clientFnId;
        serverBindFns = clientFn.serverBindFns;
      } else if (eventHandler.fn.clientFnId) {
        clientFnId = eventHandler.fn.clientFnId;
        serverBindFns = eventHandler.fn.serverBindFns || [];
      }

      this._streamFunctionInstallCommand(clientFnId);
      this._streamEventInitCommandV2(newBlockId, eventHandler.targetId, eventHandler.type, clientFnId, serverBindFns);
    }
  }

  _allocateHandler(fn) {
    this.lastEventHandlerId++;

    let handlerId = this.lastEventHandlerId;
    this.eventHandlers.set(handlerId, fn);

    onCleanup(() => {
      this.eventHandlers.delete(handlerId);
    });

    return {
      type: 'handler',
      id: handlerId
    };
  }

  _handleElementEffects(blockId, elementEffects) {

    elementEffects.forEach((elementEffect) => {
      let targetId = elementEffect.targetId;

      let UPDATE_MODE_STYLEPROP = 1;
      let UPDATE_MODE_SET_ATTR = 2;
      let UPDATE_MODE_SET_CLASS = 3;
      let UPDATE_MODE_REMOVE_CLASS = 4;
      let UPDATE_MODE_REMOVE_ATTR = 5;
      let UPDATE_MODE_SET_CHECKED = 6;
      let UPDATE_MODE_MULTI_STYLEPROP = 7;

      // TODO: improve this abstraction
      let elRef = {
        _staticHelper: (mode, propName, propValue) => {
          let buf = this._allocCommandBuffer(1 + 2 + 1 + 1 + 1 + 2 + propValue.length);

          buf.writeUint8(CMD_ELEMENT_UPDATE, 0);
          buf.writeUint16BE(blockId, 1);
          buf.writeUint8(targetId, 3);
          buf.writeUint8(mode, 4);

          buf.writeUint8(propName, 5); // propName is in this case a number -- map index.
          let offset = 6;

          buf.writeUInt16BE(propValue.length, offset);
          offset += 2;
          buf.write(propValue, offset, propValue.length);
        },

        setStyleProperty: (propName, propValue) => {
          // if propValue is a number, we need to convert it to a string
          // TODO: insert some intelligence around adding 'px' to the end of the string like React does?
          // (only on certain properties)
          if (typeof propValue == 'number') {
            propValue = propValue.toString();
          }

          let propKey = this._registerStyleKey(propName);

          elRef._staticHelper(UPDATE_MODE_STYLEPROP, propKey, propValue || '');
        },

        setMultiStyleProperties: (styleProps) => {
          const kebabPropertyPairs = [];

          for (const key in styleProps) {
            const kebabCaseKey = camelCaseToKebabCase(key);
            let value = styleProps[key];

            if (value === undefined) {
              continue;
            } else if (typeof styleProps[key] == 'number') {
              value = value.toString();
            }

            kebabPropertyPairs.push([kebabCaseKey, value]);
          }

          let buf2 = scratchBuffer;

          buf2.writeUint8(CMD_ELEMENT_UPDATE, 0);
          buf2.writeUint16BE(blockId, 1);
          buf2.writeUint8(targetId, 3);
          buf2.writeUint8(UPDATE_MODE_MULTI_STYLEPROP, 4);

          let offset = 5;

          // first 16 bytes are either the length of the property key or the ID of the property key
          // in the static map if it exists there.
          for (let i = 0; i < kebabPropertyPairs.length; i++) {
            const pair = kebabPropertyPairs[i];
            const [key, value] = pair;

            // TODO: add more logic to dynamically determine if we should add the current token to the static map
            if (this.tokenList.get(key)) {
              // let keyIndex = build.reverseIndexMap.stylePropertyKeys[key] + 1;
              let keyIndex = this.tokenList.get(key);
              // set 16-th bit to 1 to denote that this is static map compression index
              // (stylePropertyKeyMap on the client)
              buf2.writeUint16BE(keyIndex |= (1 << 15), offset);
              offset += 2;
            } else {
              buf2.writeUint16BE(key.length, offset);
              offset += 2;
              buf2.write(key, offset, key.length);
              offset += key.length;
            }

            if (this.tokenList.get(value)) {
              //let valueIndex = build.reverseIndexMap.stylePropertyValues[value] + 1;
              let valueIndex = this.tokenList.get(value);
              buf2.writeUint16BE(valueIndex |= (1 << 15), offset);
              offset += 2;
            } else {
              buf2.writeUint16BE(value.length, offset);
              offset += 2;
              buf2.write(value, offset, value.length);
              offset += value.length;
            }
          }

          buf2.writeUint16BE(0, offset);
          offset += 2;

          let buf3 = this._allocCommandBuffer(offset);

          buf2.copy(buf3, 0, 0, offset);
        },

        removeAttribute: (propName) => {
          let buf = this._allocCommandBuffer(1 + 2 + 1 + 1 + 1);

          buf.writeUint8(CMD_ELEMENT_UPDATE, 0);
          buf.writeUint16BE(blockId, 1);
          buf.writeUint8(targetId, 3);
          buf.writeUint8(UPDATE_MODE_REMOVE_ATTR, 4);
          buf.writeUint8(propName, 5); // propName is in this case a number -- map index.
        },

        setAttribute: (propName, propValue) => {
          let attrKey = this._registerAttrKey(propName);

          if (typeof propValue != 'string') {
            if (!propValue) {
              elRef.removeAttribute(attrKey);
              return;
            } else {
              propValue = propValue.toString();
            }
          }

          elRef._staticHelper(UPDATE_MODE_SET_ATTR, attrKey, propValue);
        },
        setClassName: (className) => {
          elRef.setAttribute('class', className);
        }
      };

      if (elementEffect.effectFn.length > 1) {
        useEffect(previous => elementEffect.effectFn(elRef, previous), elementEffect.init);
      } else {
        useEffect(() => elementEffect.effectFn(elRef));
      }
    });
  }

  _registerAttrKey(attrName) {

    if (!this.tokenList.has(attrName)) {
      let newId = this.tokenList.size;
      this.tokenList.set(attrName, newId);

      this._streamModifyToken(attrName);
    }

    return this.tokenList.get(attrName);
  }

  _registerStyleKey(propName) {
    if (!this.tokenList.has(propName)) {
      let newId = this.tokenList.size;
      this.tokenList.set(propName, newId);

      this._streamModifyToken(propName);
    }

    return this.tokenList.get(propName);
  }

  _streamModifyToken(tokenName) {
    let CMD_MODIFY_TOKENMAP = 12;

    let tokenLength = Buffer.byteLength(tokenName);
    let buf = this._allocCommandBuffer(1 + 1 + tokenLength + 1);

    buf.writeUint8(CMD_MODIFY_TOKENMAP, 0);
    buf.writeUint8(tokenLength, 1);
    buf.write(tokenName, 2, tokenLength);
    buf.writeUint8(0, 2 + tokenLength);
  }

  _attach(blockId, anchorIndex, nodeResult) {
    if (typeof nodeResult == 'string') {
      this._streamTextInitCommand(blockId, anchorIndex, nodeResult);
    } else if (typeof nodeResult == 'number') {
      this._streamTextInitCommand(blockId, anchorIndex, nodeResult.toString());
    } else if (!nodeResult) {
      this._streamTextInitCommand(blockId, anchorIndex, '');
    } else {
      switch (nodeResult.constructor) {
        case Block:
          this._streamAttachBlockCommand(blockId, anchorIndex, nodeResult.id);
          break;
        case Component:
          useEffect(() => {
            this._attach(blockId, anchorIndex, nodeResult.fn(nodeResult.props));
          });
          break;
        case Function:
          useEffect(() => {
            let value = nodeResult();
            this._attach(blockId, anchorIndex, value);
          });
          break;
        case Array:
          this._attachListV2(blockId, anchorIndex, nodeResult);
          break;
        case StreamView:
          this._attachStreamView(blockId, anchorIndex, nodeResult);
          break;
        /*
       case Promise:
         let node = getActiveNode();
 
         nodeResult.then(value => {
           runInNode(node, () => {
             this._attach(blockId, anchorIndex, value);
           });
         }).catch(err => {
           console.error(err);
         });
         break;
       */
        default:
          console.error('Unknown nodeResult', nodeResult);
      }
    }
  }

  _attachListV2(blockId, anchorIndex, list) {

    let _seqId = this._createSequence(list.length);

    this._streamAttachBlockCommand(blockId, anchorIndex, _seqId);

    for (let i = 0; i < list.length; i++) {
      this._attach(_seqId, i, list[i]);
    }
  }

  _attachStreamView(blockId, anchorIndex, streamView) {
    let disposeFns = [];
    let itemIds = [];
    let _lastItemId = 0;

    let _seqId = this._createSequence(0);

    // attach the sequence to the anchor
    this._streamAttachBlockCommand(blockId, anchorIndex, _seqId);

    function assignItemId(startIndex) {
      let itemId = ++_lastItemId;
      itemIds.splice(startIndex, 0, itemId);
      return itemId;
    }

    function getIndexForItemId(itemId) {
      // use better data structure for this
      return itemIds.indexOf(itemId);
    }

    let initializeItemComponents = (startIndex, itemCount) => {
      // attach initial items
      for (let i = 0; i < itemCount; i++) {
        let itemId = assignItemId(startIndex + i);

        let disposeFn = useDisposableEffect(() => {
          let currentIndexForItemId = getIndexForItemId(itemId);

          this._attach(_seqId, currentIndexForItemId, streamView.renderNode(currentIndexForItemId));
        });

        // insert the dispose function at the correct index
        disposeFns.splice(startIndex + i, 0, disposeFn);
      }
    }

    streamView.onChange(useCallback(change => {
      let startIndex = change.index;
      let count = change.count;

      // modify the sequence
      this._streamModifySequenceCommand(_seqId, change.type, startIndex, count);

      if (change.type == MODIFY_REMOVE) {
        // dispose the nodes
        for (let i = 0; i < count; i++) {
          disposeFns[startIndex + i]();
        }

        // remove the dispose functions
        disposeFns.splice(startIndex, count);

      } else { // if (change.type == MODIFY_INSERT) 
        initializeItemComponents(startIndex, count);
      }
    }));
  }

  _streamModifySequenceCommand(seqId, changeType, arg0, arg1) {
    let buf = this._allocCommandBuffer(1 + 2 + 1 + 2 + 2);

    // CMD_MODIFY_SEQUENCE
    // seqId
    // changeType (append, prepend, insert, remove, reset)
    // arg0: index
    // arg1: count
    buf.writeUInt8(CMD_MODIFY_SEQUENCE, 0);
    buf.writeUInt16BE(seqId, 1);
    buf.writeUInt8(changeType, 3);
    buf.writeUInt16BE(arg0, 4);
    buf.writeUInt16BE(arg1, 6);
  }
}

const MODIFY_INSERT = 3;
const MODIFY_REMOVE = 4;

export function useStream(initialItems) {
  return new Stream(initialItems);
}

class Stream {

  constructor(items) {
    this.items = items;
    this.views = [];
  }

  indexOf(item) {
    return this.items.indexOf(item);
  }

  remove(index, count) {
    this.items.splice(index, count);

    this.views.forEach(view => {
      view.notifyRemoval(index, count);
    });
  }

  unshift(...items) {
    this.items.unshift(...items);

    this.views.forEach(view => {
      view.notifyInsert(0, items.length);
    });
  }

  push(...items) {
    let index = this.items.length;

    this.items.push(...items);

    this.views.forEach(view => {
      view.notifyInsert(index, items.length);
    });
  }

  view(fn) {
    let view = new StreamView(index => fn(this.items[index]), this.items.length);

    this.views.push(view);

    onCleanup(() => {
      let index = this.views.indexOf(view);
      this.views.splice(index, 1);
    });

    return view;
  }
};

class StreamView {
  constructor(fn, initialCount) {
    this.renderNode = fn;
    this.onChangeFn = null;
    this.initialCount = initialCount;
  }

  onChange(fn) {
    this.onChangeFn = fn;

    if (this.initialCount > 0) {
      this.notifyInsert(0, this.initialCount);
    }
  }

  notifyRemoval(index, count) {
    this.onChangeFn({ type: MODIFY_REMOVE, index, count });
  }

  notifyInsert(index, count) {
    this.onChangeFn({ type: MODIFY_INSERT, index, count });
  }
}

function Block(id) {
  this.id = id;
}

function Component(fn, props) {
  this.fn = fn;
  this.props = props;
}

export function _createComponent(componentFunction, props) {
  return new Component(componentFunction, props);
}

export function _createBlock(blockTemplateId, anchors, eventHandlers, styleEffects) {
  return getActiveWindow()._createBlock3(blockTemplateId, anchors, eventHandlers, styleEffects);
}

export function createHandler(fn) {
  return getActiveWindow()._allocateHandler(fn);
}

let textDecoder = new TextDecoder();

const MARKERS_STRING = 1;
const MARKERS_NUMBER_INT16 = 3;
const MARKERS_NUMBER_INT32 = 4;
const MARKERS_NUMBER_FLOAT64 = 5;
const MARKERS_BOOLEAN = 6;
const MARKERS_ARRAY = 8;
const MARKERS_OBJECT = 9;
const MARKERS_ARRAY_BUFFER = 10;

function senimanDecode(buffer) {
  let stringBufferLength = buffer.readUint16LE(0);
  let stringBuffer;

  if (stringBufferLength > 0) {
    stringBuffer = textDecoder.decode(buffer.subarray(2, 2 + stringBufferLength));
  }

  let position = 2 + stringBufferLength;

  function decodeValue() {
    let marker = buffer[position++];

    switch (marker) {
      case MARKERS_ARRAY: {
        let length = buffer[position++];

        // create array of a certain length
        let arr = new Array(length);

        for (let i = 0; i < length; i++) {
          arr[i] = decodeValue();
        }
        return arr;
      }
      case MARKERS_STRING: {
        // read the offset of the string in the string buffer
        let offset = buffer.readUint16LE(position);
        position += 2;

        // read the length of the string
        let length = buffer.readUint16LE(position);
        position += 2;

        // read the string from the string buffer
        return stringBuffer.slice(offset, offset + length);
      }
      case MARKERS_NUMBER_INT16: {
        // read uint8
        let value = buffer.readInt16LE(position);
        position += 2;
        return value;
      }

      case MARKERS_NUMBER_INT32: {
        let value = buffer.readInt32LE(position);
        position += 4;
        return value;
      }

      case MARKERS_NUMBER_FLOAT64: {
        let value = buffer.readDoubleLE(position);
        position += 8;
        return value;
      }
      case MARKERS_BOOLEAN: {
        return !!buffer[position++];
      }
      case MARKERS_OBJECT: {
        let length = buffer[position++];
        let obj = {};

        for (let i = 0; i < length; i++) {
          // read the offset of the string in the string buffer
          let offset = buffer.readUint16LE(position);
          position += 2;

          // read the length of the string
          let length = buffer.readUint16LE(position);
          position += 2;

          // read the string from the string buffer
          let key = stringBuffer.slice(offset, offset + length);

          obj[key] = decodeValue();
        }
        return obj;
      }
      case MARKERS_ARRAY_BUFFER: {
        // read the length of the array buffer
        let length = buffer.readUint16LE(position);
        position += 2;

        let value = buffer.subarray(position, position + length);
        position += length;

        return value;
      }
      default:
        throw new Error("Unknown marker");
    }
  }

  return decodeValue();
}
