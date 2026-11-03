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
// Same layout as CMD_INSTALL_TEMPLATE with varint fields; only for blocks that outgrow the
// compact form. See the format notes above getTemplateBuffer.
let CMD_INSTALL_TEMPLATE_VARINT = 20;

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
  installBuffer.writeUInt8(blockDef.varint ? CMD_INSTALL_TEMPLATE_VARINT : CMD_INSTALL_TEMPLATE, offset);
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

  // Every block is first encoded in the compact form. Only a block that exceeds one of its
  // fixed-width limits is re-encoded in the varint form (CMD_INSTALL_TEMPLATE_VARINT).
  let tokens = [];
  let templateBuffer = getTemplateBuffer(def.root, tokens, false);
  let varint = !templateBuffer;

  if (varint) {
    tokens = [];
    templateBuffer = getTemplateBuffer(def.root, tokens, true);
  }

  // Built after a complete template pass: getTemplateBuffer normalizes element.children,
  // which the ELSCRIPT walk relies on (an aborted compact pass leaves it incomplete).
  let elScript = getElscript(def.root);
  let elScriptBuffer = varint ? null : encodeElscript(elScript, false);

  if (!elScriptBuffer) {
    if (!varint) {
      varint = true;
      tokens = [];
      templateBuffer = getTemplateBuffer(def.root, tokens, true);
    }

    elScriptBuffer = encodeElscript(elScript, true);
  }

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
    varint,
    tokens
  });

  return blockId;
}

// In-memory reference to a block's root element while building ELSCRIPT.
const ROOT_EL_REF = -1;

// Compact form limits (CMD_INSTALL_TEMPLATE):
//   - tag IDs share the element's first byte with two flag bits: 6 bits, 1..63
//   - attribute / style token IDs: uint8, 1..255 (0 terminates the list)
//   - element count, text and attribute value lengths: uint16
//   - ELSCRIPT counts and element indices: uint8, with 255 = root / "no marker"
const COMPACT_MAX_TAG_ID = 63;
const COMPACT_MAX_TOKEN_ID = 255;
const COMPACT_MAX_UINT16 = 65535;
const COMPACT_MAX_ELSCRIPT_ENTRIES = 255;

// Varint form (CMD_INSTALL_TEMPLATE_VARINT): the same layout, but every count, length, token ID
// and ELSCRIPT index is an unsigned LEB128 varint. The tag stays in the first byte's low 6 bits,
// where 63 means "the tag ID follows as a varint". ELSCRIPT element refs are written as
// index + 1, with 0 meaning root / "no marker".
const VARINT_TAG_ESCAPE = 63;

function varintLength(value) {
  let length = 1;

  while (value >= 0x80) {
    value = Math.floor(value / 0x80);
    length++;
  }

  return length;
}

function writeVarint(buf, value, offset) {
  while (value >= 0x80) {
    buf[offset++] = (value & 0x7f) | 0x80;
    value = Math.floor(value / 0x80);
  }

  buf[offset++] = value;
  return offset;
}

// Returns null in compact mode when the block doesn't fit the compact form.
function getTemplateBuffer(rootElement, tokens, varint) {
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

  class DoesNotFitCompact extends Error { }

  // Token IDs are 1-based (0 terminates attribute/style lists). Tags are registered first so
  // that attribute and style variety doesn't push them out of the 6-bit tag field.
  let tokenIds = new Map();

  function getTokenId(token) {
    let id = tokenIds.get(token);

    if (id === undefined) {
      tokens.push(token);
      id = tokens.length;
      tokenIds.set(token, id);
    }

    return id;
  }

  function registerTags(el) {
    if (el.type[0] == '$') {
      return;
    }

    getTokenId(el.type);

    for (let child of el.children || []) {
      registerTags(child);
    }
  }

  // uint8 in compact form, varint otherwise
  function writeTokenId(id) {
    if (varint) {
      ensureCapacity(varintLength(id));
      offset = writeVarint(buf, id, offset);
    } else {
      if (id > COMPACT_MAX_TOKEN_ID) {
        throw new DoesNotFitCompact();
      }

      ensureCapacity(1);
      buf.writeUInt8(id, offset);
      offset++;
    }
  }

  // uint16 in compact form, varint otherwise
  function writeLength(length) {
    if (varint) {
      ensureCapacity(varintLength(length));
      offset = writeVarint(buf, length, offset);
    } else {
      if (length > COMPACT_MAX_UINT16) {
        throw new DoesNotFitCompact();
      }

      ensureCapacity(2);
      buf.writeUInt16BE(length, offset);
      offset += 2;
    }
  }

  function writeString(value) {
    let length = Buffer.byteLength(value);

    writeLength(length);
    ensureCapacity(length);
    buf.write(value, offset, length);
    offset += length;
  }

  function dig(siblings) {
    let elCount = siblings.length;

    for (let i = 0; i < elCount; i++) {
      totalElementCount++;

      let el = siblings[i];
      let isText = el.type == '$text';
      let tagId = isText ? 0 : getTokenId(el.type);

      // retroactively add children array if it doesn't exist -- compatibility with the old logic we ported from compile-time
      if (!el.children) {
        el.children = [];
      }

      let filteredChildren = el.children.filter(childEl => childEl.type != '$anchor');
      let hasChildren = filteredChildren.length > 0;
      let nextSibling = i < (elCount - 1);
      let escapeTag = varint && tagId >= VARINT_TAG_ESCAPE;

      if (!varint && tagId > COMPACT_MAX_TAG_ID) {
        throw new DoesNotFitCompact();
      }

      let firstByte = escapeTag ? VARINT_TAG_ESCAPE : tagId; // low 6 bits

      if (hasChildren) {
        firstByte |= 1 << 6;
      }

      if (nextSibling) {
        firstByte |= 1 << 7;
      }

      ensureCapacity(1);
      buf.writeUInt8(firstByte, offset);
      offset++;

      if (escapeTag) {
        ensureCapacity(varintLength(tagId));
        offset = writeVarint(buf, tagId, offset);
      }

      if (isText) {
        writeString(el.text);
      } else {
        if (el.style) {
          writeTokenId(getTokenId('style'));

          for (let propName of Object.keys(el.style)) {
            writeTokenId(getTokenId(propName));
            writeTokenId(getTokenId(el.style[propName]));
          }

          writeTokenId(0);
        }

        for (let attrName in el.attributes) {
          if (attrName == 'style') {
            continue;
          }

          writeTokenId(getTokenId(attrName));
          // The client decodes this as UTF-8 bytes, so the prefix must be the byte length.
          writeString(el.attributes[attrName]);
        }

        writeTokenId(0);
      }

      if (hasChildren) {
        dig(filteredChildren);
      }
    }
  }

  registerTags(rootElement);

  try {
    dig([rootElement]);
  } catch (error) {
    if (error instanceof DoesNotFitCompact) {
      return null;
    }
    throw error;
  }

  let countLength;

  if (varint) {
    countLength = varintLength(totalElementCount);
  } else {
    if (totalElementCount > COMPACT_MAX_UINT16) {
      return null;
    }
    countLength = 2;
  }

  let result = Buffer.alloc(countLength + offset);

  if (varint) {
    writeVarint(result, totalElementCount, 0);
  } else {
    result.writeUInt16BE(totalElementCount, 0);
  }

  buf.copy(result, countLength, 0, offset);
  return result;
}

