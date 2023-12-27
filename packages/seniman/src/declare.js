
export let blockDefinitions = new Map();
export let firstChild = 1;
export let nextSibling = 2;
//export let doubleNextSibling = 3;

let lastBlockId = 2000;

function createNewBlockId() {
    lastBlockId++;
    return lastBlockId;
}

export function _declareBlock(def) {

  if (def.v == '2.0') {
    let blockId = _declareBlockV2(def);
    return blockId;
  } else {
    let blockId = createNewBlockId();

    blockDefinitions.set(blockId, {
      id: blockId,
      tokens: def.tokens,
      templateBuffer: Buffer.from(def.templateBuffer, 'base64'),
      elScriptBuffer: Buffer.from(def.elScriptBuffer, 'base64')
    });

    return blockId;
  }
}

let CMD_INSTALL_TEMPLATE = 1;
let CMD_MODIFY_TOKENMAP = 12;

let variableScratchBuffer = Buffer.alloc(2048);
let installScratchBuffer = Buffer.alloc(4096 * 2);

export function streamBlockTemplateInstall(window, templateId) {

  let blockDef = blockDefinitions.get(templateId);

  let [tokenIndexes, installList] = installTokens2(blockDef.tokens, window.tokenList);

  if (installList) {
    variableScratchBuffer.writeUInt8(CMD_MODIFY_TOKENMAP, 0);

    let offset2 = 1;

    installList.forEach((token) => {
      let tokenLength = Buffer.byteLength(token);

      variableScratchBuffer.writeUInt8(tokenLength, offset2);
      offset2++;

      variableScratchBuffer.write(token, offset2, tokenLength);
      offset2 += tokenLength;
    });

    variableScratchBuffer.writeUInt8(0, offset2);
    offset2++;

    // copy the scratch buffer to a real command buffer
    variableScratchBuffer.copy(window._allocCommandBuffer(offset2), 0, 0, offset2);
  }

  //////////////////////////

  let offset = 0;
  installScratchBuffer.writeUInt8(CMD_INSTALL_TEMPLATE, 0);
  installScratchBuffer.writeUInt16BE(templateId, 1);
  offset += 3;

  tokenIndexes.forEach((tokenId) => {
    installScratchBuffer.writeUInt16BE(tokenId, offset);
    offset += 2;
  });

  installScratchBuffer.writeUInt16BE(0, offset);
  offset += 2;

  blockDef.templateBuffer.copy(installScratchBuffer, offset);
  offset += blockDef.templateBuffer.length;

  blockDef.elScriptBuffer.copy(installScratchBuffer, offset);
  offset += blockDef.elScriptBuffer.length;

  // copy the scratch buffer to a real command buffer
    installScratchBuffer.copy(window._allocCommandBuffer(offset), 0, 0, offset);
}

function installTokens2(blockTokens, tokenList) {

  let tokenIndexes = [];
  let installationList;

  for (let token of blockTokens) {
    if (tokenList.has(token)) {
      tokenIndexes.push(tokenList.get(token));
    } else {
      let index = tokenList.size;

      tokenList.set(token, index);

      installationList ? installationList.push(token) : installationList = [token];
      tokenIndexes.push(index);
    }
  }

  return [tokenIndexes, installationList];
}

export let clientFunctionDefinitions = new Map();

let lastClientFunctionId = 3000;

function createNewClientFunctionId() {
  lastClientFunctionId++;
  return lastClientFunctionId;
}

export function _declareClientFunction(def) {

  let clientFunctionId = createNewClientFunctionId();

  clientFunctionDefinitions.set(clientFunctionId, def);

  return clientFunctionId;
}

////////////////////////////
// V2 declare
////////////////////////////

function _declareBlockV2(def) {
  let blockId = createNewBlockId();

  let tokens = [];

  blockDefinitions.set(blockId, {
    id: blockId,
    templateBuffer: getTemplateBuffer(def.root, tokens),
    elScriptBuffer: getElscriptBuffer(def.root),
    tokens
  });

  return blockId;
}

