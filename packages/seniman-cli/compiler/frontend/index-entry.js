{
    let _window = window;
    let _document = document;
    let _location = location;

    let socket;
    let windowId = '';
    let readOffset = 0;

    let _addEventListener = (el, eventType, fn) => {
        el.addEventListener(eventType, fn);
    }
    let now = () => Date.now();
    let createBuffer = (size) => new Uint8Array(size);

    let setElementDisplay = (el, shouldDisplay) => {
        el.style.display = shouldDisplay ? 'block' : 'none';
    }

    let _socketSend = (buffer) => socket.send(buffer)

    let getBlock = (id) => _blocksMap.get(id);

    {

        let lastMessageTime = 0;
        let requestReopen = false;

        let connectSocket = () => {
            socket = new WebSocket(`ws${_location.protocol[4] == 's' ? 's' : ''}://${_location.host}?${windowId}:${_location.pathname}:${readOffset}`);
            socket.binaryType = "arraybuffer";

            socket.onopen = (e) => {

            };

            socket.onmessage = (msg) => {
                lastMessageTime = now();
                _apply3(msg);
            }

            socket.onclose = (event) => {
                if (event.code == 3001) {
                    _location.reload();
                } else {
                    requestReopen = true;
                }

            }

            socket.onerror = (error) => {
                requestReopen = true;
            };
        }

        connectSocket();

        let showDisconnectionNotice = () => {
            shouldShowReconnectionNotice(false);
            setElementDisplay(_window.disconn, true);
        }

        let shouldShowReconnectionNotice = (shouldDisplay) => {
            setElementDisplay(_window.reconn, shouldDisplay);
        }

        let deactivateSocket = (socket) => {
            socket.close();
            socket.onclose = null;
            socket.onerror = null;
        }

        let stopConnection = () => {
            deactivateSocket(socket);
            showDisconnectionNotice();
            clearInterval(intv);
        }

        let lastIntervalTime = now();
        let pingWaitCounter = 0;

        let setIntervalFn = () => setInterval(() => {
            let _now = now();
            let pingLate = (_now - lastMessageTime) > 4000;
            let intervalTimeDiff = (_now - lastIntervalTime);

            lastIntervalTime = _now;

            if (lastMessageTime > 0 && !pingLate && !requestReopen) {
                if (pingWaitCounter > 0) {
                    pingWaitCounter = 0;
                    shouldShowReconnectionNotice(false);
                }

                return;
            }

            // TODO: do different things based on if sleep is longer than the window-destroy timeout on the server side?
            // i.e. if we reconnect to a new window (because existing window has been destroyed), we might want to confirm to 
            // the user that we'll refresh the content.
            // if we're reconnecting to an existing window, content should change naturally and no user prompting is needed.
            let postPageSleepExecution = intervalTimeDiff > 10000;

            // when the page wakes from sleep, give it another chance from clean slate.
            if (postPageSleepExecution) {
                pingWaitCounter = 0;
            }

            pingWaitCounter++;

            let shouldRecreateSocket = postPageSleepExecution || requestReopen || pingWaitCounter % 3 == 0;

            if (shouldRecreateSocket) {
                requestReopen = false;
                lastMessageTime = 0;
                deactivateSocket(socket);
                connectSocket();
                shouldShowReconnectionNotice(true);
            }

            if (pingWaitCounter == 20) {
                stopConnection();
            }
        }, 1000);

        // pingchecker
        let intv = setIntervalFn();

        _addEventListener(_document, "visibilitychange", () => {
            if (_document.visibilityState == 'visible') {
                // TODO: should run this immediately
                intv = setIntervalFn();
            } else {
                clearInterval(intv);
            }
        });
    }

    //////////////////////////////////////////////////////////////////////////


    //////////////////////////////////////////////////////////////////////////////
    //// GLOBAL STATE
    //////////////////////////////////////////////////////////////////////////////

    let _blocksMap = new Map();
    let templateDefinitionMap = new Map();
    let clientFunctionsMap = new Map();

    let selfClosingTagSet = new Set(['hr', 'img', 'input']);
    let typeIdMapping = [];
    let staticAttributeMap = [];
    let stylePropertyKeyMap = [];
    let stylePropertyValueMap = [];

    let initializeRootBlockWithElement = (el) => {
        // TODO: how to initialize the root blocks?
        return _createNewBlockEntry(el, [], [{ el }, { el }, { el }]);
    }


    let _initBlock = () => {

        let blockId = getUint16(); //buf.writeUint16LE(blockId, 3);
        let templateId = getUint16();//dv.get buf.writeUint16LE(templateId, 6);

        let componentDef = templateDefinitionMap.get(templateId);
        let componentRootElement = componentDef.tpl.cloneNode(true);//[templateIndex];
        let [anchorDefs, targetEls] = componentDef.fn(componentRootElement);

        _blocksMap.set(blockId, _createNewBlockEntry(componentRootElement, targetEls, anchorDefs));
    }

    let clickEventHandlerIdWeakMap = new WeakMap();

    let _getBlockTargetElement = (blockId, targetId) => {
        let block = getBlock(blockId);
        return targetId == 255 ? block.rootEl : block.targetEls[targetId];
    }

    /*
    let throttleDebounce = (func, delay) => {
        let lastCall = 0;
        let timeoutId;
        let latestArgs;

        return (...args) => {
            latestArgs = args;
            clearTimeout(timeoutId);

            const _now = now();
            if (_now - lastCall >= delay) {
                lastCall = _now;
                func.apply(null, latestArgs);
            } else {
                // If not enough time has passed since the last call,
                // set a new timeout to run the function at the next
                // opportunity (i.e. after `delay` milliseconds)
                timeoutId = setTimeout(() => {
                    lastCall = now();
                    func.apply(null, latestArgs);
                }, delay - (_now - lastCall));
            }
        };
    }
    */

    let _attachEventHandler = () => {
        let blockId = getUint16(); //buf.writeUint16LE(parentBlockId, 1);
        let targetId = getUint8();
        let eventType = getUint8();
        let handlerId = getUint16(); //buf.writeUint16LE(parentBlockId, 1);

        let targetHandlerElement = _getBlockTargetElement(blockId, targetId);
        let EVENT_TYPE_CLICK = 1;
        let EVENT_TYPE_FOCUS = 2;
        let EVENT_TYPE_BLUR = 3;
        let EVENT_TYPE_INPUT = 4;
        let EVENT_TYPE_SCROLL = 5;

        switch (eventType) {
            case EVENT_TYPE_CLICK:
                clickEventHandlerIdWeakMap.set(targetHandlerElement, handlerId);
                break;
            case EVENT_TYPE_FOCUS:
                _addEventListener(targetHandlerElement, "focus", _createEventHandlerFunction(handlerId));
                break;
            case EVENT_TYPE_BLUR:
                // TODO: check if the host block's already scheduled to be garbage collected.
                _addEventListener(targetHandlerElement, "blur", _createEventHandlerFunction(handlerId));
                break;
            case EVENT_TYPE_INPUT:
                _addEventListener(targetHandlerElement, "input", (e) => {
                    _sendEvent(handlerId, e.target.value);
                });
                break;
            case EVENT_TYPE_SCROLL:
                /*
                    _addEventListener(targetHandlerElement, "scroll", throttleDebounce((e) => {
                        //_sendEvent(handlerId, e.target.value);
                        //console.log('scroll', e.target.scrollLeft, e.target.scrollTop);
                        //_sendEvent(handlerId,)
                    }, 300));
                */
                break;
        }
    }

    let _sendEvent = (handlerId, data) => {
        let dataLength = data?.length || 0;
        let buf = createBuffer(5 + dataLength);
        let EVENT_COMMAND = 1;

        writeUint8(buf, EVENT_COMMAND, 0);
        writeUint16LE(buf, handlerId, 1);
        writeUint16LE(buf, dataLength, 3);

        if (data) {
            writeString(buf, data, 5);
        }

        _socketSend(buf);
    }

    let _createEventHandlerFunction = (handlerId) => {
        return () => {
            _sendEvent(handlerId);
        }
    }

    let textDecoder = new TextDecoder();
    let processOffset = 0;
    let buffer;
    let dv;
    let getUint8 = () => {
        return dv.getUint8(processOffset++);// + offset);
    };
    let getUint16 = () => {
        return dv.getUint16((processOffset += 2) - 2);
    }
    let getUint32 = () => {
        return dv.getUint32((processOffset += 4) - 4);
    }
    let getString = (length) => {
        return textDecoder.decode(buffer.slice(processOffset, processOffset += length));
    }

    let _elementUpdate = () => {
        let blockId = getUint16(); //buf.writeUint16LE(parentBlockId, 1);
        let targetId = getUint8();
        let updateMode = getUint8();

        let targetHandlerElement = _getBlockTargetElement(blockId, targetId);
        /*
        let UPDATE_MODE_STYLEPROP = 1;
        let UPDATE_MODE_ATTR = 2;
        let UPDATE_MODE_SET_CLASS = 3;
        let UPDATE_MODE_REMOVE_CLASS = 4;
        let UPDATE_MODE_REMOVE_ATTR = 5;
        let UPDATE_MODE_SET_CHECKED = 6;
        */

        switch (updateMode) {
            case 1:
            case 2:
                {
                    let mapIndex = getUint8();
                    let propName = (updateMode == 1 ? stylePropertyKeyMap : staticAttributeMap)[mapIndex];
                    //let propName = getString(6, propNameLength);
                    let propValueLength = getUint8();
                    let propValue = getString(propValueLength);

                    //console.log('blockId', blockId, targetId, updateMode, propName, propValue);
                    if (updateMode == 1) {
                        targetHandlerElement.style.setProperty(propName, propValue);
                    } else {
                        targetHandlerElement.setAttribute(propName, propValue);
                    }
                    break;
                }
            case 3:
            case 4:
                {
                    let nameLength = getUint8();
                    let name = getString(nameLength);

                    targetHandlerElement.classList.toggle(name, updateMode == 3); // if updateMode == 4, then class is removed
                    break;
                }
            case 5:
                {
                    let mapIndex = getUint8();
                    let propName = staticAttributeMap[mapIndex];
                    targetHandlerElement.removeAttribute(propName);
                }
            case 6:
                let isActive = getUint8() == 1;
                targetHandlerElement.checked = isActive;
                break;
        }
    }

    let _compileTemplate = () => {

        let totalElementCount = getUint16();
        let totalProcessed = 0;
        let templateString = '';

        let dig = () => {

            while (totalProcessed < totalElementCount) {
                let firstByte = getUint8();
                let tagNameId = firstByte & 63; // get first 6 bits of the byte
                let nextSibling = (firstByte & 128) > 0; // 8th-bit

                //offset++;

                // handle if text
                if (tagNameId == 32) {
                    let textLength = getUint16();
                    templateString += getString(textLength);
                    //offset += 2 + textLength;
                } else {
                    let attrId;
                    let tagName = typeIdMapping[tagNameId];
                    let isSelfClosing = selfClosingTagSet.has(tagName);

                    templateString += `<${tagName}`;

                    while (attrId = getUint8()) {
                        let attrName = staticAttributeMap[attrId];
                        let attrValueString = '';

                        if (attrName == 'style') {
                            //offset++;

                            let propKeyId;

                            while ((propKeyId = getUint8())) {
                                let propValueId = getUint8();
                                attrValueString += `${stylePropertyKeyMap[propKeyId]}:${stylePropertyValueMap[propValueId]};`;
                                //offset += 2;
                            }

                            //offset++;
                        } else {
                            let attrValueLength = getUint16();
                            attrValueString = getString(attrValueLength);
                            //offset += 1 + 2 + attrValueLength;
                        }

                        templateString += ` ${attrName}="${attrValueString}"`;
                    }

                    templateString += '>';

                    let hasChildren = (firstByte & 64) > 0; // 7th-bit

                    if (hasChildren) {
                        dig();
                    }

                    if (!isSelfClosing) {
                        templateString += `</${tagName}>`;
                    }
                }

                totalProcessed++;

                if (!nextSibling) {
                    break;
                }
            }
        }

        dig();

        return templateString;
    }

    let _installTemplate2 = () => {
        let templateId = getUint16();

        //let start = performance.now();
        let templateString = _compileTemplate();

        //console.log('templateString', templateId, templateString);
        const t = _document.createElement("template");
        t.innerHTML = templateString;

        templateDefinitionMap.set(templateId, {
            tpl: t.content.firstChild,
            fn: _compileFn2(templateId)
        })
    }

    let _compileFn2 = (templateId) => {
        let fnString = "";
        let refElementsCount = getUint8();
        //offset++;

        for (let i = 0; i < refElementsCount; i++) {
            let rel = getUint8();
            let relRefId = getUint8();

            let FIRST_CHILD = 1;
            let refElName = relRefId < 255 ? relRefId : '';
            let referenceType = rel == FIRST_CHILD ? 'firstChild' : 'nextSibling';

            fnString += `let _${i}=_${refElName}.${referenceType};`;
        }

        // offset += 2 * refElementsCount;

        let anchorCount = getUint8();
        //offset++;

        fnString += 'return [[';

        let str = [];

        for (i = 0; i < anchorCount; i++) {
            let elId = getUint8();// elScript.anchors[i].el;
            let beforeElId = getUint8();

            // in beforeEl context, 255 means undefined -- ie. no beforeEl applicable. 
            // 255 that is usually used to refer to rootElement can be reused here since 
            // there is no situation in which rootElement is an anchor's beforeElement.
            let beforeElStr = beforeElId == 255 ? '' : `,marker:_${beforeElId}`;
            str.push(`{el:_${(elId < 255 ? elId : '') + beforeElStr}}`);
        }

        fnString += str.join(',') + '],[';

        //offset += 2 * anchorCount;
        let targetElementCount = getUint8();
        //offset++;

        str = [];
        for (i = 0; i < targetElementCount; i++) {
            str.push(`_${getUint8()}`);
        }
        fnString += str.join(',') + ']];';

        //console.log('fnString', templateId, fnString);

        return new Function("_", fnString);
    }


    let _createNewBlockEntry = (rootEl, targetEls, anchorDefs) => {
        return {
            rootEl,
            targetEls,
            anchors: anchorDefs.map(anchor => {
                return {
                    el: anchor.el,
                    marker: anchor.marker,
                    nodes: [],
                    blockIds: []
                }
            }),
        }
    }

    let tempMarker = _document.createTextNode('');

    let _attach = (anchor, value) => {
        let parentElement = anchor.el;
        let current = anchor.nodes;

        if (current.length) {
            parentElement.insertBefore(tempMarker, current[0]);

            current.forEach(node => {
                node.remove();
            });

            value.forEach(el => {
                parentElement.insertBefore(el, tempMarker);
            });

            tempMarker.remove();
        } else {
            value.forEach(el => {
                parentElement.insertBefore(el, anchor.marker);
            });
        }

        anchor.nodes = value;
    };

    let _attachAtAnchorV2 = () => {
        let block = getBlock(getUint16());
        let anchor = block.anchors[getUint8()];
        let elements = [];
        let newBlockIds = [];

        while (true) {
            let marker16bit = getUint16();

            // element loop termination bytes
            if (marker16bit == 65535) {
                break;
            }

            let highestOrderBit = marker16bit & (1 << 15);
            let value = marker16bit & 0x7FFF;

            // if highest order bit is 1 is blockId, if 0, it's text
            if (highestOrderBit) {
                //console.log('value', value);
                newBlockIds.push(value);
                //throw new Error('test');
                //console.log('attaching  block datum', datum);
                elements.push(getBlock(value).rootEl);
            } else {
                let text = getString(value);// textDecoder.decode(buffer.slice(6, 6 + textLength));  
                elements.push(_document.createTextNode(text)); // datum is the text
            }
        }

        _attach(anchor, elements);

        /*
        if (newBlockIds.length > 0) {
            let removedBlockIds = arrayNotInB(anchor.blockIds, newBlockIds);
            anchor.blockIds = newBlockIds; // data is list of new blockIds

            _scheduleBlocksDeletion(removedBlockIds);
        }
        */
    }

    let CMD_PING = 0;
    let CMD_INSTALL_TEMPLATE = 1;
    let CMD_INIT_WINDOW = 2;
    let CMD_ATTACH_ANCHOR = 3;
    let CMD_CLIENT_DATA_SET = 4;
    let CMD_ATTACH_EVENT = 5;
    let CMD_NAV = 6;
    let CMD_ELEMENT_UPDATE = 7;
    let CMD_INIT_BLOCK = 8;
    let CMD_REMOVE_BLOCKS = 9;
    let CMD_INSTALL_CLIENT_FUNCTION = 10;
    let CMD_RUN_CLIENT_FUNCTION = 11;

    let _processMap = {
        [CMD_INIT_BLOCK]: _initBlock,
        [CMD_INSTALL_TEMPLATE]: _installTemplate2,
        [CMD_ATTACH_ANCHOR]: _attachAtAnchorV2,
        [CMD_ATTACH_EVENT]: _attachEventHandler,
        [CMD_NAV]: () => {
            let pathLength = getUint16();
            let path = getString(pathLength);// textDecoder.decode(buffer.slice(1 + 2, 1 + 2 + pathLength));//.toString('utf8');

            _window.history.pushState({}, '', path);
        },
        [CMD_ELEMENT_UPDATE]: _elementUpdate,
        [CMD_CLIENT_DATA_SET]: () => {
            let len = getUint16();
            let clientDataString = getString(len);
            let expiration = getUint32();

            _document.cookie = `__CD=${clientDataString};`;
        },
        [CMD_REMOVE_BLOCKS]: () => {
            let blockId;

            while (blockId = getUint16()) {
                //console.log('removing', blockId);
                _blocksMap.delete(blockId);
            }
        },
        [CMD_INSTALL_CLIENT_FUNCTION]: () => {
            let clientFunctionId = getUint16();
            let functionJsonStringLength = getUint16();
            let clientFunction = JSON.parse(getString(functionJsonStringLength));

            // create a dynamic function using the function body and the dynamic argument names
            let fn = new Function(clientFunction.argNames, clientFunction.body);

            clientFunctionsMap.set(clientFunctionId, fn);
        },
        [CMD_RUN_CLIENT_FUNCTION]: () => {
            let clientFunctionId = getUint16();
            let argsJsonLength = getUint16();
            let str = getString(argsJsonLength);
            let argsList = JSON.parse(str);

            clientFunctionsMap.get(clientFunctionId).apply(null, argsList);
        }
    }

    let pongBuffer = createBuffer(5);

    let onPingArrival = () => {
        writeUint8(pongBuffer, 0, 0);

        // update buffer
        writeUInt32LE(pongBuffer, readOffset, 1);

        //console.log('pong read offset', readOffset);
        _socketSend(pongBuffer);
    }

    let _apply3 = (message) => {
        processOffset = 0;
        buffer = message.data;
        dv = new DataView(buffer);

        let opcode = dv.getUint8(0);

        if (opcode == CMD_PING) {
            onPingArrival();
        } else if (opcode == CMD_INIT_WINDOW) {
            processOffset++;

            windowId = getString(21);

            // head = 1, body = 2
            _blocksMap.set(1, initializeRootBlockWithElement(_document.head));
            _blocksMap.set(2, initializeRootBlockWithElement(_document.body));

            let length;
            let lists = [typeIdMapping, staticAttributeMap, stylePropertyKeyMap, stylePropertyValueMap];

            lists.forEach(list => {
                // index-0 is reserved
                list.push('');

                while (length = getUint8()) {
                    list.push(getString(length));
                }
            });
        } else {
            let totalLength = dv.byteLength;

            while (processOffset < totalLength) {
                let opcode = getUint8();
                let fn = _processMap[opcode];

                if (fn) {
                    fn();
                } else {
                    throw new Error('invalid opcode');
                }
            }

            readOffset += processOffset;
        }
    }

    _window.onpopstate = () => {
        let BACKNAV_COMMAND = 3;
        let pathname = _location.pathname;
        let pathnameLength = pathname.length;
        let buf = createBuffer(3 + pathnameLength);

        writeUint8(buf, BACKNAV_COMMAND, 0);
        writeUint16LE(buf, pathnameLength, 1);
        writeString(buf, pathname, 3);

        _socketSend(buf);
    }

    /*
    let _append = (elements, currentNodes, parentElement, beforeElement) => {
    
        elements.map(el => {
            parentElement.insertBefore(el, beforeElement);
            currentNodes.push(el);
        });
    
        return currentNodes;
    }
    */

    //window.templateDefinitionMap = templateDefinitionMap;

    let eventHandler = (e) => {
        let node = e.target; //(e.composedPath && e.composedPath()[0]) || e.target;

        // simulate currentTarget
        /*
        Object.defineProperty(e, "currentTarget", {
            configurable: true,
            get() {
                return node || document;
            }
        });
        */

        //console.log('e', e);
        // e.preventDefault();

        //e.preventDefault();

        while (node !== null) {

            let handlerId = clickEventHandlerIdWeakMap.get(node);

            if (handlerId) {
                e.preventDefault();
                _sendEvent(handlerId);
                return;
            }

            /*
            const handler = node[key];
            if (handler && !node.disabled) {
                const data = node[`${key}Data`];
                data !== undefined ? handler(data, e) : handler(e);
                if (e.cancelBubble) return;
            }
    
            if (node.getAttribute('data-ev')) {
                console.log('clicked proper');
            }
    
            */
            //console.log('node', node)

            node = node.parentNode;

            //node.host && node.host !== node && node.host instanceof Node ? node.host : node.parentNode;
        }

        //console.log('no click handler');
    }

    _addEventListener(_document, "click", eventHandler);

    let writeUint8 = (buf, value, offset) => {
        buf[offset] = (value & 0xff);
    }

    let writeUint16LE = (buf, value, offset) => {
        buf[offset] = (value & 0xff)
        buf[offset + 1] = (value >>> 8)
    }

    let writeUInt32LE = (buf, value, offset) => {
        buf[offset + 3] = (value >>> 24);
        buf[offset + 2] = (value >>> 16);
        buf[offset + 1] = (value >>> 8);
        buf[offset] = (value & 0xff);
    }

    let encoder = new TextEncoder();

    let blitBuffer = (src, dst, offset, length) => {
        for (let i = 0; i < length; ++i) {
            if ((i + offset >= dst.length) || (i >= src.length)) break
            dst[i + offset] = src[i]
        }
    }

    let writeString = (buf, string, offset) => {
        blitBuffer(encoder.encode(string), buf, offset, string.length);
    }
}
