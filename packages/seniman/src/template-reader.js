// The one reader of the CMD_INSTALL_TEMPLATE(_VARINT) byte format, shared by both decoders:
// imported by the crawler (src/crawler/html.js) and inlined into the client script
// (frontend/browser.js) at build time -- see scripts/client-source.js. The encoder is
// getTemplateBuffer / encodeElscript in src/declare.js.
//
// Written for the client's minified size: no comments survive, but keep the code terse.
//
// Layout after the opcode:
//   templateId:u16, global token IDs:u16... 0, template, ELSCRIPT
// Template: element count, then per element (depth first) a first byte -- low 6 bits tag ID
// (0 = text), bit 6 hasChildren, bit 7 nextSibling -- followed by either the text, or
// attributes [nameId, value] terminated by 0, where a "style" attribute holds [keyId, valueId]
// pairs terminated by 0 instead of a string.
// ELSCRIPT: refs [rel:u8 (1 firstChild, 2 nextSibling), ref], anchors [el, marker], targets [index].
//
// Compact form: IDs and ELSCRIPT counts/refs are uint8, lengths and the element count uint16;
// an ELSCRIPT ref of 255 means root / "no marker".
// Varint form: all of those are varints; a tag field of 63 means a varint tag ID follows, and
// ELSCRIPT refs are stored as index + 1, with 0 meaning root / "no marker".
//
// Returns [templateId, refs, anchors, targets], with ELSCRIPT refs decoded to an element
// index or -1 for root / "no marker". The tree is reported through the callbacks:
//   onElement(parent, tagName, [[name, value]]) -> handle passed as `parent` to its children
//   onText(parent, text)
//   onClose(handle)
export let createTemplateReader = (getUint8, getUint16, getUvarint, getString) => (varint, globalTokenList, onElement, onText, onClose) => {
  let readId = varint ? getUvarint : getUint8;
  let readLength = varint ? getUvarint : getUint16;
  let readRef = () => (varint ? getUvarint() : getUint8() + 1 & 255) - 1;
  let readList = (readItem) => {
    let items = [];

    for (let count = readId(); count--;) {
      items.push(readItem());
    }

    return items;
  };

  let templateId = getUint16();
  let tokens = [];
  let id;

  while (id = getUint16()) {
    tokens.push(globalTokenList[id]);
  }

  let remaining = readLength();

  let dig = (parent) => {
    for (let firstByte = 128; firstByte & 128 && remaining--;) {
      firstByte = getUint8();

      let tagId = firstByte & 63;

      if (varint && tagId == 63) {
        tagId = getUvarint();
      }

      if (tagId) {
        let attrs = [];

        while (id = readId()) {
          let name = tokens[id - 1];
          let value = '';

          if (name == 'style') {
            while (id = readId()) {
              value += tokens[id - 1] + ':' + tokens[readId() - 1] + ';';
            }
          } else {
            value = getString(readLength());
          }

          attrs.push([name, value]);
        }

        let handle = onElement(parent, tokens[tagId - 1], attrs);

        if (firstByte & 64) {
          dig(handle);
        }

        onClose(handle);
      } else {
        onText(parent, getString(readLength()));
      }
    }
  };

  dig();

  return [
    templateId,
    readList(() => [getUint8(), readRef()]),
    readList(() => [readRef(), readRef()]),
    readList(readId)
  ];
};
