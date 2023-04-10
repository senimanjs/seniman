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
  let createElement = (tagName) => _document.createElement(tagName);

  let setElementDisplay = (el, shouldDisplay) => {
    el.style.display = shouldDisplay ? 'block' : 'none';
  }

  let getBlock = (id) => _blocksMap.get(id);

  {
    let lastMessageTime = 0;
    let requestReopen = false;

    let connectSocket = () => {
      socket = new WebSocket(`${_window.origin.replace('http', 'ws')}?wi=${windowId}&ro=${readOffset}&vs=${_window.innerWidth}x${_window.innerHeight}&lo=${encodeURIComponent(_location.pathname + _location.search)}`);
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

  let _decodeServerBoundValuesBuffer = () => {
    let ARGTYPE_STRING = 1;
    let ARGTYPE_INT16 = 2;
    let ARGTYPE_INT32 = 3;
    let ARGTYPE_FLOAT64 = 4;
    let ARGTYPE_BOOLEAN = 5;
    let ARGTYPE_NULL = 6;
    let ARGTYPE_HANDLER = 7;
    let ARGTYPE_ARRAY = 8;
    let ARGTYPE_OBJECT = 9;

    let extractValue = () => {
      switch (getUint8()) {
        case ARGTYPE_HANDLER:
          let id = getUint16();
          return _portSend.bind({ id });
        case ARGTYPE_STRING:
          let stringLength = getUint16();
          return getString(stringLength);
        case ARGTYPE_INT16:
          return getInt16();
        case ARGTYPE_INT32:
          return getInt32();
        case ARGTYPE_FLOAT64:
          return getFloat64();
        case ARGTYPE_BOOLEAN:
          return !!getUint8();
        case ARGTYPE_NULL:
          return null;
        case ARGTYPE_ARRAY:
          let arrayLength = getUint16();
          let array = [];
          for (let i = 0; i < arrayLength; i++) {
            array.push(extractValue());
          }
          return array;
        case ARGTYPE_OBJECT:
          let objectLength = getUint16();
          let object = {};
          for (let i = 0; i < objectLength; i++) {
            let key = getString(getUint16());
            object[key] = extractValue();
          }
          return object;
      }
    }

    let argsCount = getUint8();
    let values = [];

    for (let i = 0; i < argsCount; i++) {
      values.push(extractValue());
    }

    return values;
  }

  let _attachEventHandlerV2 = () => {
    let blockId = getUint16();
    let targetId = getUint8();
    let eventType = getUint8(); // 1: click, 2: focus, 3: blur, 4: input, 5: scroll
    let targetHandlerElement = _getBlockTargetElement(blockId, targetId);

    let clientFnId = getUint16();
    let serverBoundValues = _decodeServerBoundValuesBuffer();

    // TODO: rename the serverFunction context key in the compiler
    let fn = clientFunctionsMap.get(clientFnId).bind({ serverFunctions: serverBoundValues });

    if (eventType == 1) {
      clickEventHandlerIdWeakMap.set(targetHandlerElement, fn);
    } else {
      let eventName = EventMap[eventType];

      _addEventListener(targetHandlerElement, eventName, fn);
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

  let getInt16 = () => {
    return dv.getInt16((processOffset += 2) - 2);
  }

  let getUint32 = () => {
    return dv.getUint32((processOffset += 4) - 4);
  }

  let getInt32 = () => {
    return dv.getInt32((processOffset += 4) - 4);
  }

  let getFloat64 = () => {
    return dv.getFloat64((processOffset += 8) - 8);
  }

  let getString = (length) => {
    // Decode the view into a string and return it
    let str = textDecoder.decode(new Uint8Array(buffer, processOffset, length));
    processOffset += length;
    return str;
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
          let key;
          // if highest order bit is 1 it's a compression map index, otherwise it's a string length
          if (key_highestOrderBit) {
            //key = stylePropertyKeyMap[keyBytes];
            key = GlobalTokenList[keyBytes];
          } else {
            key = getString(keyBytes);
          }

          let [value_highestOrderBit, valueBytes] = magicSplitUint16(getUint16());
          let value;

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
    const t = createElement("template");
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

    for (let i = 0; i < refElementsCount; i++) {
      let rel = getUint8();
      let relRefId = getUint8();

      let FIRST_CHILD = 1;

      // root has no number associated in the variable name (let _) vs (let _1)
      let refElName = relRefId < 255 ? relRefId : '';
      let referenceType = rel == FIRST_CHILD ? 'firstChild' : 'nextSibling';

      fnString += `let _${i}=_${refElName}.${referenceType};`;
    }

    let anchorCount = getUint8();

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

    let targetElementCount = getUint8();

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

    let index = getUint16();
    let [highestOrderBit, value] = magicSplitUint16(getUint16());
    let isText = !highestOrderBit;

    if (isText) {
      block._attachText(index, getString(value));
    } else {
      block._attachBlock(index, value);
    }
  }

  let headElementsMap = new Map();

  let _modifyHead = () => {
    let command = _decodeServerBoundValuesBuffer()[0];

    let CMD_HEAD_SET_TITLE = 1;
    let CMD_HEAD_ADD_STYLE = 2;
    let CMD_HEAD_ADD_LINK = 3;
    let CMD_HEAD_ADD_SCRIPT = 4;
    let CMD_HEAD_ADD_META = 5;
    let CMD_HEAD_REMOVE = 6;

    let cmdType = command.type;

    if (cmdType == CMD_HEAD_SET_TITLE) {
      _document.title = command.value;
    } else if (cmdType == CMD_HEAD_REMOVE) {
      let elToRemove = headElementsMap.get(command.id);
      elToRemove.remove();
      headElementsMap.delete(command.id);
    } else {
      let elMap = {
        [CMD_HEAD_ADD_STYLE]: 'style',
        [CMD_HEAD_ADD_LINK]: 'link',
        [CMD_HEAD_ADD_SCRIPT]: 'script',
        [CMD_HEAD_ADD_META]: 'meta'
      };

      let elType = elMap[cmdType];
      let el = createElement(elType);
      let attributes = command.attributes;

      Object.keys(attributes).forEach(key => {
        let value = attributes[key];

        if (value) {
          el.setAttribute(key, attributes[key]);
        }
      });

      if (command.text) {
        el.innerText = command.text;
      }

      let onLoad = command.onLoad;
      let onError = command.onError;

      if (onLoad) {
        // TODO: check if onload needs to be nullified after the first call
        // since some browsers will call it multiple times
        el.onload = () => onLoad();
      }

      if (onError) {
        el.onerror = () => onError();
      }

      headElementsMap.set(command.id, el);
      head.appendChild(el);
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
  let CMD_PAGE_READY = 15;
  let CMD_MODIFY_HEAD = 16;

  // fill out the 0-index to make it easier for templating to do 1-indexing
  let GlobalTokenList = [''];

  let sendPong = _portSend.bind({ id: 0 });

  let _processMap = {
    [CMD_PING]: () => sendPong(readOffset),
    [CMD_INIT_WINDOW]: () => {
      windowId = getString(21);
      let body = _document.body;
      _blocksMap.set(1, new Block(body, [], [{ el: body }]));
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
      let serverBoundValues = _decodeServerBoundValuesBuffer();
      let [argNames, body] = serverBoundValues;

      // create a dynamic function using the function body and the dynamic argument names
      let fn = new Function(argNames, body);

      clientFunctionsMap.set(clientFunctionId, fn);
    },
    [CMD_RUN_CLIENT_FUNCTION]: () => {
      let clientFunctionId = getUint16();
      let serverBoundValues = _decodeServerBoundValuesBuffer();

      clientFunctionsMap.get(clientFunctionId).apply({ serverFunctions: serverBoundValues });
    },
    [CMD_APPEND_TOKENLIST]: () => {
      let length;

      while (length = getUint8()) {
        GlobalTokenList.push(getString(length));
      }
    },
    [CMD_MODIFY_HEAD]: _modifyHead
  }

  let _apply3 = (message) => {
    processOffset = 0;
    buffer = message.data;
    dv = new DataView(buffer);

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

  //////////////////// WRITER ////////////////////

  let encoder = new TextEncoder();

  let writeUint8 = (value) => {
    contentDv.setUint8(contentBufferOffset, value);
    contentBufferOffset += 1;
  }

  let writeUint16LE = (value) => {
    contentDv.setUint16(contentBufferOffset, value, true);
    contentBufferOffset += 2;
  }

  let writeInt16LE = (value) => {
    contentDv.setInt16(contentBufferOffset, value, true);
    contentBufferOffset += 2;
  }

  let writeUInt32LE = (buf, value, offset) => {
    buf[offset + 3] = (value >>> 24);
    buf[offset + 2] = (value >>> 16);
    buf[offset + 1] = (value >>> 8);
    buf[offset] = (value & 0xff);
  }

  let writeInt32LE = (value) => {
    contentDv.setInt32(contentBufferOffset, value, true);
    contentBufferOffset += 4;
  }

  let writeFloat64LE = (value) => {
    contentDv.setFloat64(contentBufferOffset, value, true);
    contentBufferOffset += 8;
  }

  let createBuffer = (size) => new Uint8Array(size);

  // TODO: initialize sizes from window initialization parameters
  let writeBuffer = createBuffer(65536);
  let writeDv = new DataView(writeBuffer.buffer);
  let contentBuffer = createBuffer(4096);
  let contentDv = new DataView(contentBuffer.buffer);
  let contentBufferOffset = 0;
  let stringBufferMap = new Map();

  function _portSend(...args) {
    // the encoding of the message is:
    // 2 bytes for the port id
    // 2 bytes for the length of the string buffer
    // N bytes for the string buffer
    // M bytes for the content buffer

    // senimanEncode the argument list
    let [stringBufferLength, contentBufferLength] = senimanEncode(args);

    writeDv.setUint16(0, this.id, true);
    writeDv.setUint16(2, stringBufferLength, true);

    // NOTE: we don't need to copy the string buffer since we're direct-writing to the writeBuffer in senimanEncode

    // copy contentBuffer into buf at offset 4 + stringBufferOffset for length contentBufferOffset
    writeBuffer.set(contentBuffer, 4 + stringBufferLength);

    let finalLength = 2 + 2 + stringBufferLength + contentBufferLength;
    socket.send(writeBuffer.slice(0, finalLength));
  }

  function senimanEncode(value) {
    stringBufferMap.clear();
    contentBufferOffset = 0;

    const MARKERS_STRING = 1;
    const MARKERS_NUMBER_INT16 = 3;
    const MARKERS_NUMBER_INT32 = 4;
    const MARKERS_NUMBER_FLOAT64 = 5;
    const MARKERS_BOOLEAN = 6;
    const MARKERS_ARRAY = 8;
    const MARKERS_OBJECT = 9;
    const MARKERS_ARRAY_BUFFER = 10;

    let stringBufferRawOffset = 0;
    // utf-8-ed string buffer offset, which is shorter than the raw string buffer offset due to utf-8 encoding
    let stringBufferOffset = 0;

    function assignStringBufferOffset(value, useMap) {
      if (useMap && stringBufferMap.has(value)) {
        return stringBufferMap.get(value);
      }

      let encodedString = encoder.encode(value);
      let encodedStringByteLength = encodedString.byteLength;

      // write the string into the string buffer
      // + 4 since we are directly writing to the final buffer with 4 bytes of prefix (port id + string buffer length)
      //writeStringWithLength(writeBuffer, encodedString, stringBufferRawOffset + 4);
      writeBuffer.set(encodedString, stringBufferRawOffset + 4);

      stringBufferRawOffset += encodedStringByteLength;

      let stringEncodedLength = value.length;
      let entry = [stringBufferOffset, stringEncodedLength];

      stringBufferMap.set(value, entry);

      // make sure to increment the stringBufferOffset by the length of the encoded string, not the raw string byteLength
      stringBufferOffset += stringEncodedLength;

      return entry;
    }

    function encodeValue(value) {
      if (Array.isArray(value)) {
        writeUint8(MARKERS_ARRAY);
        writeUint8(value.length);
        value.forEach(encodeValue);
      } else if (typeof value === "string") {
        writeUint8(MARKERS_STRING);

        let [stringBufferOffset, encodedStringLength] = assignStringBufferOffset(value, false);

        // write the offset of the string in the string buffer
        writeUint16LE(stringBufferOffset);
        writeUint16LE(encodedStringLength);
      } else if (typeof value === "number") {
        let isInt = Number.isInteger(value);

        // TODO: revisit whether this division is reasonable
        if (isInt && Math.abs(value) < 32768) {
          writeUint8(MARKERS_NUMBER_INT16);
          writeInt16LE(value);
        } else if (isInt) {
          writeUint8(MARKERS_NUMBER_INT32);
          writeInt32LE(value);
        } else {
          writeUint8(MARKERS_NUMBER_FLOAT64);
          writeFloat64LE(value);
        }
      } else if (typeof value === "boolean") {
        writeUint8(MARKERS_BOOLEAN);
        writeUint8(value ? 1 : 0);
      } else if (value instanceof ArrayBuffer) {
        writeUint8(MARKERS_ARRAY_BUFFER);

        let arrayBufferLength = value.byteLength;

        // write the length of the array buffer
        writeUint16LE(arrayBufferLength);

        // copy the array buffer into the content buffer
        contentBuffer.set(new Uint8Array(value), contentBufferOffset);
        contentBufferOffset += arrayBufferLength;
      } else if (typeof value === "object") {
        let keys = Object.keys(value);
        writeUint8(MARKERS_OBJECT);
        writeUint8(keys.length);

        keys.forEach(key => {
          let [stringBufferOffset, encodedStringLength] = assignStringBufferOffset(key, true);
          writeUint16LE(stringBufferOffset);
          writeUint16LE(encodedStringLength);

          encodeValue(value[key]);
        });
      }
    }

    encodeValue(value);

    return [stringBufferRawOffset, contentBufferOffset];
  }
}