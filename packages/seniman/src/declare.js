import { MAX_PAGE_SIZE } from './buffer-pool.js';

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
  if (def.v != '2.0') {
    throw new Error(
      `Unsupported block definition version: ${def.v}. ` +
      `Recompile with the seniman babel plugin that ships with this version of seniman.`
    );
  }

  return _declareBlockV2(def);
}

let CMD_INSTALL_TEMPLATE = 1;
let CMD_MODIFY_TOKENMAP = 12;

export function streamBlockTemplateInstall(window, templateId) {

  let blockDef = blockDefinitions.get(templateId);

  let [tokenIndexes, installList] = installTokens2(blockDef.tokens, window.tokenList);

  if (installList) {
    let tokenBuffers = installList.map(token => Buffer.from(token));
    let commandSize = 2;

    for (let tokenBuffer of tokenBuffers) {
      if (tokenBuffer.length > 255) {
        throw new Error('Template tokens cannot exceed 255 bytes');
      }
      commandSize += 1 + tokenBuffer.length;
    }

    let buf = window._allocCommandPage(commandSize);
    let commandOffset = window.commandBufferOffset;
    buf.writeUInt8(CMD_MODIFY_TOKENMAP, commandOffset);
    let offset2 = commandOffset + 1;

    tokenBuffers.forEach((tokenBuffer) => {
      buf.writeUInt8(tokenBuffer.length, offset2);
      offset2++;

      tokenBuffer.copy(buf, offset2);
      offset2 += tokenBuffer.length;
    });

    buf.writeUInt8(0, offset2);
  }

  //////////////////////////

  let commandSize = 3 + tokenIndexes.length * 2 + 2
    + blockDef.templateBuffer.length + blockDef.elScriptBuffer.length;
  let installBuffer = window._allocCommandPage(commandSize);
  let offset = window.commandBufferOffset;
  installBuffer.writeUInt8(CMD_INSTALL_TEMPLATE, offset);
  installBuffer.writeUInt16BE(templateId, offset + 1);
  offset += 3;

  tokenIndexes.forEach((tokenId) => {
    installBuffer.writeUInt16BE(tokenId, offset);
    offset += 2;
  });

  installBuffer.writeUInt16BE(0, offset);
  offset += 2;

  blockDef.templateBuffer.copy(installBuffer, offset);
  offset += blockDef.templateBuffer.length;

  blockDef.elScriptBuffer.copy(installBuffer, offset);
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
  let templateBuffer = getTemplateBuffer(def.root, tokens);
  let elScriptBuffer = getElscriptBuffer(def.root);

  // Must match the CMD_INSTALL_TEMPLATE size computed in streamBlockTemplateInstall.
  // Checked here so an oversized block fails at module load instead of first render.
  let installCommandSize = 3 + tokens.length * 2 + 2 + templateBuffer.length + elScriptBuffer.length;

  if (installCommandSize > MAX_PAGE_SIZE) {
    throw new Error(
      `Seniman template limit reached: this block's template is ${installCommandSize} bytes, exceeding ` +
      `SENIMAN_MAX_PAGE_SIZE=${MAX_PAGE_SIZE}. ` +
      `Try wrapping a bigger section into a separate block (e.g. {<div>...</div>}) or extracting a component.`
    );
  }

  blockDefinitions.set(blockId, {
    id: blockId,
    templateBuffer,
    elScriptBuffer,
    tokens
  });

  return blockId;
}

// In-memory reference to a block's root element while building ELSCRIPT; encoded as 255 on the wire.
const ROOT_EL_REF = -1;

function encodeElRef(ref) {
  return ref == ROOT_EL_REF ? 255 : ref;
}

// Template length prefixes and the element count are encoded as uint16.
const MAX_UINT16 = 65535;

