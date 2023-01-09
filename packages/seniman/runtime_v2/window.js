import { Buffer } from 'node:buffer';

//import blocks from './components/blocks.js';
import { createSignal, createEffect, onCleanup, createRoot, untrack, createMemo, getActiveWindow, runWithOwner, getOwner, onError, createContext, useContext } from './signals.js';
import { blockDefinitions, clientFunctionDefinitions, compileBlockDefinitionToInstallCommand } from './declare.js';

export { createSignal, onCleanup };

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


//let CMD_PING = 0;
//let CMD_INSTALL_TEMPLATE = 1;
let CMD_INIT_WINDOW = 2;
let CMD_ATTACH_ANCHOR = 3;
let CMD_CLIENT_DATA_SET = 4;
let CMD_ATTACH_EVENT_V2 = 5;
let CMD_NAV = 6;
let CMD_ELEMENT_UPDATE = 7;
let CMD_INIT_BLOCK = 8;
let CMD_REMOVE_BLOCKS = 9;
let CMD_INSTALL_CLIENT_FUNCTION = 10;
let CMD_RUN_CLIENT_FUNCTION = 11;

let PAGE_SIZE = 8192; //32678;

let pingBuffer = Buffer.from([0]);

export class Window {

    constructor(id, initialPath, clientIdentifierString, build, port) {

        if (build.syntaxErrors) {
            console.error('Starting a window with syntax errors');
        }

        this.id = id;
        this.port = port;
        this.destroyFnCallback = null;

        this.pages = [];
        this.global_readOffset = 0;
        this.global_writeOffset = 0;
        this.mutationGroup = null;

        this._streamInitWindow(build);

        this.latestBlockId = 10;

        let [path, setPath] = createSignal(initialPath);
        let [clientData, setClientData] = createSignal(clientIdentifierString);
        let [pageTitle, set_pageTitle] = createSignal('');

        this.deleteEnqueuedBlockIds = new Set();
        this.clientTemplateInstallationSet = new Set();
        this.clientFunctionInstallationSet = new Set();

        this.lastEventHandlerId = 0;
        this.eventHandlers = new Map();

        this.windowContext = {
            clientData,
            path,
            navigate: (path) => {
                console.log('navigate', path);
                //this.ws.send(JSON.stringify({ command: 'NAV', path: path }))

                let buf = this._allocCommandBuffer(1 + 2 + path.length);
                buf.writeUint8(CMD_NAV, 0);
                buf.writeUint16BE(path.length, 1);
                buf.write(path, 1 + 2);

                setPath(path);
            },
            navigateFromBack_internal: (path) => {
                console.log('navigateFromBack_internal', path);
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

                //});
            },
            setClientData: (value) => {
                let buf = this._allocCommandBuffer(1 + 2 + value.length + 4);

                let offset = 0;
                buf.writeUint8(CMD_CLIENT_DATA_SET, offset);
                offset++;

                /*
                buf.writeUint8(key.length, offset);
                offset++;
                buf.write(key, offset);
                offset += key.length;
                */

                buf.writeUint16BE(value.length, offset);
                offset += 2;
                buf.write(value, offset);
                offset += value.length;

                buf.writeUint32BE(0, offset);

                setClientData(value);
            },
            pageTitle: pageTitle,
            setPageTitle: (title) => set_pageTitle(title)
        }

        this.windowContext.runOnClient = this.windowContext.clientExec;

        this.rootDisposer = null;

        let rootOwner;

        createRoot(dispose => {
            rootOwner = getOwner();

            this._attach(1, 0, _createComponent(build.HeadTag, { cssText: build.globalCss, pageTitle, window: this.windowContext }));
            this._attach(2, 0, _createComponent(build.BodyTag, { syntaxErrors: build.syntaxErrors, window: this.windowContext, RootComponent: build.RootComponent }));

            this.rootDisposer = dispose;

        }, null, this);

        this.port.on('message', (command) => {
            runWithOwner(rootOwner, () => {
                untrack(() => this.onMessage(command));
            });
        });

        this.connected = true;
        this.lastPongTime = Date.now();

        this.pingInterval = setInterval(() => {
            let now = Date.now();

            if ((now - this.lastPongTime) > 7000) {
                this.connected = false;
            }

            if ((now - this.lastPongTime) > 25000) {
                this.destroy();
                return;
            }

            if (this.connected) {
                this.sendPing();
            }

        }, 2500);
    }

