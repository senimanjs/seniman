import assert from 'node:assert/strict';
import test from 'node:test';
import { _declareBlock, blockDefinitions } from '../src/declare.js';

function declare(root) {
  return blockDefinitions.get(_declareBlock({ v: '2.0', root }));
}

function rows(count) {
  return Array.from({ length: count }, (_, i) => ({
    type: 'div',
    attributes: { class: 'row' },
    children: [{ type: '$text', text: 'Hello row number ' + i }]
  }));
}

test('static templates larger than the initial 2KB scratch buffer encode fully', () => {
  let def = declare({ type: 'div', children: rows(1000) });

  // element count prefix: root + 1000 rows + 1000 texts
  assert.equal(def.templateBuffer.readUInt16BE(0), 2001);
  assert.ok(def.templateBuffer.length > 2048);
});

test('256+ static siblings do not collide with the 255 root sentinel in ELSCRIPT', () => {
  for (let count of [255, 256, 300]) {
    let def = declare({ type: 'div', children: Array.from({ length: count }, () => ({ type: 'span' })) });

    // fully static: no referenced elements, anchors or targets
    assert.deepEqual([...def.elScriptBuffer], [0, 0, 0]);
  }
});

test('static attribute length prefix is the UTF-8 byte length', () => {
  let value = 'héllo✓';
  let def = declare({ type: 'div', attributes: { title: value } });
  let buf = def.templateBuffer;

  // [elementCount:2][firstByte:1][attrId:1][length:2][value]
  let length = buf.readUInt16BE(4);
  assert.equal(length, Buffer.byteLength(value));
  assert.equal(buf.subarray(6, 6 + length).toString(), value);
});

test('blocks past a compact-form limit switch to the varint form', () => {
  // over the compact form's uint16 lengths and element count, uint8 tokens and 6-bit tags
  let cases = {
    'long text': { type: 'div', children: [{ type: '$text', text: 'a'.repeat(70000) }] },
    'long attribute': { type: 'div', attributes: { title: 'a'.repeat(70000) } },
    'many tokens': { type: 'div', children: Array.from({ length: 300 }, (_, i) => ({ type: 'span', attributes: { [`data-${i}`]: '' } })) },
    'many tags': { type: 'div', children: Array.from({ length: 100 }, (_, i) => ({ type: `t${i}` })) },
  };

  for (let [name, root] of Object.entries(cases)) {
    assert.equal(declare(root).varint, true, name);
  }

  assert.equal(declare({ type: 'div', children: [{ type: '$text', text: 'small' }] }).varint, false);
});

test('blocks over the page size fail with a template limit error', () => {
  assert.throws(
    () => declare({ type: 'div', children: [{ type: '$text', text: 'a'.repeat(200000) }] }),
    /exceeding SENIMAN_MAX_PAGE_SIZE/
  );

  assert.throws(
    () => declare({ type: 'div', children: Array.from({ length: 70000 }, () => ({ type: 'span' })) }),
    /exceeding SENIMAN_MAX_PAGE_SIZE/
  );

  assert.throws(
    () => declare({ type: 'div', children: rows(5000) }),
    /exceeding SENIMAN_MAX_PAGE_SIZE/
  );
});