function getTemplateBuffer(rootElement, tokens) {
  let offset = 0;
  let buf = Buffer.alloc(2048);
  let totalElementCount = 0;

  function getVariableId(tagName) {

    if (tagName == '$text') {
      return 0;
    }

    let indexOf = tokens.indexOf(tagName);

    if (indexOf == -1) {
      indexOf = tokens.length;
      tokens.push(tagName);
    }

    return indexOf + 1;
  }

  function dig(siblings) {
    let elCount = siblings.length;

    for (let i = 0; i < elCount; i++) {
      totalElementCount++;

      let el = siblings[i];
      let tagNameId = getVariableId(el.type);

      //let tagNameId = el.type == '$text' ? 32 : encodeCompressionMap.typeIdMapping[el.type];
      let filteredChildren = (el.children || []).filter(childEl => childEl.type != '$anchor');

      let hasChildren = filteredChildren.length > 0;
      let nextSibling = i < (elCount - 1);

      let firstByte = tagNameId & 63; // AND to get the first 6-bits

      if (hasChildren) {
        // set hasChildren (7th bit)
        firstByte = firstByte | (1 << 6);
      }

      if (nextSibling) {
        // set nextSibling (8th bit)
        firstByte = firstByte | (1 << 7);
      }

      buf.writeUint8(firstByte, offset);
      offset++;

      // if this is a text
      if (tagNameId == 0) {
        let textLength = Buffer.byteLength(el.text);

        buf.writeUint16BE(textLength, offset);
        offset += 2;

        // write the string
        buf.write(el.text, offset, textLength);
        offset += textLength;

      } else {

        if (el.style) {
          let attrId = getVariableId('style');
          buf.writeUint8(attrId, offset);
          offset++;

          Object.keys(el.style).forEach(propName => {
            let propValue = el.style[propName];
            let styleKeyId = getVariableId(propName);
            let styleValueId = getVariableId(propValue);

            buf.writeUint8(styleKeyId, offset);
            buf.writeUint8(styleValueId, offset + 1);

            offset += 2;
          });

          buf.writeUint8(0, offset);

          offset++;
        }

        for (let attrName in el.attributes) {

          if (attrName == 'style') {
            continue;
          }

          let attrId = getVariableId(attrName);// encodeCompressionMap.staticAttributeMap[attrName];

          if (!attrId) {
            throw new Error();
          }

          buf.writeUint8(attrId, offset);
          offset++;

          let attrValue = el.attributes[attrName];
          buf.writeUint16BE(attrValue.length, offset);

          offset += 2;
          buf.write(attrValue, offset, attrValue.length);
          offset += attrValue.length;

        }

        buf.writeUint8(0, offset);
        offset++;
      }

      if (hasChildren) {
        dig(filteredChildren);
      }
    }
  }

  dig([rootElement]);

  let elementCountBuffer = Buffer.alloc(2);

  elementCountBuffer.writeUint16BE(totalElementCount);

  return Buffer.concat([elementCountBuffer, buf.subarray(0, offset)]);
}