function getElscript(rootElement) {

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

  // Targets are addressed by uint8 IDs in event/update commands (255 is the block root),
  // in both template forms.
  if (_targets.length > 255) {
    throw new Error(
      `Seniman template limit reached: this block has more than 255 elements with dynamic attributes, ` +
      `events or refs. Target IDs are 8-bit in update commands. ` +
      `Try wrapping a bigger section into a separate block (e.g. {<div>...</div>}) or extracting a component.`
    );
  }

  return { els: _els, anchors: _anchors, targets: _targets };
}

// Returns null in compact mode when the ELSCRIPT doesn't fit 8-bit counts and indices.
function encodeElscript({ els, anchors, targets }, varint) {
  if (!varint) {
    // 255 is reserved for root / "no marker", so up to 255 entries (indices <= 254).
    if (els.length > COMPACT_MAX_ELSCRIPT_ENTRIES || anchors.length > COMPACT_MAX_ELSCRIPT_ENTRIES) {
      return null;
    }

    return _createCompactElScriptBuffer(els, anchors, targets);
  }

  // Varint refs are index + 1, with 0 = root / "no marker".
  let encodeRef = (ref) => ref == ROOT_EL_REF || ref == undefined ? 0 : ref + 1;
  let values = [];

  values.push(els.length);
  for (let refEl of els) {
    values.push({ rel: refEl.rel }, encodeRef(refEl.relRefId));
  }

  values.push(anchors.length);
  for (let anchor of anchors) {
    values.push(encodeRef(anchor.el), encodeRef(anchor.beforeEl));
  }

  values.push(targets.length);
  for (let target of targets) {
    values.push(target);
  }

  let size = values.reduce((sum, value) => sum + (typeof value == 'object' ? 1 : varintLength(value)), 0);
  let buf = Buffer.alloc(size);
  let offset = 0;

  for (let value of values) {
    if (typeof value == 'object') {
      buf.writeUInt8(value.rel, offset++); // rel stays a single byte
    } else {
      offset = writeVarint(buf, value, offset);
    }
  }

  return buf;
}

function _createCompactElScriptBuffer(els, anchors, targets) {
  let encodeElRef = (ref) => ref == ROOT_EL_REF ? 255 : ref;
  let buf = Buffer.alloc((1 + 2 * els.length) + (1 + 2 * anchors.length) + (1 + targets.length));
  let offset = 0;

  buf.writeUInt8(els.length, offset++);

  for (let refEl of els) {
    buf.writeUInt8(refEl.rel, offset++);
    buf.writeUInt8(encodeElRef(refEl.relRefId), offset++);
  }

  buf.writeUInt8(anchors.length, offset++);

  for (let anchor of anchors) {
    buf.writeUInt8(encodeElRef(anchor.el), offset++);

    // In beforeEl context, 255 means "no marker" (append). It can't be confused with the
    // root, since the root is never an anchor's next sibling.
    buf.writeUInt8(anchor.beforeEl == undefined ? 255 : anchor.beforeEl, offset++);
  }

  buf.writeUInt8(targets.length, offset++);

  for (let target of targets) {
    buf.writeUInt8(target, offset++);
  }

  return buf;
}
