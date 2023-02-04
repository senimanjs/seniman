import { Buffer } from 'node:buffer';
//import blocks from './components/blocks.js';
import { createSignal, createEffect, onCleanup, createRoot, untrack, createMemo, getActiveWindow, runWithOwner, getOwner, onError, createContext, useContext } from './signals.js';
import { clientFunctionDefinitions, streamBlockTemplateInstall } from './declare.js';
import { build } from './build.js';
import { bufferPool, PAGE_SIZE } from './buffer-pool.js';

export const WindowContext = createContext(null);
export const WindowProvider = WindowContext.Provider;

export function useWindow() {
    return useContext(WindowContext);
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

//let CMD_PING = 0;
//let CMD_INSTALL_TEMPLATE = 1;
let CMD_INIT_WINDOW = 2;
let CMD_ATTACH_ANCHOR = 3;
let CMD_COOKIE_SET = 4;
let CMD_ATTACH_EVENT_V2 = 5;
let CMD_NAV = 6;
let CMD_ELEMENT_UPDATE = 7;
let CMD_INIT_BLOCK = 8;
let CMD_REMOVE_BLOCKS = 9;
let CMD_INSTALL_CLIENT_FUNCTION = 10;
let CMD_RUN_CLIENT_FUNCTION = 11;

let pingBuffer = Buffer.from([0]);
const multiStylePropScratchBuffer = Buffer.alloc(32768);

export class Window {

    constructor(port, pageParams, components) {

        let { windowId,
            currentPath,
            viewportSize,
            readOffset,
            cookieString } = pageParams;

        if (build.syntaxErrors) {
            console.error('Starting a window with syntax errors');
        }

        this.id = windowId;
        this.port = port;
        this.destroyFnCallback = null;
        this.connected = true;

        this.pages = [];
        this.global_readOffset = 0;
        this.global_writeOffset = 0;
        this.mutationGroup = null;

        this._streamInitWindow();

        this.latestBlockId = 10;

        let [path, setPath] = createSignal(currentPath);
        let [pageTitle, set_pageTitle] = createSignal('');
        let [cookieSignal, setCookie] = createSignal(cookieString);
        let [viewportSizeSignal, setViewportSize] = createSignal({ width: viewportSize[0], height: viewportSize[1] });

        this.setViewportSize = setViewportSize;
        this.setPath = setPath;

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

        this.isPending = false;
        this.inputMessageQueue = [];
        this.lastPongTime = Date.now();

        let windowContext = {
            viewportSize: viewportSizeSignal,
            cookie: (cookieKey) => {
                return createMemo(() => {
                    let cookieString = cookieSignal();
                    return cookieString ? getCookieValue(cookieString, cookieKey) : null;
                });
            },

            setCookie: (cookieKey, cookieValue) => {
                let cookieString = cookieSignal();
                let newCookieString = setCookieValue(cookieString, cookieKey, cookieValue);

                setCookie(newCookieString);

                // TODO: send the cookie update to the browser
                let buf = this._allocCommandBuffer(1 + 1 + cookieKey.length + 2 + cookieValue.length + 4);

                let offset = 0;
                buf.writeUint8(CMD_COOKIE_SET, offset);
                offset++;

                buf.writeUint8(cookieKey.length, offset);
                offset++;
                buf.write(cookieKey, offset);
                offset += cookieKey.length;

                buf.writeUint16BE(cookieValue.length, offset);
                offset += 2;
                buf.write(cookieValue, offset);
                offset += cookieValue.length;

                buf.writeUint32BE(0, offset);
            },

            path,

            navigate: (path) => {
                let buf = this._allocCommandBuffer(1 + 2 + path.length);
                buf.writeUint8(CMD_NAV, 0);
                buf.writeUint16BE(path.length, 1);
                buf.write(path, 1 + 2);

                setPath(path);
            },

            clientExec: (clientFnSpec, args) => {
                let eventHandlerIds = [];
                let { clientFnId, serverBindFns } = clientFnSpec;

                this._streamFunctionInstallCommand(clientFnId);

                let serverBindIds = (serverBindFns || []).map(bindFn => {
                    let handlerId = this._allocateEventHandler(bindFn);
                    eventHandlerIds.push(handlerId);
                    return handlerId;
                });

                let argJsonString = JSON.stringify(args || []);
                let buf = this._allocCommandBuffer(1 + 2 + ((serverBindIds.length * 2) + 2) + 2 + argJsonString.length);

                buf.writeUInt8(CMD_RUN_CLIENT_FUNCTION, 0);
                buf.writeUInt16BE(clientFnId, 1);

                let offset = 3;

                serverBindIds.forEach(bindId => {
                    buf.writeUint16BE(bindId, offset);
                    offset += 2;
                });

                buf.writeUint16BE(0, offset);
                offset += 2;
                buf.writeUInt16BE(argJsonString.length, offset);
                offset += 2;
                buf.write(argJsonString, offset);

                if (eventHandlerIds.length) {
                    onCleanup(() => {
                        this._deallocateEventHandlers(eventHandlerIds);
                    });
                }
            },

            pageTitle: pageTitle,
            setPageTitle: (title) => set_pageTitle(title)
        }

        this.rootDisposer = null;

        createRoot(dispose => {
            this.rootOwner = getOwner();


            this._attach(1, 0, _createComponent(components.Head, { cssText: build.globalCss, pageTitle, window: windowContext }));
            this._attach(2, 0, _createComponent(WindowProvider, {
                get value() {
                    return windowContext;
                },
                get children() {
                    return _createComponent(components.Body, { syntaxErrors: build.syntaxErrors })
                }
            }));

            this.rootDisposer = dispose;
        }, null, this);
    }

    sendPing() {
        this.port.send(pingBuffer);
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

    registerReadOffset(readOffset) {

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

                this.port.send(page.buffer.subarray(offset, offset + size));

                readOffset += size;
            }

            if (readOffset != this.global_writeOffset) {
                throw new Error();
            }

            //this._registerReadOffset(offset);
        }
    }

    reconnect(port, pageParams) {

        let { windowId,
            currentPath,
            viewportSize,
            readOffset,
            cookieString } = pageParams;

        //setCookie(cookieString);

        console.log('reconnected in window', this.id, readOffset);

        this.port = port;
        this.connected = true;
        this.lastPongTime = Date.now();

        this.registerReadOffset(readOffset);
        this._restreamUnreadPages();
    }

    disconnect() {
        console.log('window disconnect', this.id);
        this.connected = false;
    }

    scheduleWork() {
        const PONG_COMMAND = 0;

        while (this.inputMessageQueue.length) {
            let message = this.inputMessageQueue.shift();
            let buffer = Buffer.from(message);

            if (buffer.readUint8(0) == PONG_COMMAND) {
                this.lastPongTime = Date.now();
                this.connected = true;

                let readOffset = buffer.readUInt32LE(1);
                this.registerReadOffset(readOffset);
            } else {
                this.submitInput(buffer);
            }
        }

        // TODO: return a boolean indicating whether all messages were processed?
        // to make sure scheduleWork is called again for the window eventually
    }

    enqueueMessage(message) {
        this.inputMessageQueue.push(message);
    }

    submitInput(command) {
        runWithOwner(this.rootOwner, () => {
            untrack(() => this._onMessage(command));
        });
    }

    _onMessage(buffer) {

        let EVENT_COMMAND = 1;
        let EVENT_DATA_COMMAND = 2;
        let EVENT_BACKNAV = 3;
        let EVENT_VIEWPORT_UPDATE = 5;

        let opcode = buffer.readUint8(0);

        if (opcode == EVENT_COMMAND) {
            let handlerId = buffer.readUint16LE(1);
            let dataLength = buffer.readUint16LE(3);
            let data;

            if (dataLength > 0) {
                data = JSON.parse(buffer.subarray(5, 5 + dataLength).toString());
            } else {
                data = '';
            }

            this._executeClientEvent({ handlerId, data });
        } else if (opcode == EVENT_BACKNAV) {
            let pathnameLength = buffer.readUint16LE(1);
            let path = buffer.subarray(3, 3 + pathnameLength).toString();

            // TODO: do we need to do something special other than just setting the path since this is a backnav?
            // i.e. some level of sychronization of browser's history stack with the server's history stack?
            this.setPath(path);
        } else if (opcode == EVENT_VIEWPORT_UPDATE) {
            let width = buffer.readUint16LE(1);
            let height = buffer.readUint16LE(3);

            this.setViewportSize({ width, height });
        }
    }

    onDestroy(fn) {
        this.destroyFnCallback = fn;
    }

    destroy() {
        this.rootDisposer();
        this.destroyFnCallback();

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

            this.port.send(buffer.subarray(offset, offset + size));
        }

        this.mutationGroup = null;
    }

    _allocCommandBuffer(size) {

        if (!this.mutationGroup) {
            let pageCount = this.pages.length;
            let page = pageCount == 0 ? this._allocPage(this.global_writeOffset) : this.pages[pageCount - 1];

            this.mutationGroup = {
                page,
                pageStartOffset: this.global_writeOffset,
            };

            process.nextTick(() => this._flushMutationGroup());
        }

        let mg = this.mutationGroup;

        let currentPageOffset = this.global_writeOffset - mg.page.global_headOffset;

        //console.log('currentPageOffset', currentPageOffset);

        //console.log('currentPageOffset', currentPageOffset, size, this.global_writeOffset, mg.page.global_headOffset);

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

    _executeClientEvent(command) {
        let eventHandler = this.eventHandlers.get(command.handlerId);

        if (!eventHandler) {
            console.warn('Invalid eventHandler', command.handlerId, eventHandler)
            return;
        }

        eventHandler(command.data);
    }

    _streamInitWindow() {
        let buf = this._allocCommandBuffer(1 + 21)
        buf.writeUint8(CMD_INIT_WINDOW, 0);
        buf.write(this.id, 1, 21);
    }

    _streamEventInitCommandV2(blockId, targetId, eventType, clientFnId, serverBindIds) {

        let buf = this._allocCommandBuffer(1 + 2 + 1 + 1 + 2 + ((serverBindIds.length * 2) + 2));

        buf.writeUint8(CMD_ATTACH_EVENT_V2, 0);
        buf.writeUint16BE(blockId, 1);
        buf.writeUint8(targetId, 3);
        buf.writeUint8(eventType, 4);
        buf.writeUint16BE(clientFnId, 5);

        let offset = 7;

        serverBindIds.forEach(bindId => {
            buf.writeUint16BE(bindId, offset);
            offset += 2;
        });

        buf.writeUint16BE(0, offset);
    }

    _streamTemplateInstallCommand(templateId) {
        if (!this.clientTemplateInstallationSet.has(templateId)) {

            streamBlockTemplateInstall(this, templateId);
            this.clientTemplateInstallationSet.add(templateId);
        }
    }

    _streamFunctionInstallCommand(functionId) {

        if (functionId > 1 && !this.clientFunctionInstallationSet.has(functionId)) {
            let clientFnString = JSON.stringify(clientFunctionDefinitions.get(functionId));
            let buf = this._allocCommandBuffer(1 + 2 + 2 + clientFnString.length);

            buf.writeUInt8(CMD_INSTALL_CLIENT_FUNCTION, 0);
            buf.writeUInt16BE(functionId, 1);
            buf.writeUInt16BE(clientFnString.length, 3);
            buf.write(clientFnString, 5);

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

    _attach(blockId, anchorIndex, nodeResult) {

        if (typeof nodeResult == 'string') {
            this._streamTextInitCommand(blockId, anchorIndex, nodeResult);
        } else if (typeof nodeResult == 'number') {
            this._streamTextInitCommand(blockId, anchorIndex, nodeResult.toString());
        } else if (!nodeResult) {
            this._streamTextInitCommand(blockId, anchorIndex, '');
        } else if (nodeResult.type == 'block') {
            //console.log('_attachBlock', nodeResult.id);
            this._streamAttachBlockCommand(blockId, anchorIndex, nodeResult.id);
        } else if (nodeResult instanceof Function) {
            createEffect(() => {
                let fn = nodeResult;
                this._attach(blockId, anchorIndex, fn());
            });
        } else if (Array.isArray(nodeResult)) {
            this._attachList(blockId, anchorIndex, nodeResult);
        }
    }

    // TODO: this might be doing it too cleverly -- will be hard to understand without comments.
    // also lots of optimizations can be done.

    // what we're doing here is creating a single effect scope to capture all of the callables, then
    // passing the resolved values down to the recursive _attachList call, down to the final code path
    // where no callables are present, and we can start streaming the values to the client.
    // TODO: this doesn't currently handle nested lists
    _attachList(blockId, anchorIndex, list) {
        let includesCallables = false;
        let listLength = list.length;

        // TODO: optimize -- hint from the compiler?
        // i.e. includesCallables, callable positions, etc.
        for (let i = 0; i < listLength; i++) {
            let val = list[i];

            if (val instanceof Function) {
                includesCallables = true;
            }
        }

        if (includesCallables) {
            // create an effect scope to capture any of the callables, then pass the resolved values down the
            // recursive _attachList call
            // TODO: optimize this
            let valueList = [];

            // TODO: optimize -- hint from the compiler?
            for (let i = 0; i < listLength; i++) {
                let val = list[i];

                if (val instanceof Function) {
                    valueList.push(null);
                } else {
                    valueList.push(val);
                }
            }

            createEffect(() => {
                for (let i = 0; i < listLength; i++) {
                    let value = list[i];

                    if (value instanceof Function) {
                        value = value();

                        if (typeof value == 'number') {
                            value = value.toString();
                        } else if (!value) {
                            value = '';
                        } else if (Array.isArray(value) && value.length == 0) {
                            value = '';
                        }

                        valueList[i] = value;
                    }
                }

                this._attachList(blockId, anchorIndex, valueList);
            });

        } else {

            // once we got rid of all the callables, stream down the list
            this._streamAttachListCommand(blockId, anchorIndex, list);
        }
    }

    _streamTextInitCommand(blockId, anchorIndex, value) {


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
        let textLength = textBuffer.length; //Buffer.byteLength(value);

        // TODO: handle string length longer than 32K
        let buf2 = this._allocCommandBuffer(1 + 2 + 1 + 2 + textLength + 2);

        buf2.writeUint8(CMD_ATTACH_ANCHOR, 0);
        buf2.writeUint16BE(blockId, 1);

        //console.log('attach text to blockId', blockId);
        buf2.writeUint8(anchorIndex, 3);

        if (textLength > 32677) {
            throw new Error();
        }

        buf2.writeUint16BE(textLength, 4);
        textBuffer.copy(buf2, 6);
        buf2.writeUint16BE(65535, 6 + textLength);
    }

    _streamAttachBlockCommand(parentBlockId, anchorIndex, blockId) {
        let buf2 = this._allocCommandBuffer(1 + 2 + 1 + 2 + 2);

        buf2.writeUint8(CMD_ATTACH_ANCHOR, 0);
        buf2.writeUint16BE(parentBlockId, 1);
        //console.log('attach ', blockId, 'to blockId', parentBlockId);
        buf2.writeUint8(anchorIndex, 3);

        buf2.writeUint16BE(blockId |= (1 << 15), 4);
        buf2.writeUint16BE(65535, 6);
    }

    _streamAttachListCommand(blockId, anchorIndex, nodeResultsArray) {
        let length = 1 + 2 + 1 + 2;
        let count = nodeResultsArray.length;

        //console.log('_streamAttachListCommand', blockId, anchorIndex, count, nodeResultsArray);

        // TODO: handle text in the results array
        for (let i = 0; i < count; i++) {
            let val = nodeResultsArray[i];

            if (val.type == 'block') {
                length += 2;
            } else {
                length += (2 + val.length);
            }
        };

        let buf2 = this._allocCommandBuffer(length);

        buf2.writeUint8(CMD_ATTACH_ANCHOR, 0);
        buf2.writeUint16BE(blockId, 1);
        //console.log('attach multiple', nodeResultsArray, ' to blockId', blockId);
        buf2.writeUint8(anchorIndex, 3);
        //console.log('_attachMultiple', nodeResultsArray);

        let offset = 4;

        // TODO: handle text in the results array
        for (let i = 0; i < count; i++) {
            let val = nodeResultsArray[i];

            if (val.type == 'block') {
                let childBlockId = val.id;
                buf2.writeUint16BE(childBlockId |= (1 << 15), offset);
                offset += 2;
            } else {
                buf2.writeUint16BE(val.length, offset);
                buf2.write(val, offset + 2, val.length);
                offset += (2 + val.length);
            }
        }

        buf2.writeUint16BE(65535, offset);
    }

    _createBlock3(blockTemplateId, anchors, eventHandlers, elementEffects) {

        let newBlockId = this._createBlockId();

        //console.log('_createBlock3', blockTemplateId, newBlockId);

        this._streamTemplateInstallCommand(blockTemplateId);
        this._streamBlockInitCommand2(newBlockId, blockTemplateId);

        eventHandlers && this._handleBlockEventHandlers(newBlockId, eventHandlers);
        elementEffects && this._handleElementEffects(newBlockId, elementEffects);

        anchors && anchors.map((anchorNodeResult, anchorIndex) => {
            //this._processNodeV2(anchorNode, newBlockId, anchorIndex, -1);
            this._attach(newBlockId, anchorIndex, anchorNodeResult);
        });

        onCleanup(() => {
            this._handleBlockCleanup(newBlockId);
        });

        return {
            type: "block",
            id: newBlockId
        };
    }

    _handleBlockEventHandlers(newBlockId, eventHandlers) {
        let eventHandlerIds = [];

        eventHandlers.forEach((eventHandler, index) => {
            let clientFnId;
            let serverBindFns;

            // do nothing if the event handler is undefined
            if (!eventHandler.fn) {
                return;
            } else if (eventHandler.fn instanceof Function) {
                clientFnId = 1;
                serverBindFns = [eventHandler.fn];
            } else if (eventHandler.fn.clientFnId) {
                clientFnId = eventHandler.fn.clientFnId;
                serverBindFns = eventHandler.fn.serverBindFns || [];
            }

            let serverBindIds = serverBindFns.map(bindFn => {
                let handlerId = this._allocateEventHandler(bindFn);
                eventHandlerIds.push(handlerId);
                return handlerId;
            });

            this._streamFunctionInstallCommand(clientFnId);
            this._streamEventInitCommandV2(newBlockId, eventHandler.targetId, eventHandler.type, clientFnId, serverBindIds);
        });

        onCleanup(() => {
            this._deallocateEventHandlers(eventHandlerIds);
        });
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
                    /*
                    buf.writeUint8(propName.length, 5);
                    buf.write(propName, 6, propName.length);
                    let offset = 6 + propName.length;
                    */

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

                    let buf2 = multiStylePropScratchBuffer;

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
                createEffect(previous => elementEffect.effectFn(elRef, previous), elementEffect.init);
            } else {
                createEffect(() => elementEffect.effectFn(elRef));
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
}

export function _createComponent(componentFunction, props) {
    return untrack(() => componentFunction(props));
}

export function _createBlock(blockTemplateId, anchors, eventHandlers, styleEffects) {
    return getActiveWindow()._createBlock3(blockTemplateId, anchors, eventHandlers, styleEffects);
}