function getElscriptBuffer(rootElement) {

  function dig3(el) {

    if (el.type[0] == '$' || !el.children) {
      return;
    }

    let needsReference = el.target || false;
    let childrenCount = el.children.length;

    // TODO: for each anchor element, find text or element nextSibling index.
    for (let i = 0; i < childrenCount; i++) {
      let childEl = el.children[i];

      if (childEl.type == '$anchor') {
        needsReference = true;
      } else {

        if (childEl.type != '$text') {
          let childNeedsReference = dig3(childEl);

          if (childNeedsReference) {
            needsReference = childNeedsReference;
          }
        }
      }
    }

    el.needsReference = needsReference;

    return needsReference;
  }

  dig3(rootElement);

  let firstChild = 1;
  let nextSibling = 2;
  let doubleNextSibling = 3;

  let _els = [];
  let _anchors = [];
  let _targets = [];

  function _buildElScript(el, elIndex) {
    if (el.type[0] == '$' || !el.children) {
      return;
    }

    let olderSiblingIndex;
    let childrenCount = el.children.length;

    let precedingAnchors = [];
    let firstNonAnchorProcessed = false;

    for (let i = 0; i < childrenCount; i++) {
      let childEl = el.children[i];

      if (childEl.type == '$anchor') {
        let _anchor = { el: elIndex };
        _anchors.push(_anchor);
        precedingAnchors.push(_anchor);
      } else {

        if (!firstNonAnchorProcessed) {
          _els.push({
            rel: firstChild, relRefId: elIndex
          });
          firstNonAnchorProcessed = true;
        } else {
          _els.push({
            rel: nextSibling, relRefId: olderSiblingIndex
          });
        }

        let currentElIndex = _els.length - 1;

        olderSiblingIndex = currentElIndex;

        if (childEl.target) {
          _targets.push(currentElIndex);
        }

        if (childEl.needsReference) {
          _buildElScript(childEl, currentElIndex);
        }

        precedingAnchors.forEach(anchor => {
          anchor.beforeEl = currentElIndex;
        });

        precedingAnchors = [];
      }
    }
  }

  _buildElScript(rootElement, 255);

  function prune() {

    for (let i = _els.length - 1; i >= 0; i--) {

      let hasDependency = false;

      for (let j = 0; j < _els.length; j++) {
        if (_els[j].relRefId == i) {
          hasDependency = true;
          break;
        }
      }

      for (let j = 0; j < _anchors.length; j++) {
        let anchor = _anchors[j];

        if (anchor.el == i || anchor.beforeEl == i) {
          hasDependency = true;
          break;
        }
      }

      for (let j = 0; j < _targets.length; j++) {
        let targetElIndex = _targets[j];

        if (targetElIndex == i) {
          hasDependency = true;
          break;
        }
      }

      if (hasDependency) {
        continue;
      }

      // if the element can be removed, update the entries.
      _els.splice(i, 1);

      for (let j = i; j < _els.length; j++) {
        let _el = _els[j];

        if (_el.relRefId < 255 && _el.relRefId > i) {
          _el.relRefId -= 1;
        }
      }

      for (let j = 0; j < _anchors.length; j++) {

        let _anchor = _anchors[j];

        if (_anchor.el > i && _anchor.el != 255) {
          _anchor.el -= 1;
        }

        if (_anchor.beforeEl != undefined && _anchor.beforeEl > i) {
          _anchor.beforeEl -= 1;
        }
      }

      for (let j = 0; j < _targets.length; j++) {

        if (_targets[j] == 255) {
          throw new Error('Invalid compiler implementation. Root element (id 255) need not be part of the targets array.');
        }

        if (_targets[j] > i && _targets[j] != 255) {
          _targets[j] -= 1;
        }
      }
    }
  }

  prune();

  return _createElScriptBuffer(_els, _anchors, _targets);
}

function _createElScriptBuffer(els, anchors, targets) {

  let refElementsCount = els.length;
  let anchorCount = anchors.length;
  let targetElementCount = targets.length;

  let bufLen = (1 + 2 * refElementsCount) + (1 + 2 * anchorCount) + (1 + 1 * targetElementCount);
  let buf = Buffer.alloc(bufLen);

  buf.writeUint8(refElementsCount, 0);

  let offset = 1;
  for (let i = 0; i < refElementsCount; i++) {
    let refEl = els[i];
    //let relCodeMap = {firstChild}
    buf.writeUint8(refEl.rel, offset + i * 2);
    buf.writeUint8(refEl.relRefId, offset + i * 2 + 1);
  }

  offset += 2 * refElementsCount;
  buf.writeUint8(anchorCount, offset);
  offset++;

  for (let i = 0; i < anchorCount; i++) {
    let anchor = anchors[i];

    buf.writeUint8(anchor.el, offset + i * 2);

    // in beforeEl context, 255 means undefined -- ie. no beforeEl applicable. 
    // 255 that is usually used to refer to rootElement can be reused here since 
    // there is no situation in which rootElement is an anchor's beforeElement.
    buf.writeUint8(anchor.beforeEl == undefined ? 255 : anchor.beforeEl, offset + i * 2 + 1)
  }

  offset += 2 * anchorCount;
  buf.writeUint8(targetElementCount, offset);
  offset++;

  for (let i = 0; i < targetElementCount; i++) {
    let target = targets[i];

    buf.writeUint8(target, offset + i);
  }

  offset += targetElementCount;

  return buf;
}