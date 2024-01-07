let selfClosingTagSet = new Set(['br', 'hr', 'img', 'input', 'link', 'meta']);

let magicSplitUint16 = (key) => {
  return [key & (1 << 15), key & 0x7FFF];
}

function escape(s) {
  let lookup = {
    '&': "&amp;",
    '"': "&quot;",
    '\'': "&apos;",
    '<': "&lt;",
    '>': "&gt;"
  };
  return s.replace(/[&"'<>]/g, c => lookup[c]);
}

class TextNode {

  constructor(text) {
    this.text = text == '<!>' ? '' : escape(text);
    this.parentElement = null;
  }

  toString() {
    return this.text;
  }

  cloneNode() {
    return new TextNode(this.text);
  }

  after(child) {
    if (this.parentElement) {
      let index = this.parentElement.children.indexOf(this);

      if (index == -1) {
        this.parentElement.children.push(child);
      } else {
        this.parentElement.children.splice(index + 1, 0, child);
      }

      child.parentElement = this.parentElement;
    } else {
      throw new Error('Cannot call after() on a TextNode that is not attached to a parent');
    }
  }

  remove() {
    if (this.parentElement) {
      let index = this.parentElement.children.indexOf(this);

      if (index != -1) {
        this.parentElement.children.splice(index, 1);
        this.parentElement = null;
      }
    }
  }

  get nextSibling() {
    if (this.parentElement) {
      let index = this.parentElement.children.indexOf(this);
      return this.parentElement.children[index + 1];
    }
  }
}

class Element {

  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = {};
    this.styles = {};
    this.children = [];
    this.parentElement = null;

    this.style = {
      setProperty: (key, value) => {
        this.styles[key] = value;
      }
    }
  }

  printAttributes() {
    let str = '';

    for (let key in this.attributes) {
      str += ` ${key}="${this.attributes[key]}"`;
    }

    let styleKeys = Object.keys(this.styles);

    if (styleKeys.length > 0) {
      str += ` style="${styleKeys.map(key => `${key}: ${this.styles[key]}`).join('; ')}"`;
    }

    return str;
  }

  setAttribute(key, value) {
    this.attributes[key] = value;
  }

  toString() {
    if (selfClosingTagSet.has(this.tagName)) {
      return `<${this.tagName}${this.printAttributes()}/>`;
    } else {
      return `<${this.tagName}${this.printAttributes()}>${this.children.map(child => child.toString()).join('')}</${this.tagName}>`;
    }
  }

  remove() {
    if (this.parentElement) {
      let index = this.parentElement.children.indexOf(this);

      if (index != -1) {
        this.parentElement.children.splice(index, 1);
        this.parentElement = null;
      }
    }
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
  }

  insertBefore(child, beforeChild) {
    let index = this.children.indexOf(beforeChild);

    if (index == -1) {
      this.children.push(child);
    } else {
      this.children.splice(index, 0, child);
    }

    child.parentElement = this;
  }

  after(child) {
    if (this.parentElement) {
      let index = this.parentElement.children.indexOf(this);

      if (index == -1) {
        this.parentElement.children.push(child);
      } else {
        this.parentElement.children.splice(index + 1, 0, child);
      }

      child.parentElement = this.parentElement;

    } else {
      console.error('after() called on element without parentElement', this);
    }
  }

  cloneNode() {
    let newElement = createElement(this.tagName);
    newElement.attributes = { ...this.attributes };
    newElement.styles = { ...this.styles };

    this.children.forEach(child => {
      let newChild = child.cloneNode();
      newElement.appendChild(newChild);
    });

    return newElement;
  }

  get firstChild() {
    return this.children[0];
  }

  get nextSibling() {
    if (this.parentElement) {
      let index = this.parentElement.children.indexOf(this);
      return this.parentElement.children[index + 1];
    }
  }
}


function createElement(tagName) {
  return new Element(tagName);
}

export class HtmlRenderingContext {

  constructor() {
    this.templateDefinitionMap = new Map();
    this.GlobalTokenList = [''];
    this._blocksMap = new Map();

    this.headElement = createElement('head');
    this.start();

    setTimeout(() => {
      this.markReady();
    }, 100);
  }

  markReady() {
    let html = this.renderHtml();
    this.readyCallback(html);
  }

  renderHtml() {
    let string = "";

    string += "<!DOCTYPE html>";
    string += "<html>";
    string += this.headElement.toString();
    string += this._blocksMap.get(2).rootEl.toString();
    string += "</html>";

    return string;
  }

  feedBuffer(buffer) {
    this.onBufferFn(buffer);
  }

  start() {

class SequenceItem {
  constructor(seq) {
    this.seq = seq;
    this.node = null;
    this.seqId = -1;
  }
}

class Sequence {
  constructor(blocksMap, itemLength) {
    this.blocksMap = blocksMap;
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
    let node = new TextNode(text);

    this._attachSingle(index, node);

    let item = this.items[index];
    item.node = node;
    item.seqId = -1;
  }

  _attachBlock(index, blockId) {

    let block = this.blocksMap.get(blockId);

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


    class Block {
      constructor(blocksMap, rootEl, targetEls, anchorDefs) {
        this.rootEl = rootEl;
        this.targetEls = targetEls;
        this.anchors = anchorDefs.map(anchor =>
          new BlockAnchor(blocksMap, anchor.el, anchor.marker)
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
      constructor(blocksMap, el, marker) {
        this.blocksMap = blocksMap;
        this.el = el;
        this.marker = marker;

        this.node = null;
        this.seqId = -1;
      }

      _attachText(text) {
        //return;

        this._attachSingle(new TextNode(text));
      }

      _attachBlock(blockId) {

        // return;

        let block = this.blocksMap.get(blockId);// getBlock(blockId);

        if (block instanceof Sequence) {
          this._attachSeq(blockId);
        } else {
          this._attachSingle(block.rootEl);
        }
      }

      _attachSeq(seqId) {
        // clean up
        this._clean();

        let block = this.blocksMap.get(seqId);// getBlock(blockId);

        block._setParent(this);

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

          let seq = this.blocksMap.get(this.seqId);// getBlock(blockId);
          //let seq = getBlock(this.seqId);

          gatherSequenceNodes(nodes, seq);

          nodes.forEach(node => {
            node.remove();
          });
        } else if (this.node) {
          this.node.remove();
        }
      }
    }


    let _blocksMap = this._blocksMap;
    let templateDefinitionMap = this.templateDefinitionMap;
    let GlobalTokenList = this.GlobalTokenList;

    let head = this.headElement;
    let buffer;
    let processOffset = 0;

    let getBlock = (id) => this._blocksMap.get(id);

    let _initBlock = () => {
      let blockId = getUint16();
      let templateId = getUint16();
      let componentDef = templateDefinitionMap.get(templateId);
      let componentRootElement = componentDef.tpl.cloneNode(true);
      let [anchorDefs, targetEls] = componentDef.fn(componentRootElement);

      _blocksMap.set(blockId, new Block(_blocksMap, componentRootElement, targetEls, anchorDefs));
    }

    let getString = (length) => {
      let value = buffer.subarray(processOffset, processOffset + length).toString();
      processOffset += length;
      return value;
    }

    let getUint8 = () => {
      let value = buffer.readUInt8(processOffset);
      processOffset++;
      return value;
    }

    let getUint16 = () => {
      let value = buffer.readUInt16BE(processOffset);
      processOffset += 2;
      return value;
    }

    let getInt16 = () => {
      let value = buffer.readInt16BE(processOffset);
      processOffset += 2;
      return value;
    }


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
      let ARGTYPE_REF = 10;
      let ARGTYPE_CHANNEL = 11;
      let ARGTYPE_MODULE = 12;
      let ARGTYPE_ARRAY_BUFFER = 13;

      let extractValue = () => {
        switch (getUint8()) {
          case ARGTYPE_HANDLER:
            let id = getUint16();

            return (...args) => {
              return _portSend(id, ...args);
            }
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
          case ARGTYPE_REF:
            let refId = getUint16();
            return null;
          case ARGTYPE_CHANNEL:
            let channelId = getUint16();
            return getChannelObject(channelId);
          case ARGTYPE_MODULE:
            let moduleId = getUint16();
            return moduleMap.get(moduleId);
          case ARGTYPE_ARRAY_BUFFER:
            let arrayBufferLength = getUint16();
            let dstUint8 = new Uint8Array(arrayBufferLength);

            dstUint8.set(getUint8Array(arrayBufferLength));

            return dstUint8.buffer;
        }
      }

      let argsCount = getUint8();
      let values = [];

      for (let i = 0; i < argsCount; i++) {
        values.push(extractValue());
      }

      return values;
    }

    let _compileTemplate = (templateTokenList) => {

      let totalElementCount = getUint16();
      let totalProcessed = 0;
      let rootElement;

      let dig = (parentElement) => {

        while (totalProcessed < totalElementCount) {
          let firstByte = getUint8();
          let tagNameId = firstByte & 63; // get first 6 bits of the byte
          let nextSibling = (firstByte & 128) > 0; // 8th-bit

          // handle if text
          if (tagNameId == 0) {
            let textLength = getUint16();
            let str = getString(textLength);
            let textNode = new TextNode(str);

            if (parentElement) {
              parentElement.appendChild(textNode);
            } else {
              rootElement = textNode;
            }
          } else {
            let attrId;
            let tagName = templateTokenList[tagNameId - 1];
            let element = createElement(tagName);
            let isSelfClosing = selfClosingTagSet.has(tagName);

            while (attrId = getUint8()) {
              let attrName = templateTokenList[attrId - 1];
              let attrValueString = '';

              if (attrName == 'style') {
                let propKeyId;

                while (propKeyId = getUint8()) {
                  let propKey = templateTokenList[propKeyId - 1];
                  let propValueId = getUint8();
                  let propValue = templateTokenList[propValueId - 1];

                  element.style.setProperty(propKey, propValue);
                }
              } else {
                let attrValueLength = getUint16();
                attrValueString = getString(attrValueLength);

                element.setAttribute(attrName, attrValueString);
              }
            }

            if (parentElement) {
              parentElement.appendChild(element);
            } else {
              rootElement = element;
            }

            if (!isSelfClosing) {
              let hasChildren = (firstByte & 64) > 0; // 7th-bit

              if (hasChildren) {
                dig(element);
              }
            }
          }

          totalProcessed++;

          if (!nextSibling) {
            break;
          }
        }
      }

      dig();

      return rootElement;
    }

    let _getBlockTargetElement = (blockId, targetId) => {
      let block = getBlock(blockId);
      return targetId == 255 ? block.rootEl : block.targetEls[targetId];
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
                //targetHandlerElement.checked = true;
              } else if (propName == 'value') {
                //targetHandlerElement.value = propValue;
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
            let propName = this.GlobalTokenList[mapIndex];

            if (propName == 'checked') {
              //targetHandlerElement.checked = false;
            } else if (propName == 'value') {
              //targetHandlerElement.value = '';
            } else {
              //targetHandlerElement.removeAttribute(propName);
            }

            break;
          }
        case UPDATE_MODE_MULTI_STYLEPROP:
          let keyLength;
          //targetHandlerElement.style.cssText = '';

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
        default:
          throw new Error(`Unknown update mode: ${updateMode}`);
      }
    }

    // we need can't do new Function in this context since CloudFlare workers service worker syntax does not support it
    let _compileFn3 = (templateId) => {
      let refElementsCount = getUint8();
      let refEls = [];
      let anchorEls = [];
      let targetElIds = [];

      for (let i = 0; i < refElementsCount; i++) {
        let rel = getUint8();
        let relRefId = getUint8();

        refEls.push({ relRefId, rel });
      }

      let anchorCount = getUint8();

      for (let i = 0; i < anchorCount; i++) {
        let elId = getUint8();
        let beforeElId = getUint8();

        // in beforeEl context, 255 means undefined -- ie. no beforeEl applicable. 
        // 255 that is usually used to refer to rootElement can be reused here since 
        // there is no situation in which rootElement is an anchor's beforeElement.
        // let beforeElStr = beforeElId == 255 ? '' : `,marker:_${beforeElId}`;
        // str.push(`{el:_${(elId < 255 ? elId : '') + beforeElStr}}`);
        anchorEls.push({ elId, beforeElId });
      }

      let targetElementCount = getUint8();

      for (let i = 0; i < targetElementCount; i++) {

        let elId = getUint8();

        targetElIds.push(elId);
      }

      return (rootElement) => {
        let $els = [];

        for (let i = 0; i < refElementsCount; i++) {
          let { relRefId, rel } = refEls[i];
          let FIRST_CHILD = 1;
          let refEl = relRefId < 255 ? $els[relRefId] : rootElement;

          $els.push(rel == FIRST_CHILD ? refEl.firstChild : refEl.nextSibling);
        }

        let $anchors = [];

        for (let i = 0; i < anchorCount; i++) {
          let { elId, beforeElId } = anchorEls[i];

          let $el = elId == 255 ? rootElement : $els[elId];
          let $beforeEl = beforeElId == 255 ? null : $els[beforeElId];

          if ($beforeEl) {
            $anchors.push({
              el: $el,
              marker: $beforeEl
            });
          } else {
            $anchors.push({
              el: $el
            });
          }
        }

        let $targets = [];

        for (let i = 0; i < targetElementCount; i++) {
          let elId = targetElIds[i];

          $targets.push($els[elId]);
        }

        return [$anchors, $targets];
      };
    }

    let _initSequence = () => {

      let seqId = getUint16();
      let seqLength = getUint16();

      _blocksMap.set(seqId, new Sequence(_blocksMap, seqLength));
    };

    let _modifySequence = () => {
      let seq = getBlock(getUint16());
      seq._modify();
    }

    let _installTemplate2 = () => {
      let templateId = getUint16();
      let templateTokenList = [];
      let id;

      while (id = getUint16()) {
        templateTokenList.push(GlobalTokenList[id]);
      }

      let templateNode = _compileTemplate(templateTokenList);

      templateDefinitionMap.set(templateId, {
        tpl: templateNode,
        fn: _compileFn3(templateId)
      })
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

    let _attachEventHandlerV2 = () => {
      let blockId = getUint16();
      let targetId = getUint8();
      let eventType = getUint8(); // 1: click, 2: focus, 3: blur, 4: input, 5: scroll
      // let targetHandlerElement = _getBlockTargetElement(blockId, targetId);

      let clientFnId = getUint16();
      let serverBoundValues = _decodeServerBoundValuesBuffer();
    }

    let _processMap = [
      // 0: CMD_PING
      () => {
        console.log('CMD_PING');
      },
      // 1: CMD_INSTALL_TEMPLATE
      _installTemplate2,
      // 2: CMD_INIT_WINDOW
      () => {
        processOffset += 21;
        let body = createElement('body');
        _blocksMap.set(1, new Block(_blocksMap, head, [], [{ el: head }]));
        _blocksMap.set(2, new Block(_blocksMap, body, [], [{ el: body }]));
      },
      // 3: CMD_ATTACH_ANCHOR
      _attachAtAnchorV2,

      // 4: CMD_ATTACH_REF,
      () => {
        let blockId = getUint16();
        let targetElIndex = getUint16();
        let refId = getUint16();
      },

      // 5: CMD_ATTACH_EVENT
      _attachEventHandlerV2,

      // 6: CMD_INSTALL_EVENT_TYPE
      () => {
        let eventType = getUint8();
        let eventName = getString(getUint8());
      },

      // 7: CMD_ELEMENT_UPDATE
      _elementUpdate,

      // 8: CMD_INIT_BLOCK
      _initBlock,

      // 9: CMD_REMOVE_BLOCKS
      () => {
        let blockId;

        while (blockId = getUint16()) {
          _blocksMap.delete(blockId);
        }
      },

      // 10: CMD_INSTALL_CLIENT_FUNCTION
      () => {
        let clientFunctionId = getUint16();
        let serverBoundValues = _decodeServerBoundValuesBuffer();
      },

      // 11: CMD_RUN_CLIENT_FUNCTION
      () => {
        let clientFunctionId = getUint16();
        let serverBoundValues = _decodeServerBoundValuesBuffer();
      },

      // 12: CMD_APPEND_TOKENLIST
      () => {
        let length;

        while (length = getUint8()) {
          GlobalTokenList.push(getString(length));
        }
      },

      // 13: CMD_INIT_SEQUENCE
      _initSequence,

      // 14: CMD_MODIFY_SEQUENCE
      _modifySequence,

      // 15: CMD_CHANNEL_MESSAGE
      () => {
        let channelId = getUint16();
        let serverBoundValues = _decodeServerBoundValuesBuffer();
      },

      // 16: CMD_INIT_MODULE
      () => {
        let moduleId = getUint16();
        let clientFunctionId = getUint16();
        let serverBoundValues = _decodeServerBoundValuesBuffer();
      }
    ];

    this.onBufferFn = (_buffer) => {
      processOffset = 0;
      buffer = _buffer;
      let totalLength = _buffer.length;

      while (processOffset < totalLength) {
        let opcode = getUint8();
        let fn = _processMap[opcode];

        if (fn) {
          fn();
        } else {
          throw new Error('invalid opcode');
        }
      }
    }
  }

  onRenderComplete(readyCallback) {
    this.readyCallback = readyCallback;
  }

  onRenderError(callback) {
    // TODO: implement
  }
}