    _startWindowDestroyCountdown() {

        if (this.destroyTimeout) {
            return;
        }

        console.log('_startWindowDestroyCountdown', this.id);
        this.destroyTimeout = setTimeout(() => {
            this.destroy();
        }, 20000);
    }


    sendPing() {

        this.port.postMessage({
            arrayBuffer: pingBuffer,
            offset: 0,
            size: 1
        });

        let deleteEnqueuedBlockCount = this.deleteEnqueuedBlockIds.size;

        if (deleteEnqueuedBlockCount) {
            let buf = this._allocCommandBuffer(1 + 2 * deleteEnqueuedBlockCount + 2);

            buf.writeUint8(CMD_REMOVE_BLOCKS, 0);

            let offset = 1;

            this.deleteEnqueuedBlockIds.forEach(blockId => {
                buf.writeUint16BE(blockId, offset);
                offset += 2;
            })

            buf.writeUint16BE(0, offset);

            this.deleteEnqueuedBlockIds.clear();
        }

        //console.log('sending ping to', this.id);

        //this.pongLateTimeout = setTimeout(() => this.onPongLateArrival(), 7000);
    }

    _registerReadOffset(readOffset) {

        if (readOffset < this.global_readOffset) {
            throw new Error();
        }

        this.global_readOffset = readOffset;

        // free unused pages
        while (true) {
            let page = this.pages[0];

            if (page.finalSize == 0) {
                break;
            }

            if (readOffset >= (page.global_headOffset + page.finalSize)) {
                this.pages.shift();

                //console.log('freed pages', this.pages);
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
                let msg;
                let size;

                if (page.finalSize > 0) {
                    size = (page.global_headOffset + page.finalSize) - readOffset;

                    console.log('restream final page ', this.global_writeOffset, readOffset, readOffset - page.global_headOffset + 1, size);

                    msg = {
                        arrayBuffer: page.arrayBuffer,
                        offset: readOffset - page.global_headOffset,
                        size: size
                    };
                } else {
                    size = this.global_writeOffset - readOffset; // 6 - 3

                    console.log('restream nonfinal page ', this.global_writeOffset, readOffset, readOffset - page.global_headOffset + 1, size);

                    msg = {
                        arrayBuffer: page.arrayBuffer,
                        offset: readOffset - page.global_headOffset,// + 1, // 6 - 3 + 1
                        size: size // 6 -3 
                    };
                }

                this.port.postMessage(msg);

                readOffset += size;
            }

            if (readOffset != this.global_writeOffset) {
                throw new Error();
            }

            //this._registerReadOffset(offset);
        }
    }

    reconnect(readOffset) {

        console.log('reconnected in window', this.id, readOffset);

        this.connected = true;
        this.lastPongTime = Date.now();

        //this.sendPingTimeout = setTimeout(() => this.sendPing(), 5000);

        this._registerReadOffset(readOffset);
        //this._streamInitWindow();
        this._restreamUnreadPages();
    }

    disconnect() {

        console.log('window disconnect', this.id);

        this.connected = false;
    }

    onMessage(message) {

        let PONG_COMMAND = 0;
        let EVENT_COMMAND = 1;
        let EVENT_DATA_COMMAND = 2;
        let EVENT_BACKNAV = 3;

        let opcode = message[0];

        // if PONG
        if (opcode == PONG_COMMAND) {
            let buffer = Buffer.from(message);
            let readOffset = buffer.readUInt32LE(1);

            this._registerReadOffset(readOffset);

            this.connected = true;
            this.lastPongTime = Date.now();

            //clearTimeout(this.pongLateTimeout);
            //this.sendPingTimeout = setTimeout(() => this.sendPing(), 5000);
        } else if (opcode == EVENT_COMMAND) {
            let buffer = Buffer.from(message);
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
            let buffer = Buffer.from(message);
            let pathnameLength = buffer.readUint16LE(1);
            let path = buffer.subarray(3, 3 + pathnameLength).toString();
            this.windowContext.navigateFromBack_internal(path);
        }
    }