function getTemplateBuffer(rootElement, tokens) {
  let offset = 0;
  let buf = Buffer.alloc(2048);
  let totalElementCount = 0;

  function ensureCapacity(byteCount) {
    let required = offset + byteCount;

    if (required <= buf.length) {
      return;
    }

    let newLength = buf.length * 2;

    while (newLength < required) {
      newLength *= 2;
    }

    let newBuf = Buffer.alloc(newLength);
    buf.copy(newBuf, 0, 0, offset);
    buf = newBuf;
  }

  function checkStringLength(byteLength, what) {
    if (byteLength > MAX_UINT16) {
      throw new Error(
        `Seniman template limit reached: a static ${what} in this block is ${byteLength} bytes, ` +
        `exceeding the 16-bit length limit of ${MAX_UINT16} bytes. ` +
        `Pass it as a dynamic expression instead (e.g. {value}).`
      );
    }
  }

  function getVariableId(tagName) {

    if (tagName == '$text') {
      return 0;
    }

    let indexOf = tokens.indexOf(tagName);

    if (indexOf == -1) {
      indexOf = tokens.length;
      tokens.push(tagName);
    }

    let id = indexOf + 1;

    // Tag IDs are encoded into 6 bits in the template buffer (max 63).
    if (id > 63) {
      throw new Error(
        `Seniman template limit reached: this block uses more than 63 unique tokens before/including tag "${tagName}". ` +
        `Template tag IDs are 6-bit encoded, so tag IDs above 63 will corrupt the DOM. ` +
        `Try wrapping a bigger section into a separate block (e.g. {<div>...</div>}) or extracting a component ` +
        `to reduce per-block token variety.`
      );
    }

    return id;
  }

  function dig(siblings) {
    let elCount = siblings.length;

    for (let i = 0; i < elCount; i++) {
      totalElementCount++;

      let el = siblings[i];
      let tagNameId = getVariableId(el.type);

      // retroactively add children array if it doesn't exist -- compatibility with the old logic we ported from compile-time 
      if (!el.children) {
        el.children = [];
      }

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

      ensureCapacity(1);
      buf.writeUInt8(firstByte, offset);
      offset++;

      // if this is a text
      if (tagNameId == 0) {
        let textLength = Buffer.byteLength(el.text);

        checkStringLength(textLength, 'text');
        ensureCapacity(2 + textLength);
        buf.writeUInt16BE(textLength, offset);
        offset += 2;

        // write the string
        buf.write(el.text, offset, textLength);
        offset += textLength;

      } else {

        if (el.style) {
          let attrId = getVariableId('style');
          ensureCapacity(1);
          buf.writeUInt8(attrId, offset);
          offset++;

          Object.keys(el.style).forEach(propName => {
            let propValue = el.style[propName];
            let styleKeyId = getVariableId(propName);
            let styleValueId = getVariableId(propValue);

            ensureCapacity(2);
            buf.writeUInt8(styleKeyId, offset);
            buf.writeUInt8(styleValueId, offset + 1);

            offset += 2;
          });

          ensureCapacity(1);
          buf.writeUInt8(0, offset);

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

          let attrValue = el.attributes[attrName];
          // The client decodes this as UTF-8 bytes, so the prefix must be the byte length.
          let attrValueLength = Buffer.byteLength(attrValue);

          checkStringLength(attrValueLength, `"${attrName}" attribute value`);
          ensureCapacity(1 + 2 + attrValueLength);

          buf.writeUInt8(attrId, offset);
          offset++;

          buf.writeUInt16BE(attrValueLength, offset);

          offset += 2;
          buf.write(attrValue, offset, attrValueLength);
          offset += attrValueLength;

        }

        ensureCapacity(1);
        buf.writeUInt8(0, offset);
        offset++;
      }

      if (hasChildren) {
        dig(filteredChildren);
      }
    }
  }

  dig([rootElement]);

  if (totalElementCount > MAX_UINT16) {
    throw new Error(
      `Seniman template limit reached: this block has ${totalElementCount} static elements, exceeding ` +
      `the 16-bit element count limit of ${MAX_UINT16}. ` +
      `Try wrapping a bigger section into a separate block (e.g. {<div>...</div>}) or extracting a component.`
    );
  }

  let elementCountBuffer = Buffer.alloc(2);

  elementCountBuffer.writeUInt16BE(totalElementCount);

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

  // Internally the root is referenced by ROOT_EL_REF rather than 255, because 255 is
  // also a real element index once a block has 256+ walked elements -- prune() would
  // otherwise mistake the root reference for a dependency on element 255.
  _buildElScript(rootElement, ROOT_EL_REF);

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

        if (_el.relRefId > i) {
          _el.relRefId -= 1;
        }
      }

      for (let j = 0; j < _anchors.length; j++) {

        let _anchor = _anchors[j];

        if (_anchor.el > i) {
          _anchor.el -= 1;
        }

        if (_anchor.beforeEl != undefined && _anchor.beforeEl > i) {
          _anchor.beforeEl -= 1;
        }
      }

      for (let j = 0; j < _targets.length; j++) {

        if (_targets[j] == ROOT_EL_REF) {
          throw new Error('Invalid compiler implementation. Root element (id 255) need not be part of the targets array.');
        }

        if (_targets[j] > i) {
          _targets[j] -= 1;
        }
      }
    }
  }

  prune();

  // ELSCRIPT uses uint8 indices with 255 reserved as a sentinel.
  if (_els.length > 255) {
    throw new Error(
      `Seniman template limit reached: this block needs more than 255 referenceable elements. ` +
      `ELSCRIPT indices are 8-bit with 255 reserved, so indices above 254 will corrupt anchors/targets. ` +
      `Try wrapping a bigger section into a separate block (e.g. {<div>...</div>}) or extracting a component.`
    );
  }

  if (_anchors.length > 255 || _targets.length > 255) {
    throw new Error(
      `Seniman template limit reached: this block has too many anchors/targets for 8-bit ELSCRIPT encoding. ` +
      `Try wrapping a bigger section into a separate block (e.g. {<div>...</div>}) or extracting a component.`
    );
  }

  return _createElScriptBuffer(_els, _anchors, _targets);
}

