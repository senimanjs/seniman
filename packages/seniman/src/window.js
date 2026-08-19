import { Buffer } from 'node:buffer';
import { useState, useEffect, useDisposableEffect, onCleanup, untrack, useMemo, createContext, useContext, getActiveNode, getActiveWindow, useCallback, onDispose, getActiveScope, runInScope, runInWindow } from './state.js';
import { clientFunctionDefinitions, streamBlockTemplateInstall } from './declare.js';
import { bufferPool, STANDARD_PAGE_SIZE } from './buffer-pool.js';
import { DefaultErrorHandler } from './errors.js';
import { HeadContext, createHeadContextValue } from './head.js';
import { DefaultNetworkStatusView } from './network.js';
import { Sequence } from './sequence.js';

export function useWindow() {
  return useClient();
}

export function useClient() {
  return getActiveWindow().clientContext;
}

const camelCaseToKebabCaseRegex = /([a-z0-9])([A-Z])/g;

// TODO: have the compiler refer to this map
const eventTypeNameMap = {
  1: 'click',
  2: 'focus',
  3: 'blur',
  4: 'change',
  5: 'scroll',
  6: 'keydown',
  7: 'keyup',
  8: 'mouseenter',
  9: 'mouseleave',
  10: 'load',
  11: 'unload',
  12: 'dragstart',
  13: 'drag',
  14: 'dragend',
  15: 'dragenter',
  16: 'dragleave',
  17: 'dragover',
  18: 'drop',
  19: 'contextmenu',
  20: 'mousemove',
  21: 'mousedown',
  22: 'mouseup',
  23: 'submit',
  24: 'paste',
  25: 'wheel',
};

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


function createNoArgClientFunction(fn) {
  return $c(() => {
    $s(fn)();
  });
}

function BackButtonListener(props) {
  let client = useClient();
  let onPopState = createHandler((hrefString) => {
    props.onBackButton(hrefString);
  });

  client.exec($c(() => {
    window.addEventListener('popstate', () => {
      $s(onPopState)(location.href);
    });
  }));
}

function ViewportListener(props) {
  let client = useClient();
  let onViewportChange = createHandler((
    layoutWidth,
    layoutHeight,
    visualWidth,
    visualHeight,
    offsetLeft,
    offsetTop,
    scale
  ) => {
    props.onViewportChange({
      layout: { width: layoutWidth, height: layoutHeight },
      visual: {
        width: visualWidth,
        height: visualHeight,
        offsetLeft,
        offsetTop,
        scale,
      },
    });
  });

  client.exec($c(() => {
    let frame = 0;
    let lastViewportState = '';
    let reportViewportState = () => {
      frame = 0;
      let viewport = window.visualViewport;
      let layoutWidth = Math.floor(window.innerWidth);
      let layoutHeight = Math.floor(window.innerHeight);
      let visualWidth = viewport ? viewport.width : layoutWidth;
      let visualHeight = viewport ? viewport.height : layoutHeight;
      let offsetLeft = viewport ? viewport.offsetLeft : 0;
      let offsetTop = viewport ? viewport.offsetTop : 0;
      let scale = viewport ? viewport.scale : 1;
      let viewportState = [
        layoutWidth,
        layoutHeight,
        visualWidth,
        visualHeight,
        offsetLeft,
        offsetTop,
        scale,
      ].join(':');

      if (viewportState === lastViewportState) {
        return;
      }
      lastViewportState = viewportState;
      $s(onViewportChange)(
        layoutWidth,
        layoutHeight,
        visualWidth,
        visualHeight,
        offsetLeft,
        offsetTop,
        scale
      );
    };
    let scheduleViewportReport = () => {
      if (!frame) {
        frame = requestAnimationFrame(reportViewportState);
      }
    };

    window.addEventListener('resize', scheduleViewportReport, {
      passive: true
    });
    window.visualViewport && window.visualViewport.addEventListener(
      'resize',
      scheduleViewportReport,
      { passive: true }
    );
    window.visualViewport && window.visualViewport.addEventListener(
      'scroll',
      scheduleViewportReport,
      { passive: true }
    );
    reportViewportState();
  }));
}

//let CMD_PING = 0;
//let CMD_INSTALL_TEMPLATE = 1;

const CMD_INIT_WINDOW = 2;
const CMD_ATTACH_ANCHOR = 3;
const CMD_ATTACH_REF = 4;
const CMD_ATTACH_EVENT_V2 = 5;
const CMD_INSTALL_EVENT_TYPE = 6;
const CMD_ELEMENT_UPDATE = 7;
const CMD_INIT_BLOCK = 8;
const CMD_REMOVE_BLOCKS = 9;
const CMD_INSTALL_CLIENT_FUNCTION = 10;
const CMD_RUN_CLIENT_FUNCTION = 11;
const CMD_INIT_SEQUENCE = 13;
const CMD_MODIFY_SEQUENCE = 14;
const CMD_CHANNEL_MESSAGE = 15;
const CMD_INIT_MODULE = 16;
const CMD_RUN_LIFECYCLE = 17;
const CMD_SEQUENCE_INSERT_ITEMS = 18;
const CMD_SEQUENCE_REMOVE_ITEMS = 19;

const pingBuffer = Buffer.from([0]);
const emptyBuffer = Buffer.alloc(0);
const DELETE_BLOCK_BUFFER_SIZE = 2048;
const MAX_BLOCK_ID = 0x7fff;

function uvarintSize(value) {
  let size = 1;
  while (value >= 0x80) {
    value = Math.floor(value / 0x80);
    size++;
  }
  return size;
}

function writeUvarint(buffer, value, offset) {
  do {
    let byte = value % 0x80;
    value = Math.floor(value / 0x80);
    buffer.writeUInt8(value ? byte | 0x80 : byte, offset++);
  } while (value);
  return offset;
}

class BufferWriter {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  writeUInt8(value) {
    this.buffer?.writeUInt8(value, this.offset);
    this.offset++;
  }