    onDestroy(fn) {
        this.destroyFnCallback = fn;
    }

    destroy() {
        this.rootDisposer();
        this.destroyFnCallback();
        clearInterval(this.pingInterval);
    }

    _allocPage(headOffset) {
        //console.log('_allocPage', headOffset);
        //let pageCount = this.pages.length;

        let page = {
            global_headOffset: headOffset,
            arrayBuffer: new SharedArrayBuffer(PAGE_SIZE),
            finalSize: 0
        };

        this.pages.push(page);

        return page;
    }


    _flushMutationGroup() {

        //.log('similar', getActiveWindow() == this);//

        let mg = this.mutationGroup;

        if (mg && ((this.global_writeOffset - mg.pageStartOffset) > 0)) {

            let msg = {
                arrayBuffer: mg.page.arrayBuffer,
                offset: mg.pageStartOffset - mg.page.global_headOffset,
                size: this.global_writeOffset - mg.pageStartOffset
            };

            this.port.postMessage(msg);
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

            console.log('realloc page');
        }

        this.global_writeOffset += size;
        return Buffer.from(mg.page.arrayBuffer, currentPageOffset, size);
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

    _streamInitWindow(build) {
        let initWindowBuffer = Buffer.alloc(1 + 21 + build.compressionCommandBuffer.length);

        initWindowBuffer.writeUint8(CMD_INIT_WINDOW, 0);
        initWindowBuffer.write(this.id, 1, 21);

        // compression map
        build.compressionCommandBuffer.copy(initWindowBuffer, 22);

        let msg = {
            arrayBuffer: initWindowBuffer,
            offset: 0,
            size: 1 + 21 + build.compressionCommandBuffer.length
        };

        this.port.postMessage(msg);
    }

    /*

    _streamEventInitCommand(blockId, targetId, eventType, handlerId) {
        let buf = this._allocCommandBuffer(1 + 2 + 1 + 1 + 2);

        buf.writeUint8(CMD_ATTACH_EVENT, 0);
        buf.writeUint16BE(blockId, 1);
        buf.writeUint8(targetId, 3);
        buf.writeUint8(eventType, 4);
        buf.writeUint16BE(handlerId, 5);
    }
    */

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
            let templateBuf = compileBlockDefinitionToInstallCommand(templateId);
            let commandBuf = this._allocCommandBuffer(templateBuf.length);

            templateBuf.copy(commandBuf);

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
                    let val = list[i];

                    if (val instanceof Function) {
                        valueList[i] = val();
                    }
                }

