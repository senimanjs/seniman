{
  let _window = window;
  let _document = document;
  let _location = location;
  let head = _document.head;

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

  let viewportUpdateBuffer = createBuffer(5);
  let getWindowSize = () => [_window.innerWidth, _window.innerHeight];

  _addEventListener(window, 'resize', throttleDebounce(() => {
    let [width, height] = getWindowSize();

    writeUint8(viewportUpdateBuffer, 5, 0);
    writeUint16LE(viewportUpdateBuffer, width, 1);
    writeUint16LE(viewportUpdateBuffer, height, 3);

    _socketSend(viewportUpdateBuffer);
  }, 1000));

  {
    let lastMessageTime = 0;
    let requestReopen = false;

    let connectSocket = () => {
      let [width, height] = getWindowSize();
      socket = new WebSocket(`${_window.origin.replace('http', 'ws')}?wi=${windowId}&ro=${readOffset}&vs=${width}x${height}&lo=${encodeURIComponent(_location.pathname + _location.search)}`);
      socket.binaryType = "arraybuffer";

      socket.onopen = (e) => {

      };

      socket.onmessage = (msg) => {
        lastMessageTime = now();
        _apply3(msg);
      }

      socket.onclose = (event) => {
        let code = event.code;

        if (code == 3001) {
          _location.reload();
        } else if (code == 3010) {
          // excessive window creation error
          // TODO: do nothing for now
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
    }, 500);

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

  //////////////////////////////////////////////////////////////////////////////
  //// GLOBAL STATE
  //////////////////////////////////////////////////////////////////////////////

  let _clientVarMap = new Map();

  _window.setVar = (varName, varValue) => {
    _clientVarMap.set(varName, varValue);
  }

  _window.readVar = (varName) => {
    return _clientVarMap.get(varName);
  }

  _window.deleteVar = (varName) => {
    _clientVarMap.delete(varName);
  }

  let _blocksMap = new Map();
  let templateDefinitionMap = new Map();
  let clientFunctionsMap = new Map();

  // TODO: have this somehow be given by the server -- 
  // the complete list is longer than this and we want this file to be as small as possible
  let selfClosingTagSet = new Set(['br', 'hr', 'img', 'input']);

  let initializeRootBlockWithElement = (el) => new Block(el, [], [{ el }]);

  let clickEventHandlerIdWeakMap = new WeakMap();

  let _getBlockTargetElement = (blockId, targetId) => {
    let block = getBlock(blockId);
    return targetId == 255 ? block.rootEl : block.targetEls[targetId];
  }

  let EventMap = {
    2: 'focus',
    3: 'blur',
    4: 'input',
    5: 'scroll',
    6: 'keydown',
    7: 'keyup',
    8: 'mouseenter',
    9: 'mouseleave'
  };

  let _attachEventHandlerV2 = () => {
    let blockId = getUint16();
    let targetId = getUint8();
    let eventType = getUint8(); // 1: click, 2: focus, 3: blur, 4: input, 5: scroll
    let targetHandlerElement = _getBlockTargetElement(blockId, targetId);

    let clientFnId = getUint16();
    let fn = clientFunctionsMap.get(clientFnId);

    let serverFunctions = [];
    let bindId;

    while ((bindId = getUint16())) {
      let _bindId = bindId;

      serverFunctions.push((data) => {
        _sendEvent(_bindId, data);
      });
    }

    if (serverFunctions.length) {
      fn = fn.bind({ serverFunctions });
    }

    if (eventType == 1) {
      clickEventHandlerIdWeakMap.set(targetHandlerElement, fn);
    } else {
      let eventName = EventMap[eventType];

      _addEventListener(targetHandlerElement, eventName, fn);
    }
  }

  let _sendEvent = (handlerId, data) => {
    let dataLength;
    let encodedString;

    if (data) {
      encodedString = encoder.encode(JSON.stringify(data));
      dataLength = encodedString.byteLength;
    } else {
      dataLength = 0;
    }

    let buf = createBuffer(5 + dataLength);
    let EVENT_COMMAND = 1;

    writeUint8(buf, EVENT_COMMAND, 0);
    writeUint16LE(buf, handlerId, 1);
    writeUint16LE(buf, dataLength, 3);

    if (dataLength) {
      writeString(buf, encodedString, 5);
    }

    _socketSend(buf);
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

  let magicSplitUint16 = (key) => {
    return [key & (1 << 15), key & 0x7FFF];
  }

  let _elementUpdate = () => {
    let blockId = getUint16(); //buf.writeUint16LE(parentBlockId, 1);
    let targetId = getUint8();
    let updateMode = getUint8();

    let targetHandlerElement = _getBlockTargetElement(blockId, targetId);

    let UPDATE_MODE_STYLEPROP = 1;
    let UPDATE_MODE_SET_ATTR = 2;
    //let UPDATE_MODE_SET_CLASS = 3;
    //let UPDATE_MODE_REMOVE_CLASS = 4;
    let UPDATE_MODE_REMOVE_ATTR = 5;
    let UPDATE_MODE_MULTI_STYLEPROP = 7;

    switch (updateMode) {
      case UPDATE_MODE_STYLEPROP:
      case UPDATE_MODE_SET_ATTR:
        {
          let mapIndex = getUint8();
          let propName = GlobalTokenList[mapIndex];

          let propValueLength = getUint16();
          let propValue = getString(propValueLength);

          if (updateMode == UPDATE_MODE_STYLEPROP) {
            targetHandlerElement.style.setProperty(propName, propValue);
          } else {
            if (propName == 'checked') {
              targetHandlerElement.checked = true;
            } else if (propName == 'value') {
              targetHandlerElement.value = propValue;
            } else {
              targetHandlerElement.setAttribute(propName, propValue);
            }
          }
          break;
        }

      /*
      case UPDATE_MODE_SET_CLASS:
      case UPDATE_MODE_REMOVE_CLASS:
          {
              let nameLength = getUint8();
              let name = nameLength ? getString(nameLength) : '';

              if (nameLength) {
                  let name = getString(nameLength);
                  targetHandlerElement.setAttribute('class', name);//, updateMode == 3); // if updateMode == 4, then class is removed
              }
              
              //targetHandlerElement.setAttribute('class', name);
              break;
          }
      */
      case UPDATE_MODE_REMOVE_ATTR:
        {
          let mapIndex = getUint8();
          let propName = GlobalTokenList[mapIndex];

          if (propName == 'checked') {
            targetHandlerElement.checked = false;
          } else if (propName == 'value') {
            targetHandlerElement.value = '';
          } else {
            targetHandlerElement.removeAttribute(propName);
          }

          break;
        }
      case UPDATE_MODE_MULTI_STYLEPROP:
        let keyLength;
        targetHandlerElement.style.cssText = '';

        //console.log('UPDATE_MODE_MULTI_STYLEPROP', updateMode == UPDATE_MODE_STYLEPROP ? 'STYLEPROP' : 'SET_ATTR');
        while ((keyLength = getUint16()) > 0) {
          let [key_highestOrderBit, keyBytes] = magicSplitUint16(keyLength);

          // if highest order bit is 1 it's a compression map index, otherwise it's a string length
          if (key_highestOrderBit) {
            //key = stylePropertyKeyMap[keyBytes];
            key = GlobalTokenList[keyBytes];
          } else {
            key = getString(keyBytes);
          }

          let [value_highestOrderBit, valueBytes] = magicSplitUint16(getUint16());

          if (value_highestOrderBit) {
            //value = stylePropertyValueMap[valueBytes]; // index is 1-based
            value = GlobalTokenList[valueBytes];
          } else {
            value = getString(valueBytes);
          }

          targetHandlerElement.style.setProperty(key, value);
        }

        break;
    }
  }

  let _compileTemplate = (templateTokenList) => {

    let totalElementCount = getUint16();
    let totalProcessed = 0;
    let templateString = '';
    let isSvg = false;

    let dig = (isRoot) => {

      while (totalProcessed < totalElementCount) {
        let firstByte = getUint8();
        let tagNameId = firstByte & 63; // get first 6 bits of the byte
        let nextSibling = (firstByte & 128) > 0; // 8th-bit

        // handle if text
        if (tagNameId == 0) {
          let textLength = getUint16();
          templateString += getString(textLength);
        } else {
          let attrId;
          let tagName = templateTokenList[tagNameId - 1];
          let isSelfClosing = selfClosingTagSet.has(tagName);

          templateString += `<${tagName}`;

          if (isRoot && tagName == 'path') {
            isSvg = true;
          }

          while (attrId = getUint8()) {
            let attrName = templateTokenList[attrId - 1];
            let attrValueString = '';

            if (attrName == 'style') {
              let propKeyId;

              while ((propKeyId = getUint8())) {
                let propKey = templateTokenList[propKeyId - 1];
                let propValueId = getUint8();
                let propValue = templateTokenList[propValueId - 1];

                attrValueString += `${propKey}:${propValue};`;
              }
            } else {
              let attrValueLength = getUint16();
              attrValueString = getString(attrValueLength);
            }

            templateString += ` ${attrName}="${attrValueString}"`;
          }

          templateString += '>';

          if (!isSelfClosing) {
            let hasChildren = (firstByte & 64) > 0; // 7th-bit

            if (hasChildren) {
              dig(false);
            }

            templateString += `</${tagName}>`;
          }
        }

        totalProcessed++;

        if (!nextSibling) {
          break;
        }
      }
    }

    dig(true);

    // TODO: this is a hack to make SVG work -- do this during compilation?
    if (isSvg) {
      templateString = `<svg>${templateString}</svg>`;
    }

    return [templateString, isSvg];
  }

  let _installTemplate2 = () => {
    let templateId = getUint16();

    let templateTokenList = [];

    let id;

    while (id = getUint16()) {
      templateTokenList.push(GlobalTokenList[id]);
    }

    let [templateString, isSvg] = _compileTemplate(templateTokenList);

    //console.log('templateString', templateId, templateString);
    const t = _document.createElement("template");
    t.innerHTML = templateString;

    let node = t.content.firstChild;

    if (isSvg) {
      node = node.firstChild;
    }

    templateDefinitionMap.set(templateId, {
      tpl: node,
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

      // root has no number associated in the variable name (let _) vs (let _1)
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

    return new Function("_", fnString);
  }

  class Block {
    constructor(rootEl, targetEls, anchorDefs) {
      this.rootEl = rootEl;
      this.targetEls = targetEls;
      this.anchors = anchorDefs.map(anchor =>
        new BlockAnchor(anchor.el, anchor.marker)
      );
    }

    _attachText(index, text) {
      this.anchors[index]._attachText(text);
    }

    _attachBlock(index, blockId) {
      this.anchors[index]._attachBlock(blockId);
    }
  }

  class BlockAnchor {
    constructor(el, marker) {
      this.el = el;
      this.marker = marker;

      this.node = null;
      this.seqId = -1;
    }

    _attachText(text) {
      this._attachSingle(_document.createTextNode(text));
    }

    _attachBlock(blockId) {
      let block = getBlock(blockId);

      if (block instanceof Sequence) {
        this._attachSeq(blockId);
      } else {
        this._attachSingle(block.rootEl);
      }
    }

    _attachSeq(seqId) {
      // clean up
      this._clean();

      getBlock(seqId)._setParent(this);

      this.node = null;
      this.seqId = seqId;
    }

    _attachSingle(newNode) {
      //let current = this.nodes;
      // clean up
      this._clean();
      // insert new node
      this.el.insertBefore(newNode, this.marker);

      this.node = newNode;
      this.seqId = -1;
    }

    _clean() {
      if (this.seqId > -1) {
        let nodes = [];
        let seq = getBlock(this.seqId);

        gatherSequenceNodes(nodes, seq);

        nodes.forEach(node => {
          node.remove();
        });
      } else if (this.node) {
        this.node.remove();
      }
    }
  }

  let gatherSequenceNodes = (nodes, seq) => {

    seq.items.forEach(item => {
      if (item instanceof Sequence) {
        throw new Error('nested sequence is not yet supported');
        //gatherSequenceNodes(nodes, item.seqId);
      } else {

        if (item.node) {
          nodes.push(item.node);
        }
      }
    });
  }

  let _initBlock = () => {
    let blockId = getUint16();
    let templateId = getUint16();
    let componentDef = templateDefinitionMap.get(templateId);
    let componentRootElement = componentDef.tpl.cloneNode(true);//[templateIndex];
    let [anchorDefs, targetEls] = componentDef.fn(componentRootElement);

    _blocksMap.set(blockId, new Block(componentRootElement, targetEls, anchorDefs));
  }

  class SequenceItem {
    constructor(seq) {
      this.seq = seq;
      this.node = null;
      this.seqId = -1;
    }
  }

  class Sequence {
    constructor(itemLength) {
      this.items = [];
      this.parent = null;

      for (let i = 0; i < itemLength; i++) {
        this.items.push(new SequenceItem(this));
      }
    }

    _modify() {
      // modify code
      // 3: insert, 4: remove
      let modifyCode = getUint8();
      let index = getUint16();
      let count = getUint16();

      switch (modifyCode) {
        case 3: // INSERT 
          for (let i = 0; i < count; i++) {
            this.items.splice(index + i, 0, new SequenceItem(this));
          }
          break;
        case 4:  // REMOVE
          for (let i = 0; i < count; i++) {
            this.items[index + i].node.remove();
          }

          this.items.splice(index, count);
          break;
      }
    }

    _setParent(parent) {
      this.parent = parent;
    }

    _getBeforeSiblingInsertReference(index) {
      while (--index >= 0) {
        let item = this.items[index];

        if (item.node) {
          return item.node;
        }

        // TODO: check if item is a sequence
      }
    }

    _getAfterSiblingInsertReference(index) {
      while (++index < this.items.length) {
        let item = this.items[index];

        if (item.node) {
          return item.node;
        }

        // TODO: check if item is a sequence
      }
    }

    _getParentInsertReference() {
      return {
        el: this.parent.el,
        marker: this.parent.marker
      }
    }

    _attachSingle(index, newNode) {
      let prevNode = this.items[index].node;

      // if the sequence item has an existing node, just replace it
      if (prevNode) {
        prevNode.replaceWith(newNode);
        return;
      }

      // if this isn't the first item, try to find before sibling reference
      if (index > 0) {
        let refEl = this._getBeforeSiblingInsertReference(index);

        if (refEl) {
          refEl.after(newNode);
          return;
        }
      }

      // if this isn't the last item, try to find after sibling reference
      if (index < this.items.length - 1) {
        let refEl = this._getAfterSiblingInsertReference(index);

        if (refEl) {
          refEl.parentElement.insertBefore(newNode, refEl);
          return;
        }
      }

      let parentRef = this._getParentInsertReference();

      parentRef.el.insertBefore(newNode, parentRef.marker);
    }

    _attachText(index, text) {
      let node = _document.createTextNode(text);

      this._attachSingle(index, node);

      let item = this.items[index];
      item.node = node;
      item.seqId = -1;
    }

    _attachBlock(index, blockId) {

      let block = getBlock(blockId);

      if (block instanceof Sequence) {
        throw new Error('nested sequence is not yet supported');
        //this._attachSeq(index, block);
      } else {
        let node = block.rootEl;
        this._attachSingle(index, node);

        let item = this.items[index];
        item.node = node;
        item.seqId = -1;
      }
    }
  }

  let _initSequence = () => {
    let seqId = getUint16();
    let seqLength = getUint16();

    _blocksMap.set(seqId, new Sequence(seqLength));
  }

  let _modifySequence = () => {
    let seq = getBlock(getUint16());
    seq._modify();
  }

  let _attachAtAnchorV2 = () => {
    let blockId = getUint16();
    let block = getBlock(blockId);

    let index = getUint8();
    let [highestOrderBit, value] = magicSplitUint16(getUint16());
    let isText = !highestOrderBit;

    if (isText) {
      block._attachText(index, getString(value));
    } else {
      block._attachBlock(index, value);
    }
  }

  let CMD_PING = 0;
  let CMD_INSTALL_TEMPLATE = 1;
  let CMD_INIT_WINDOW = 2;
  let CMD_ATTACH_ANCHOR = 3;
  let CMD_ATTACH_EVENT_V2 = 5;
  let CMD_ELEMENT_UPDATE = 7;
  let CMD_INIT_BLOCK = 8;
  let CMD_REMOVE_BLOCKS = 9;
  let CMD_INSTALL_CLIENT_FUNCTION = 10;
  let CMD_RUN_CLIENT_FUNCTION = 11;
  let CMD_APPEND_TOKENLIST = 12;
  let CMD_INIT_SEQUENCE = 13;
  let CMD_MODIFY_SEQUENCE = 14;

  // fill out the 0-index to make it easier for templating to do 1-indexing
  let GlobalTokenList = [''];

  let _processMap = {
    [CMD_INIT_WINDOW]: () => {
      windowId = getString(21);

      // head = 1, body = 2
      _blocksMap.set(1, initializeRootBlockWithElement(head));
      _blocksMap.set(2, initializeRootBlockWithElement(_document.body));
    },
    [CMD_INIT_BLOCK]: _initBlock,
    [CMD_INIT_SEQUENCE]: _initSequence,
    [CMD_MODIFY_SEQUENCE]: _modifySequence,
    [CMD_INSTALL_TEMPLATE]: _installTemplate2,
    [CMD_ATTACH_ANCHOR]: _attachAtAnchorV2,
    [CMD_ATTACH_EVENT_V2]: _attachEventHandlerV2,
    [CMD_ELEMENT_UPDATE]: _elementUpdate,
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
      let serverFunctions = [];
      let bindId;

      while ((bindId = getUint16())) {
        let _bindId = bindId;

        serverFunctions.push((data) => {
          _sendEvent(_bindId, data);
        });
      }

      let argsJsonLength = getUint16();
      let str = getString(argsJsonLength);
      let argsList = JSON.parse(str);

      let thisContext = null;

      if (serverFunctions.length) {
        thisContext = { serverFunctions };
      }

      clientFunctionsMap.get(clientFunctionId).apply(thisContext, argsList);
    },
    [CMD_APPEND_TOKENLIST]: () => {
      let length;

      while (length = getUint8()) {
        GlobalTokenList.push(getString(length));
      }
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
    writeString(buf, encoder.encode(pathname), 3);

    _socketSend(buf);
  }

  let eventHandler = (e) => {
    let node = e.target;

    while (node !== null) {
      let handlerFn = clickEventHandlerIdWeakMap.get(node);

      if (handlerFn) {
        handlerFn(e);
        if (e.defaultPrevented) {
          return;
        }
      }

      node = node.parentNode;
    }
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

  let writeString = (buf, encodedString, offset) => {
    let length = encodedString.byteLength;

    for (let i = 0; i < length; ++i) {
      if ((i + offset >= buf.length) || (i >= encodedString.length)) break
      buf[i + offset] = encodedString[i]
    }
  }

  window.loadStyle = (url) => {
    // Create new link Element
    var link = _document.createElement('link');

    // set the attributes for link element
    link.rel = 'stylesheet';
    link.href = url;

    // Get HTML head element to append
    // link element to it
    head.appendChild(link);
  }

  // logic taken from npm package load-script
  window.loadScript = (src, cb, opts) => {
    var script = _document.createElement('script');
    opts = opts || {};
    cb = cb || function () { };

    //script.type = opts.type || 'text/javascript';
    //script.charset = opts.charset || 'utf8';
    script.async = true;//'async' in opts ? !!opts.async : true;
    script.src = src

    stdOnEnd(script, cb);

    head.appendChild(script);

    function stdOnEnd(script, cb) {
      script.onload = function () {
        this.onerror = this.onload = null
        cb(null, script)
      }

      script.onerror = function () {
        // this.onload = null here is necessary
        // because even IE9 works not like others
        this.onerror = this.onload = null
        cb(new Error('Failed to load ' + this.src), script)
      }
    }
  }
}