  writeUInt16BE(value) {
    this.buffer?.writeUInt16BE(value, this.offset);
    this.offset += 2;
  }

  writeInt16BE(value) {
    this.buffer?.writeInt16BE(value, this.offset);
    this.offset += 2;
  }

  writeInt32BE(value) {
    this.buffer?.writeInt32BE(value, this.offset);
    this.offset += 4;
  }

  writeDoubleBE(value) {
    this.buffer?.writeDoubleBE(value, this.offset);
    this.offset += 8;
  }

  writeString(value) {
    let length = Buffer.byteLength(value);
    this.buffer?.write(value, this.offset, length);
    this.offset += length;
  }

  writeBuffer(value) {
    if (this.buffer) {
      value.copy(this.buffer, this.offset);
    }
    this.offset += value.length;
  }
}

let _allocatedWindowId = 1;

export class Window {

  constructor(windowManager, pageParams, auxContext, rootFn, bufferFn) {
    this.windowManager = windowManager;

    this.pageParams = pageParams;
    this.auxContext = auxContext;

    this.id = _allocatedWindowId++;

    this.destroyFnCallback = null;
    this.connected = true;
    this.rootFn = rootFn;

    this.pages = [];
    this.global_readOffset = 0;
    this.global_writeOffset = 0;
    this.mutationGroup = null;

    this.bufferFn = bufferFn;

    this._streamInitWindow();

    this.latestBlockId = 10;
    this.freeBlockIds = new Uint16Array(MAX_BLOCK_ID + 1);
    this.freeBlockIdCount = 0;

    // reuse the same buffer for all block delete commands
    this.deleteBlockCommandBuffer = Buffer.alloc(DELETE_BLOCK_BUFFER_SIZE * 2);
    this.deleteBlockCount = 0;
    this.deleteBlockFlushTimer = null;
    this.destroyed = false;

    this.clientTemplateInstallationSet = new Set();
    this.clientFunctionInstallationSet = new Set();
    this.clientEventTypeInstallationSet = new Set();
    this.clientModuleInstallationSet = new Set();

    // effects are even-ID'd nodes -- memos are odd-ID'd nodes
    this.lastReadableId = 1; // memos & states
    this.lastEffectId = 2;

    this.lastEventHandlerId = 0;
    this.lastRefId = 0;
    this.lastChannelId = 0;

    this.eventHandlers = new Map();

    this.blockOnMountFns = new Map();

    this.tokenList = new Map();
    // fill out the 0 index to make it easier for templating system to do 1-indexing
    this.tokenList.set('', 0);

    this.lastPongTime = Date.now();

    this.clientContext = null;

    this.reconnectionId = 1;
  }

  start() {
    runInWindow(this.id, () => {
      this._start();
    });
  }

  _start() {
    let {
      href,
      viewportSize,
      cookieString } = this.pageParams;

    let url = new URL(href);

    let rootFn = this.rootFn;

    this.rootDisposer = useDisposableEffect(() => {
      let [getCookie, setCookie] = useState(cookieString);
      let [viewportSizeSignal, setViewportSize] = useState({ width: viewportSize[0], height: viewportSize[1] });
      let [visualViewportSignal, setVisualViewport] = useState(null);
      let [shouldSendPostScript, setShouldSendPostScript] = useState(false);
      let [locationUrl, setLocationUrl] = useState(url);

      function _makeUrl(hrefString) {
        let url;

        // TODO: handle relative non-/-prefixed?
        if (hrefString.startsWith('/')) {
          url = new URL(hrefString, location.origin);
        } else {
          url = new URL(hrefString);
        }
        return url;
      }

      function _pushState(url) {
        clientContext.exec($c(() => {
          window.history.pushState({}, '', $s(url.href));
        }));

        setLocationUrl(url);
      }

      function _replaceState(url) {
        clientContext.exec($c(() => {
          window.history.replaceState({}, '', $s(url.href));
        }));

        setLocationUrl(url);
      }

      let history = {
        pushState: (hrefString) => {
          let url = _makeUrl(hrefString);

          if (url.origin !== location.origin) {
            throw new Error(`history.pushState() can only be used to navigate within the same origin. Use location.setHref() to navigate to a different origin.`);
          }

          _pushState(url);
        },

        replaceState: (hrefString) => {
          let url = _makeUrl(hrefString);

          if (url.origin !== location.origin) {
            throw new Error(`history.replaceState() can only be used to navigate within the same origin. Use location.setHref() to navigate to a different origin.`);
          }

          _replaceState(url);
        }
      };

      let location = {

        host: url.host,
        hostname: url.hostname,
        origin: url.origin,
        protocol: url.protocol,
        port: url.port,

        href: useMemo(() => {
          return locationUrl().href;
        }),
        pathname: useMemo(() => {
          return locationUrl().pathname;
        }),
        search: useMemo(() => {
          return locationUrl().search;
        }),
        searchParams: useMemo(() => {
          return locationUrl().searchParams;
        }),
        setHref: (hrefString) => {
          let url = _makeUrl(hrefString);

          // if the hostname is different to the initial (unchangeable) hostname,
          // then execute a client-side href change
          if (url.origin !== location.origin) {
            clientContext.exec($c(() => {
              window.location.href = $s(hrefString);
            }));
          } else {
            _pushState(url);
          }
        }
      };

      let clientContext = {
        viewportSize: viewportSizeSignal,
        visualViewport: visualViewportSignal,

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

        history,
        location,

        // compatibility with old API 
        path: () => {
          // console.warn('client.path() is deprecated. Use client.location.pathname() instead. See: https://seniman.dev/docs/client');
          return location.pathname();
        },
        navigate: (href) => {
          // console.warn('client.navigate() is deprecated. Use client.history.pushState() instead. See: https://seniman.dev/docs/client');
          location.setHref(href);
        },

        exec: (clientFnSpec) => {
          if (this.destroyed) {
            return;
          }

          let { clientFnId, serverBindFns } = clientFnSpec;

          // if the serverBindFns value is a function, it means it's the new compiler output
          // we need to run untrack() on it to get the actual serverBindFns value at this point of execution
          if (serverBindFns instanceof Function) {
            serverBindFns = untrack(() => serverBindFns());
          }

          this._streamFunctionInstallCommand(clientFnId);
          this._streamModuleInstallCommand(serverBindFns);

          let writer = this._allocServerBoundCommand(3, serverBindFns || []);
          writer.writeUInt8(CMD_RUN_CLIENT_FUNCTION);
          writer.writeUInt16BE(clientFnId);
          this._writeServerBoundValues(writer, serverBindFns || []);
        }
      };

      this.clientContext = clientContext;

      let onBackButton = (hrefString) => {
        setLocationUrl(new URL(hrefString));
      }

      let onViewportChange = ({ layout, visual }) => {
        let currentLayout = viewportSizeSignal();
        if (
          currentLayout.width !== layout.width ||
          currentLayout.height !== layout.height
        ) {
          setViewportSize(layout);
        }

        let currentVisual = visualViewportSignal();
        if (
          !currentVisual ||
          currentVisual.width !== visual.width ||
          currentVisual.height !== visual.height ||
          currentVisual.offsetLeft !== visual.offsetLeft ||
          currentVisual.offsetTop !== visual.offsetTop ||
          currentVisual.scale !== visual.scale
        ) {
          setVisualViewport(visual);
        }
      }

      let headSequence = createSequence();

      let rootContext ={
        [HeadContext.id]: createHeadContextValue(headSequence)
      };
      
      if (this.auxContext) {
        Object.assign(rootContext, this.auxContext);
      }

      getActiveNode().context = rootContext;

      this._attach(1, 0, headSequence);

      this._attach(2, 0,
        <DefaultErrorHandler>
          {rootFn}
          <BackButtonListener onBackButton={onBackButton} />
          <ViewportListener onViewportChange={onViewportChange} />
          {shouldSendPostScript() ? <DefaultNetworkStatusView /> : null}
        </DefaultErrorHandler>
      );

      this.postScriptTimeout = setTimeout(() => {
        setShouldSendPostScript(true);
      }, 1000);
    }, null);
  }