                this._attachList(blockId, anchorIndex, valueList);
            });

        } else {
            // once we got rid of all the callables, stream down the list 
            // after some value cleanups
            this._streamAttachListCommand(blockId, anchorIndex, list.map(value => {
                if (!value) {
                    value = '';
                } else if (Array.isArray(value)) {
                    if (value.length == 0) {
                        value = '';
                    }
                }
                return value;
            }));
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
            this.deleteEnqueuedBlockIds.add(newBlockId);
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
                    let buf = this._allocCommandBuffer(1 + 2 + 1 + 1 + 1 + 1 + propValue.length);

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

                    buf.writeUint8(propValue.length, offset);
                    offset++;
                    buf.write(propValue, offset, propValue.length);
                },

                _staticHelperPropKeyOnly: (updateMode, propKey) => {
                    let buf = this._allocCommandBuffer(1 + 2 + 1 + 1 + 1);

                    buf.writeUint8(CMD_ELEMENT_UPDATE, 0);
                    buf.writeUint16BE(blockId, 1);
                    buf.writeUint8(targetId, 3);
                    buf.writeUint8(updateMode, 4);
                    buf.writeUint8(propKey, 5);
                },

                setStyleProperty: (propName, propValue) => {
                    // if propValue is a number, we need to convert it to a string
                    // TODO: insert some intelligence around adding 'px' to the end of the string like React does?
                    // (only on certain properties)
                    if (typeof propValue == 'number') {
                        propValue = propValue.toString();
                    }

                    elRef._staticHelper(UPDATE_MODE_STYLEPROP, propName, propValue || '');
                },

                setMultiStyleProperties: (styleProps) => {
                    const kebabCaseObj = {};

                    for (const key in styleProps) {
                        const kebabCaseKey = camelCaseToKebabCase(key);
                        kebabCaseObj[kebabCaseKey] = styleProps[key];
                    }

                    let jsonString = JSON.stringify(kebabCaseObj);

                    let buf = this._allocCommandBuffer(1 + 2 + 1 + 1 + 2 + jsonString.length);

                    buf.writeUint8(CMD_ELEMENT_UPDATE, 0);
                    buf.writeUint16BE(blockId, 1);
                    buf.writeUint8(targetId, 3);
                    buf.writeUint8(UPDATE_MODE_MULTI_STYLEPROP, 4);
                    buf.writeUInt16BE(jsonString.length, 5);
                    buf.write(jsonString, 7, jsonString.length);
                },

                setChecked: (value) => {
                    let buf = this._allocCommandBuffer(1 + 2 + 1 + 1 + 1);

                    buf.writeUint8(CMD_ELEMENT_UPDATE, 0);
                    buf.writeUint16BE(blockId, 1);
                    buf.writeUint8(targetId, 3);
                    buf.writeUint8(UPDATE_MODE_SET_CHECKED, 4);
                    buf.writeUint8(value ? 1 : 0, 5);
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

                    if (!propValue) {
                        elRef.removeAttribute(propName);
                        return;
                    }

                    if (typeof propValue != 'string') {
                        propValue = propValue.toString();
                    }

                    elRef._staticHelper(UPDATE_MODE_SET_ATTR, propName, propValue);
                },
                toggleClass: (className, value) => {
                    elRef._staticHelperPropKeyOnly(value ? UPDATE_MODE_SET_CLASS : UPDATE_MODE_REMOVE_CLASS, className);
                },
                setClassName: (className) => {
                    elRef.toggleClass(className, true);
                }
            };

            if (elementEffect.effectFn.length > 1) {
                createEffect(previous => elementEffect.effectFn(elRef, previous), elementEffect.init);
            } else {
                createEffect(() => elementEffect.effectFn(elRef));
            }
        });
    }
}


export function _createComponent(componentFunction, props) {
    return untrack(() => componentFunction(props));
}

export function _createBlock(blockTemplateId, anchors, eventHandlers, styleEffects) {
    return getActiveWindow()._createBlock3(blockTemplateId, anchors, eventHandlers, styleEffects);
}

function dispose(d) {
    for (let i = 0; i < d.length; i++) d[i]();
}

const FALLBACK = Symbol("fallback");