function _createElScriptBuffer(els, anchors, targets) {

  let refElementsCount = els.length;
  let anchorCount = anchors.length;
  let targetElementCount = targets.length;

  let bufLen = (1 + 2 * refElementsCount) + (1 + 2 * anchorCount) + (1 + 1 * targetElementCount);
  let buf = Buffer.alloc(bufLen);

  buf.writeUInt8(refElementsCount, 0);

  let offset = 1;
  for (let i = 0; i < refElementsCount; i++) {
    let refEl = els[i];
    //let relCodeMap = {firstChild}
    buf.writeUInt8(refEl.rel, offset + i * 2);
    buf.writeUInt8(encodeElRef(refEl.relRefId), offset + i * 2 + 1);
  }

  offset += 2 * refElementsCount;
  buf.writeUInt8(anchorCount, offset);
  offset++;

  for (let i = 0; i < anchorCount; i++) {
    let anchor = anchors[i];

    buf.writeUInt8(encodeElRef(anchor.el), offset + i * 2);

    // in beforeEl context, 255 means undefined -- ie. no beforeEl applicable. 
    // 255 that is usually used to refer to rootElement can be reused here since 
    // there is no situation in which rootElement is an anchor's beforeElement.
    buf.writeUInt8(anchor.beforeEl == undefined ? 255 : anchor.beforeEl, offset + i * 2 + 1)
  }

  offset += 2 * anchorCount;
  buf.writeUInt8(targetElementCount, offset);
  offset++;

  for (let i = 0; i < targetElementCount; i++) {
    let target = targets[i];

    buf.writeUInt8(target, offset + i);
  }

  offset += targetElementCount;

  return buf;
}