  startPingLoop(immediateFire) {
    let reconnectionId = ++this.reconnectionId;

    let _pingFunction = function pingFunction() {
      if (reconnectionId != this.reconnectionId) {
        return;
      }

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

      if (this.deleteBlockCount > 300) {
        this.flushBlockDeleteQueue();
      }

      setTimeout(_pingFunction, 2500);
    }.bind(this);

    if (immediateFire) {
      _pingFunction();
    } else {
      setTimeout(_pingFunction, 2500);
    }
  }

  _streamModuleInstallCommand(serverBoundValues) {

    // look through the server bound values and see if there are any modules that need to be installed
    let length = (serverBoundValues || []).length;

    for (let i = 0; i < length; i++) {
      let serverBoundValue = serverBoundValues[i];

      if (serverBoundValue && serverBoundValue.type === 'module') {
        let moduleId = serverBoundValue.id;

        // check if the module is not an internal module (moduleId >= 10) and if it has not been installed yet
        if (moduleId >= 10 && !this.clientModuleInstallationSet.has(moduleId)) {
          let moduleId = serverBoundValue.id;
          this.clientModuleInstallationSet.add(moduleId);

          let clientFn = serverBoundValue.clientFn;
          this._streamFunctionInstallCommand(clientFn.clientFnId);

          let serverBindFns = clientFn.serverBindFns;

          if (serverBindFns instanceof Function) {
            serverBindFns = untrack(() => serverBindFns());
          }

          // recursively stream the module install command (module can have other module dependencies)
          // TODO: handle circular dependencies & max depth?
          this._streamModuleInstallCommand(serverBindFns);

          // stream the module install command
          let writer = this._allocServerBoundCommand(5, serverBindFns || []);
          writer.writeUInt8(CMD_INIT_MODULE);
          writer.writeUInt16BE(moduleId);
          writer.writeUInt16BE(clientFn.clientFnId);
          this._writeServerBoundValues(writer, serverBindFns || []);
        }
      }
    }
  }

  onBuffer(bufferFn) {
    if (this.destroyed) {
      return;
    }
    this.bufferFn = bufferFn;
  }

  flushCommandBuffer() {
    this._flushMutationGroup();
  }

  sendPing() {
    if (!this.destroyed) {
      this.bufferFn(pingBuffer);
    }
  }

  _handleBlockCleanup(blockId) {
    if (this.destroyed) {
      return;
    }

    // if the buffer is full, send it
    if (this.deleteBlockCount == DELETE_BLOCK_BUFFER_SIZE) {
      this.emergencyFlushBlockDeleteQueue();
    }

    this.deleteBlockCommandBuffer.writeUInt16BE(blockId, this.deleteBlockCount * 2);
    this.deleteBlockCount++;

    if (this.deleteBlockFlushTimer === null) {
      this.deleteBlockFlushTimer = setTimeout(() => {
        this.deleteBlockFlushTimer = null;
        this.flushBlockDeleteQueue();
      }, 0);
    }
  }

  _recycleBlockIds(buffer, count) {
    for (let index = 0; index < count; index++) {
      let blockId = buffer.readUInt16BE(index * 2);

      if (blockId <= 10 || blockId > MAX_BLOCK_ID) {
        throw new Error(`Cannot recycle invalid Seniman block ID ${blockId}`);
      }

      if (this.freeBlockIdCount >= this.freeBlockIds.length) {
        throw new Error('Seniman block ID free pool overflow');
      }

      this.freeBlockIds[this.freeBlockIdCount] = blockId;
      this.freeBlockIdCount++;
    }
  }