function mapArray(list, mapFn, options) {

    //let _activeWindow = activeWindow;

    let items = [];
    let mapped = [];
    let disposers = [];
    let len = 0;
    let indexes = mapFn.length > 1 ? [] : null;

    onCleanup(() => dispose(disposers));

    return () => {
        let newItems = list() || [],
            i, j;

        return untrack(() => {
            let newLen = newItems.length,
                newIndices,
                newIndicesNext,
                temp,
                tempdisposers,
                tempIndexes,
                start,
                end,
                newEnd,
                item;

            // fast path for empty arrays
            if (newLen === 0) {
                if (len !== 0) {
                    dispose(disposers);
                    disposers = [];
                    items = [];
                    mapped = [];
                    len = 0;
                    indexes && (indexes = []);
                }


                if (options.fallback) {
                    items = [FALLBACK];
                    mapped[0] = createRoot(disposer => {
                        disposers[0] = disposer;
                        return options.fallback();
                    });
                    len = 1;
                }

            } else if (len === 0) {
                mapped = new Array(newLen);
                for (j = 0; j < newLen; j++) {
                    items[j] = newItems[j];
                    mapped[j] = createRoot(mapper);
                }
                len = newLen;
            } else {
                temp = new Array(newLen);
                tempdisposers = new Array(newLen);
                indexes && (tempIndexes = new Array(newLen));

                // skip common prefix
                for (
                    start = 0, end = Math.min(len, newLen);
                    start < end && items[start] === newItems[start];
                    start++
                );

                // common suffix
                for (
                    end = len - 1, newEnd = newLen - 1;
                    end >= start && newEnd >= start && items[end] === newItems[newEnd];
                    end--, newEnd--
                ) {
                    temp[newEnd] = mapped[end];
                    tempdisposers[newEnd] = disposers[end];
                    indexes && (tempIndexes[newEnd] = indexes[end]);
                }

                // 0) prepare a map of all indices in newItems, scanning backwards so we encounter them in natural order
                newIndices = new Map();
                newIndicesNext = new Array(newEnd + 1);
                for (j = newEnd; j >= start; j--) {
                    item = newItems[j];
                    i = newIndices.get(item);
                    newIndicesNext[j] = i === undefined ? -1 : i;
                    newIndices.set(item, j);
                }
                // 1) step through all old items and see if they can be found in the new set; if so, save them in a temp array and mark them moved; if not, exit them
                for (i = start; i <= end; i++) {
                    item = items[i];
                    j = newIndices.get(item);
                    if (j !== undefined && j !== -1) {
                        temp[j] = mapped[i];
                        tempdisposers[j] = disposers[i];
                        indexes && (tempIndexes[j] = indexes[i]);
                        j = newIndicesNext[j];
                        newIndices.set(item, j);
                    } else disposers[i]();
                }
                // 2) set all the new values, pulling from the temp array if copied, otherwise entering the new value
                for (j = start; j < newLen; j++) {
                    if (j in temp) {
                        mapped[j] = temp[j];
                        disposers[j] = tempdisposers[j];
                        if (indexes) {
                            indexes[j] = tempIndexes[j];
                            indexes[j](j);
                        }
                    } else mapped[j] = createRoot(mapper);
                }
                // 3) in case the new set is shorter than the old, set the length of the mapped array
                mapped = mapped.slice(0, (len = newLen));
                // 4) save a copy of the mapped items for the next update
                items = newItems.slice(0);
            }

            return mapped;
        });
        function mapper(disposer) {



            //activeWindow = _activeWindow;

            disposers[j] = disposer;
            if (indexes) {
                const [s, set] = createSignal(j);
                indexes[j] = set;
                return mapFn(newItems[j], s);
            }
            return mapFn(newItems[j]);
        }
    }
}


export function For(props) {
    const fallback = "fallback" in props && { fallback: () => props.fallback };
    return createMemo(
        mapArray(props.each, props.children, fallback ? fallback : undefined)
    );
}

export default function VirtualList(props) {

    let [itemIndexes, setItemIndexes] = createSignal([]);
    let [signal2, _] = createSignal('testyos');// { type: "signal", value: "testyo" };
    let [messageIds, setMessageIds] = createSignal([1, 2, 5, 7]);

    let onScroll = (position) => {

        let shouldLoadMoreBottom = true;

        if (shouldLoadMoreBottom) {
            setItemIndexes(itemIndexes => {
                let cutCount = 3;

                // cut at start
                itemIndexes.splice(0, cutCount);

                // add at end
                itemIndexes.push();

                return
            });
        }
    }

    return;

    /*
    return (
        <div onScroll={onScroll}>
            <loop items={itemIndexes()}>
                {(itemIndex, index) => props.renderRow(itemIndex, getPositioningStyle(itemIndex))}
            </loop>
        </div>
    );
    */
}