  emergencyFlushBlockDeleteQueue() {
    let tempBuffer = Buffer.alloc(DELETE_BLOCK_BUFFER_SIZE * 2);
    let deleteBlockCount = this.deleteBlockCount;
    this.deleteBlockCommandBuffer.copy(tempBuffer, 0, 0, this.deleteBlockCount * 2);

    // Schedule to send the delete block command after the tick
    // Note: we needed to do delay sending out the delete message to the browser
    // because the browser may still need the reference to the block during cleanNode() to insert the replacement block.
    // Doing the block delete flush too early will cause the browser to lose reference
    // This could happen if the element tree is large & update rate is high that the delete buffer gets filled up before
    // the ping loop automatically flushes it
    // TODO: introduce custom delete buffer size so apps that need it can increase it to avoid this path
    setTimeout(() => {
      if (this.destroyed) {
        return;
      }

      let buf = this._allocCommandBuffer(1 + 2 * deleteBlockCount + 2);

      buf.writeUInt8(CMD_REMOVE_BLOCKS, 0);

      // copy over the block ids
      tempBuffer.copy(buf, 1, 0, deleteBlockCount * 2);

      // write the end marker
      buf.writeUInt16BE(0, 1 + 2 * deleteBlockCount);

      this._recycleBlockIds(tempBuffer, deleteBlockCount);
    }, 0);

    this.deleteBlockCount = 0;
  }

  flushBlockDeleteQueue() {
    if (this.destroyed) {
      this.deleteBlockCount = 0;
      return;
    }

    let deleteBlockCount = this.deleteBlockCount;
    if (deleteBlockCount === 0) {
      return;
    }

    let buf = this._allocCommandBuffer(1 + 2 * deleteBlockCount + 2);

    buf.writeUInt8(CMD_REMOVE_BLOCKS, 0);

    // copy over the block ids
    this.deleteBlockCommandBuffer.copy(buf, 1, 0, deleteBlockCount * 2);

    // write the end marker
    buf.writeUInt16BE(0, 1 + 2 * deleteBlockCount);

    this.deleteBlockCount = 0;
    this._recycleBlockIds(this.deleteBlockCommandBuffer, deleteBlockCount);
  }

  registerPong(pongBuffer) {
    if (this.destroyed) {
      return;
    }

    this.lastPongTime = Date.now();
    this.connected = true;

    let readOffset = senimanDecode(pongBuffer.subarray(2))[0];

    if (readOffset == 0) {
      setTimeout(() => {
        // reconnectionId prop is set to 0 after the window is destroyed through the ping loop
        if (this.reconnectionId != 0) {
          this.destroy();
        }
      }, 1000);
    } else {
      this.registerReadOffset(readOffset);
    }
  }

  registerReadOffset(readOffset) {
    if (this.destroyed) {
      return;
    }

    // TODO: check against writeOffset to make sure we're not reading ahead
    if (readOffset < this.global_readOffset) {
      throw new Error(`Invalid offset: ${readOffset} : ${this.global_readOffset}`);
    }

    this.global_readOffset = readOffset;

    // free unused pages
    while (true) {
      let page = this.pages[0];

      if (!page) {
        break;
      }

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
    if (this.destroyed) {
      return;
    }

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
    if (this.destroyed) {
      return;
    }

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

  processInput(inputBuffer) {
    if (this.destroyed) {
      return;
    }

    let txPortId = inputBuffer.readUInt16LE(0);

    if (!this.eventHandlers.has(txPortId)) {
      return;
    }

    let handler = this.eventHandlers.get(txPortId);
    let argsList = senimanDecode(inputBuffer.subarray(2));

    handler.apply(null, argsList);
  }

  onDestroy(fn) {
    this.destroyFnCallback = fn;
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.connected = false;
    this.reconnectionId = 0;

    clearTimeout(this.deleteBlockFlushTimer);
    this.deleteBlockFlushTimer = null;
    this.rootDisposer();

    // give time for the root disposer tree to complete run
    setTimeout(() => {
      let destroyFnCallback = this.destroyFnCallback;
      this.destroyFnCallback = null;
      destroyFnCallback?.();
    }, 10);

    clearTimeout(this.postScriptTimeout);

    this.mutationGroup = null;

    // A websocket send may still reference an unacknowledged buffer. Only
    // recycle pages the client has confirmed; leave the rest to Node.
    this.pages.forEach(page => {
      let pageEndOffset = page.finalSize > 0
        ? page.global_headOffset + page.finalSize
        : this.global_writeOffset;

      if (pageEndOffset <= this.global_readOffset) {
        bufferPool.returnBuffer(page.buffer);
      }
    });
    this.pages = [];
    this.bufferFn = null;
  }

  _allocPage(headOffset, pageSize) {

    let page = {
      global_headOffset: headOffset,
      buffer: bufferPool.alloc(pageSize),
      finalSize: 0
    };

    this.pages.push(page);

    return page;
  }

  _flushMutationGroup() {
    if (this.destroyed) {
      this.mutationGroup = null;
      return;
    }

    let mg = this.mutationGroup;

    if (this.connected && mg && ((this.global_writeOffset - mg.pageStartOffset) > 0)) {

      let buffer = mg.page.buffer;
      let offset = mg.pageStartOffset - mg.page.global_headOffset;
      let size = this.global_writeOffset - mg.pageStartOffset;

      this.bufferFn(buffer.subarray(offset, offset + size));
    }

    if (mg && mg.page.buffer.length > STANDARD_PAGE_SIZE) {
      mg.page.finalSize = this.global_writeOffset - mg.page.global_headOffset;
    }

    this.mutationGroup = null;
  }

  _allocCommandBuffer(size) {
    if (this.destroyed) {
      throw new Error('Cannot write a client command after the window has been destroyed');
    }

    let pageSize = bufferPool.getPageSize(size);

    // if the command buffer hasn't been initialized after the last flush, let's initialize it
    if (!this.mutationGroup) {
      let pageCount = this.pages.length;
      let lastPage = this.pages[pageCount - 1];
      let page = !lastPage || lastPage.finalSize > 0
        ? this._allocPage(this.global_writeOffset, pageSize)
        : lastPage;

      this.mutationGroup = {
        page,
        pageStartOffset: this.global_writeOffset,
      };

      queueMicrotask(() => {
        this._flushMutationGroup();
      });
    }

    let mg = this.mutationGroup;

    let currentPageOffset = this.global_writeOffset - mg.page.global_headOffset;

    // if we're about to overflow the current page, let's allocate a new one
    if ((currentPageOffset + size) > mg.page.buffer.length) {
      let page = mg.page;
      page.finalSize = currentPageOffset;

      this._flushMutationGroup();

      let newPage = this._allocPage(this.global_writeOffset, pageSize);

      mg = this.mutationGroup = {
        page: newPage,
        pageStartOffset: this.global_writeOffset
      };

      currentPageOffset = 0;
    }

    this.global_writeOffset += size;

    return mg.page.buffer.subarray(currentPageOffset, currentPageOffset + size);
  }

  _streamInitWindow() {
    let buf = this._allocCommandBuffer(1 + 21)
    buf.writeUInt8(CMD_INIT_WINDOW, 0);
    buf.write(this.pageParams.windowId, 1, 21);
  }

  _streamInstallEventTypeCommand(eventType) {
    // translate the eventType int to a string
    let eventName = eventTypeNameMap[eventType];
    let buf = this._allocCommandBuffer(1 + 1 + 1 + eventName.length);

    buf.writeUInt8(CMD_INSTALL_EVENT_TYPE, 0);
    buf.writeUInt8(eventType, 1);
    buf.writeUInt8(eventName.length, 2);
    buf.write(eventName, 3, eventName.length);

    this.clientEventTypeInstallationSet.add(eventType);
  }


  _writeServerBoundValues(writer, serverBindFns) {

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
    const ARGTYPE_REF = 10;
    const ARGTYPE_CHANNEL = 11;
    const ARGTYPE_MODULE = 12;
    const ARGTYPE_ARRAY_BUFFER = 13;

    serverBindFns = serverBindFns || [];

    let argsCount = serverBindFns.length;

    writer.writeUInt8(argsCount);

    function encodeValue(arg) {

      // throw error if arg is a function
      if (typeof arg === 'function') {
        throw new Error('Starting from Seniman v0.0.90, referring to a function in a $s(fn) call within a custom $c function requires wrapping the function in a createHandler(fn) call.');
      }

      // check if arg is string, number, boolean, object, null, a callback, or a channel
      if (typeof arg === 'string') {
        writer.writeUInt8(ARGTYPE_STRING);

        let str = arg;
        let strLen = Buffer.byteLength(str);

        writer.writeUInt16BE(strLen);
        writer.writeString(str);
      } else if (typeof arg === 'number') {
        let isInt = Number.isInteger(arg);

        if (isInt && Math.abs(arg) < 32768) {
          writer.writeUInt8(ARGTYPE_INT16);
          writer.writeInt16BE(arg);
        } else if (isInt) {
          writer.writeUInt8(ARGTYPE_INT32);
          writer.writeInt32BE(arg);
        } else {
          writer.writeUInt8(ARGTYPE_FLOAT64);
          writer.writeDoubleBE(arg);
        }
      } else if (typeof arg === 'boolean') {
        writer.writeUInt8(ARGTYPE_BOOLEAN);
        writer.writeUInt8(arg ? 1 : 0);
      } else if (arg === null || arg === undefined) {
        writer.writeUInt8(ARGTYPE_NULL);
      } else if (arg.type == 'handler') {
        writer.writeUInt8(ARGTYPE_HANDLER);
        writer.writeUInt16BE(arg.id);
      } else if (arg.type == 'ref') {
        writer.writeUInt8(ARGTYPE_REF);
        writer.writeUInt16BE(arg.id);
      } else if (arg.type == 'channel') {
        writer.writeUInt8(ARGTYPE_CHANNEL);
        writer.writeUInt16BE(arg.id);
      } else if (arg.type == 'module') {
        writer.writeUInt8(ARGTYPE_MODULE);
        writer.writeUInt16BE(arg.id);
      } else if (Array.isArray(arg)) {
        writer.writeUInt8(ARGTYPE_ARRAY);
        writer.writeUInt16BE(arg.length);

        for (let j = 0; j < arg.length; j++) {
          encodeValue(arg[j]);
        }
      } else if (arg instanceof Buffer) {

        if (arg.length > 65535) {
          throw new Error('Maximum length of ArrayBuffer to encode is 65535 bytes');
        }

        writer.writeUInt8(ARGTYPE_ARRAY_BUFFER);
        writer.writeUInt16BE(arg.length);
        writer.writeBuffer(arg);
      } else if (typeof arg === 'object') {
        writer.writeUInt8(ARGTYPE_OBJECT);

        let keys = Object.keys(arg);
        writer.writeUInt16BE(keys.length);

        for (let j = 0; j < keys.length; j++) {
          let key = keys[j];
          let keyLength = Buffer.byteLength(key);

          writer.writeUInt16BE(keyLength);
          writer.writeString(key);

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
  }

  _allocServerBoundCommand(prefixSize, serverBindFns) {
    let sizeWriter = new BufferWriter();
    this._writeServerBoundValues(sizeWriter, serverBindFns);
    return new BufferWriter(this._allocCommandBuffer(prefixSize + sizeWriter.offset));
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
      let serverBindFns = [cfDef.argNames, cfDef.body];
      let writer = this._allocServerBoundCommand(3, serverBindFns);
      writer.writeUInt8(CMD_INSTALL_CLIENT_FUNCTION);
      writer.writeUInt16BE(functionId);
      this._writeServerBoundValues(writer, serverBindFns);

      this.clientFunctionInstallationSet.add(functionId);
    }
  }

  _createBlockId() {
    if (this.freeBlockIdCount > 0) {
      this.freeBlockIdCount--;
      return this.freeBlockIds[this.freeBlockIdCount];
    }

    if (this.latestBlockId >= MAX_BLOCK_ID) {
      throw new Error(
        `Seniman block ID pool exhausted (${MAX_BLOCK_ID - 10} live or pending IDs)`
      );
    }

    this.latestBlockId++;
    return this.latestBlockId;
  }

  _streamBlockInitCommand2(blockId, blockTemplateIds) {
    let buf = this._allocCommandBuffer(1 + 2 + 2);

    buf.writeUInt8(CMD_INIT_BLOCK, 0);
    buf.writeUInt16BE(blockId, 1);
    buf.writeUInt16BE(blockTemplateIds, 3);
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

    buf2.writeUInt8(CMD_ATTACH_ANCHOR, 0);
    buf2.writeUInt16BE(blockId, 1);

    buf2.writeUInt16BE(anchorIndex, 3);

    if (textLength > 32677) {
      throw new Error();
    }

    buf2.writeUInt16BE(textLength, 5);
    textBuffer.copy(buf2, 7);
  }

  _streamAttachBlockCommand(parentBlockId, anchorIndex, blockId) {
    let buf2 = this._allocCommandBuffer(1 + 2 + 2 + 2);

    buf2.writeUInt8(CMD_ATTACH_ANCHOR, 0);
    buf2.writeUInt16BE(parentBlockId, 1);
    buf2.writeUInt16BE(anchorIndex, 3);

    let modifiedBlockId = blockId;

    buf2.writeUInt16BE(modifiedBlockId |= (1 << 15), 5);

    if (this.blockOnMountFns.has(blockId)) {
      let onMountFns = this.blockOnMountFns.get(blockId);

      for (let i = 0; i < onMountFns.length; i++) {
        let [targetId, clientFnId, serverBindFns] = onMountFns[i];

        if (serverBindFns instanceof Function) {
          serverBindFns = untrack(() => serverBindFns());
        }

        // Raw server functions captured by an onMount client function are
        // shorthand for lifecycle-owned handlers.
        if (Array.isArray(serverBindFns)) {
          serverBindFns = serverBindFns.map((value) =>
            typeof value === 'function'
              ? this._allocateHandler(value)
              : value
          );
        }

        this._streamFunctionInstallCommand(clientFnId);
        this._streamModuleInstallCommand(serverBindFns);
        this._streamRunLifecycleCommand(blockId, targetId, clientFnId, serverBindFns);
      }

      this.blockOnMountFns.delete(blockId);
    }
  }


  _handleRefs(blockId, elementRefs) {
    let refsCount = elementRefs.length;

    for (let i = 0; i < refsCount; i++) {
      let ref = elementRefs[i];

      this._streamAttachRefCommand(blockId, ref.targetId, ref.ref.id);
    }
  }

  _handleLifecycles(blockId, lifecycles) {
    let count = lifecycles.length;

    for (let i = 0; i < count; i++) {
      let { targetId, type, fn } = lifecycles[i];

      let clientFnId = fn.clientFnId;
      let serverBindFns = fn.serverBindFns;

      if (this.blockOnMountFns.has(blockId)) {
        this.blockOnMountFns.get(blockId).push([targetId, clientFnId, serverBindFns]);
      } else {
        this.blockOnMountFns.set(blockId, [[targetId, clientFnId, serverBindFns]]);
      }
    }
  }

  _streamAttachRefCommand(blockId, targetId, refId) {
    let buf = this._allocCommandBuffer(1 + 2 + 1 + 2);

    buf.writeUInt8(CMD_ATTACH_REF, 0);
    buf.writeUInt16BE(blockId, 1);
    buf.writeUInt8(targetId, 3);
    buf.writeUInt16BE(refId, 4);
  }

  _streamRunLifecycleCommand(blockId, targetId, clientFnId, serverBindFns) {
    let writer = this._allocServerBoundCommand(7, serverBindFns);
    writer.writeUInt8(CMD_RUN_LIFECYCLE);
    writer.writeUInt16BE(blockId);
    writer.writeUInt8(targetId);
    writer.writeUInt8(1); // type: ref || onMount
    writer.writeUInt16BE(clientFnId);
    this._writeServerBoundValues(writer, serverBindFns);
  }

  _handleBlockEventHandlers(newBlockId, eventHandlers) {
    let eventHandlersCount = eventHandlers.length;

    for (let i = 0; i < eventHandlersCount; i++) {
      let eventHandler = eventHandlers[i];
      let clientFnId;
      let serverBindFns;

      useEffect(() => {
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
          // TODO: still send something to the client to remove the event handler
          // in case there was an event handler previously
          return;
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

        // if the serverBindFns value is a function, it means it's the new compiler output
        // we need to run untrack() on it to get the actual serverBindFns value at this point of execution
        if (serverBindFns instanceof Function) {
          serverBindFns = untrack(() => serverBindFns());
        }

        // Raw server functions captured by a client event function are
        // shorthand for lifecycle-owned handlers.
        if (Array.isArray(serverBindFns)) {
          serverBindFns = serverBindFns.map((value) =>
            typeof value === 'function'
              ? this._allocateHandler(value)
              : value
          );
        }

        this._streamFunctionInstallCommand(clientFnId);
        this._streamModuleInstallCommand(serverBindFns);
        this._streamEventInitCommandV2(newBlockId, eventHandler.targetId, eventHandler.type, clientFnId, serverBindFns);
      });
    }
  }

  _streamEventInitCommandV2(blockId, targetId, eventType, clientFnId, serverBindFns) {

    // Ignore click (eventType = 1) since client handling is special
    if (eventType > 1 && !this.clientEventTypeInstallationSet.has(eventType)) {
      this._streamInstallEventTypeCommand(eventType);
    }

    let writer = this._allocServerBoundCommand(7, serverBindFns);
    writer.writeUInt8(CMD_ATTACH_EVENT_V2);
    writer.writeUInt16BE(blockId);
    writer.writeUInt8(targetId);
    writer.writeUInt8(eventType);
    writer.writeUInt16BE(clientFnId);
    this._writeServerBoundValues(writer, serverBindFns);
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

  _allocateRef() {
    this.lastRefId++;

    let refId = this.lastRefId;

    onCleanup(() => {
      //this.refs.delete(refId);
    });

    return {
      type: 'ref',
      id: refId
    };
  }

  _createChannel() {
    this.lastChannelId++;

    let channelId = this.lastChannelId;

    onCleanup(() => {
      //this.channels.delete(channelId);
    });

    return {
      type: 'channel',
      id: channelId,
      send: (value) => {
        if (!this.destroyed) {
          this._streamChannelSendMessageCommand(channelId, value);
        }
      }
    };
  }

  _streamChannelSendMessageCommand(channelId, value) {
    let serverBindFns = [value];
    let writer = this._allocServerBoundCommand(3, serverBindFns);
    writer.writeUInt8(CMD_CHANNEL_MESSAGE);
    writer.writeUInt16BE(channelId);
    this._writeServerBoundValues(writer, serverBindFns);
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
          let buf = this._allocCommandBuffer(1 + 2 + 1 + 1 + uvarintSize(propName) + 2 + propValue.length);

          buf.writeUInt8(CMD_ELEMENT_UPDATE, 0);
          buf.writeUInt16BE(blockId, 1);
          buf.writeUInt8(targetId, 3);
          buf.writeUInt8(mode, 4);

          let offset = writeUvarint(buf, propName, 5);

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
          const propertyPairs = [];
          let commandSize = 7;

          for (const key in styleProps) {
            const kebabCaseKey = camelCaseToKebabCase(key);
            let value = styleProps[key];

            if (value === undefined) {
              continue;
            } else if (typeof styleProps[key] == 'number') {
              value = value.toString();
            }

            let keyIndex = this.tokenList.get(kebabCaseKey);
            let valueIndex = this.tokenList.get(value);

            propertyPairs.push([kebabCaseKey, value, keyIndex, valueIndex]);
            commandSize += 4;
            commandSize += keyIndex ? 0 : Buffer.byteLength(kebabCaseKey);
            commandSize += valueIndex ? 0 : Buffer.byteLength(value);
          }

          let writer = new BufferWriter(this._allocCommandBuffer(commandSize));
          writer.writeUInt8(CMD_ELEMENT_UPDATE);
          writer.writeUInt16BE(blockId);
          writer.writeUInt8(targetId);
          writer.writeUInt8(UPDATE_MODE_MULTI_STYLEPROP);

          // first 16 bytes are either the length of the property key or the ID of the property key
          // in the static map if it exists there.
          for (let i = 0; i < propertyPairs.length; i++) {
            const [key, value, keyIndex, valueIndex] = propertyPairs[i];

            // TODO: add more logic to dynamically determine if we should add the current token to the static map
            if (keyIndex) {
              // set 16-th bit to 1 to denote that this is static map compression index
              // (stylePropertyKeyMap on the client)
              writer.writeUInt16BE(keyIndex | (1 << 15));
            } else {
              writer.writeUInt16BE(Buffer.byteLength(key));
              writer.writeString(key);
            }

            if (valueIndex) {
              writer.writeUInt16BE(valueIndex | (1 << 15));
            } else {
              writer.writeUInt16BE(Buffer.byteLength(value));
              writer.writeString(value);
            }
          }

          writer.writeUInt16BE(0);
        },

        removeAttribute: (propName) => {
          let tokenId = this._registerAttrKey(propName);
          let buf = this._allocCommandBuffer(1 + 2 + 1 + 1 + uvarintSize(tokenId));

          buf.writeUInt8(CMD_ELEMENT_UPDATE, 0);
          buf.writeUInt16BE(blockId, 1);
          buf.writeUInt8(targetId, 3);
          buf.writeUInt8(UPDATE_MODE_REMOVE_ATTR, 4);
          writeUvarint(buf, tokenId, 5);
        },

        setAttribute: (propName, propValue) => {
          if (typeof propValue != 'string') {
            if (!propValue) {
              elRef.removeAttribute(propName);
              return;
            } else {
              propValue = propValue.toString();
            }
          }

          let attrKey = this._registerAttrKey(propName);
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

    buf.writeUInt8(CMD_MODIFY_TOKENMAP, 0);
    buf.writeUInt8(tokenLength, 1);
    buf.write(tokenName, 2, tokenLength);
    buf.writeUInt8(0, 2 + tokenLength);
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
          this._attachListV3(blockId, anchorIndex, nodeResult);
          break;
        case Sequence:
          this._attachSequenceV2(blockId, anchorIndex, nodeResult);
          break;
        default:
          console.error('Unknown nodeResult', nodeResult);
      }
    }
  }

  _resolveNodeResult(nodeResult, onValue) {
    if (nodeResult && nodeResult.constructor === Component) {
      useEffect(() => {
        this._resolveNodeResult(
          nodeResult.fn(nodeResult.props),
          onValue
        );
      });
      return;
    }

    if (nodeResult instanceof Function) {
      useEffect(() => {
        this._resolveNodeResult(nodeResult(), onValue);
      });
      return;
    }

    onValue(nodeResult);
  }

  _createBlock3(blockTemplateId, anchors, eventHandlers, elementEffects, elementRefs, lifecycles) {

    let newBlockId = this._createBlockId();

    this._streamTemplateInstallCommand(blockTemplateId);
    this._streamBlockInitCommand2(newBlockId, blockTemplateId);

    eventHandlers && this._handleBlockEventHandlers(newBlockId, eventHandlers);
    elementEffects && this._handleElementEffects(newBlockId, elementEffects);
    elementRefs && this._handleRefs(newBlockId, elementRefs);
    lifecycles && this._handleLifecycles(newBlockId, lifecycles);

    anchors && anchors.map((anchorNodeResult, anchorIndex) => {
      this._attach(newBlockId, anchorIndex, anchorNodeResult);
    });

    onDispose(() => {
      this._handleBlockCleanup(newBlockId);
    });

    return new Block(newBlockId);
  }

  _createSequence2() {
    let newSeqId = this._createBlockId();
    let sequence = new Sequence(newSeqId);

    sequence.onChange(useCallback(change => {

      switch (change.type) {
        case MODIFY_REMOVE:
          this._remove_sequenceItems(sequence, change.index, change.count);
          break;
        case MODIFY_INSERT:
          this._insert_sequenceItems(sequence, change.startIndex, change.startItemId, change.nodes);
          break;
      }
    }));

    // stream the sequence initialization command
    // CMD + BLOCK_ID
    let bufferLength = 1 + 2;

    let buf = this._allocCommandBuffer(bufferLength);

    buf.writeUInt8(CMD_INIT_SEQUENCE, 0);
    buf.writeUInt16BE(newSeqId, 1);

    onDispose(() => {
      this._handleBlockCleanup(newSeqId);
    });

    return sequence;
  }

  _attachListV3(blockId, anchorIndex, list) {

    let sequence = this._createSequence2();
    this._attachSequenceV2(blockId, anchorIndex, sequence);

    sequence.push(...list);
  }

  _attachSequenceV2(blockId, anchorIndex, sequence) {
    this._streamAttachBlockCommand(blockId, anchorIndex, sequence.id);
  }

  _remove_sequenceItems(sequence, startIndex, count) {
    let seqId = sequence.id;

    let buf = this._allocCommandBuffer(1 + 2 + 2 + 2);

    buf.writeUInt8(CMD_SEQUENCE_REMOVE_ITEMS, 0);
    buf.writeUInt16BE(seqId, 1);
    buf.writeUInt16BE(startIndex, 3);
    buf.writeUInt16BE(count, 5);
  }

  _insert_sequenceItems(sequence, startIndex, startItemId, nodeResults) {

    let sequenceId = sequence.id;
    let encodedItems = [];
    let commandSize = 7;
    let disposeFns = [];

    for (let i = 0; i < nodeResults.length; i++) {
      let nodeResult = nodeResults[i];
      let itemId = startItemId + i;
      let disposeFn = null;
      let encodedItem;

      if (typeof nodeResult == 'string') {
        encodedItem = Buffer.from(nodeResult);
      } else if (typeof nodeResult == 'number') {
        encodedItem = Buffer.from(nodeResult.toString());
      } else if (!nodeResult) {
        encodedItem = emptyBuffer;
      } else {
        switch (nodeResult.constructor) {
          case Block:
            encodedItem = nodeResult.id | (1 << 15);
            // TODO: handle manually removing the block on removal
            break;
          case Component: {
            // append an empty textnode at the component's index -- the next scheduler loop will then replace it with the actual component
            encodedItem = emptyBuffer;

            disposeFn = useDisposableEffect(() => {
              this._attach(sequenceId, itemId, nodeResult.fn(nodeResult.props));
            });
            break;
          }
          case Function: {
            // append and empty textnode at the function's index -- the next scheduler loop will then replace it with the actual function result
            encodedItem = emptyBuffer;

            disposeFn = useDisposableEffect(() => {
              let value = nodeResult();
              this._attach(sequenceId, itemId, value);
            });
            break;
          }
          case Array:
            throw new Error('Sequence within a sequence is not supported yet');
            //this._attachList_blockAnchor(blockId, anchorIndex, nodeResult);
            break;
          case Sequence:
            throw new Error('Sequence within a sequence is not supported yet');
            // this._attachSequence_blockAnchor(blockId, anchorIndex, nodeResult);
            break;
          default:
            console.error('Unknown nodeResult', nodeResult);
        }
      }

      if (encodedItem instanceof Buffer) {
        if (encodedItem.length > 0x7fff) {
          throw new Error('Sequence text items cannot exceed 32767 bytes');
        }
        commandSize += 2 + encodedItem.length;
      } else {
        commandSize += 2;
      }

      encodedItems.push(encodedItem);
      disposeFns.push(disposeFn);
    }

    sequence.registerDisposeFns(startIndex, disposeFns);

    let writer = new BufferWriter(this._allocCommandBuffer(commandSize));
    writer.writeUInt8(CMD_SEQUENCE_INSERT_ITEMS);
    writer.writeUInt16BE(sequenceId);
    writer.writeUInt16BE(startIndex);
    writer.writeUInt16BE(nodeResults.length);

    for (let encodedItem of encodedItems) {
      if (encodedItem instanceof Buffer) {
        writer.writeUInt16BE(encodedItem.length);
        writer.writeBuffer(encodedItem);
      } else {
        writer.writeUInt16BE(encodedItem);
      }
    }
  }
}

const MODIFY_INSERT = 3;
const MODIFY_REMOVE = 4;
const MODIFY_SWAP = 6;

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

export function _resolveNodeResult(nodeResult, onValue) {
  return getActiveWindow()._resolveNodeResult(nodeResult, onValue);
}

export function _createBlock(blockTemplateId, anchors, eventHandlers, styleEffects, refs, lifecycles) {
  return getActiveWindow()._createBlock3(blockTemplateId, anchors, eventHandlers, styleEffects, refs, lifecycles);
}

export function createSequence(items) {
  return getActiveWindow()._createSequence2(items);
}

export function createHandler(fn) {
  return getActiveWindow()._allocateHandler(fn);
}

export function createRef() {
  return getActiveWindow()._allocateRef();
}

export function createChannel() {
  return getActiveWindow()._createChannel();
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
  let stringBufferLength = buffer.readUInt16LE(0);
  let stringBuffer;

  if (stringBufferLength > 0) {
    stringBuffer = textDecoder.decode(buffer.subarray(2, 2 + stringBufferLength));
  } else {
    stringBuffer = '';
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
        let offset = buffer.readUInt16LE(position);
        position += 2;

        // read the length of the string
        let length = buffer.readUInt16LE(position);
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
          let offset = buffer.readUInt16LE(position);
          position += 2;

          // read the length of the string
          let length = buffer.readUInt16LE(position);
          position += 2;

          // read the string from the string buffer
          let key = stringBuffer.slice(offset, offset + length);

          obj[key] = decodeValue();
        }
        return obj;
      }
      case MARKERS_ARRAY_BUFFER: {
        // read the length of the array buffer
        let length = buffer.readUInt16LE(position);
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
