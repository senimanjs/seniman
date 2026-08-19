import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot, _createBlock, _declareBlock } from '../dist/index.js';
import { MAX_PAGE_SIZE, STANDARD_PAGE_SIZE } from '../dist/buffer-pool.js';
import { Window } from '../dist/window.js';

test('commands use standard and exact-sized emergency pages', () => {
  let output = [];
  let window = new Window(
    { lowMemoryMode: false },
    { windowId: '123456789012345678901' },
    null,
    null,
    buffer => output.push(Buffer.from(buffer))
  );

  let value = 'x'.repeat(40000);
  window._streamChannelSendMessageCommand(7, value);
  window.flushCommandBuffer();

  assert.equal(output.length, 2);
  assert.equal(output[0].length, 22);
  assert.equal(output[1].length, 40007);
  assert.equal(output[1].readUInt8(0), 15);
  assert.equal(output[1].readUInt16BE(1), 7);
  assert.equal(output[1].readUInt8(3), 1);
  assert.equal(output[1].readUInt8(4), 1);
  assert.equal(output[1].readUInt16BE(5), value.length);
  assert.equal(output[1].subarray(7).toString(), value);
  assert.equal(window.pages[0].buffer.length, STANDARD_PAGE_SIZE);
  assert.equal(window.pages[1].buffer.length, output[1].length);

  let commandOffset = output[0].length;
  let finalOffset = commandOffset + output[1].length;
  let expectedReplay = output[1];

  window.registerReadOffset(commandOffset);
  output = [];
  window._restreamUnreadPages();
  assert.deepEqual(output, [expectedReplay]);

  window.registerReadOffset(finalOffset);
  assert.equal(window.pages.length, 0);

  output = [];
  let standardBuffer = window._allocCommandBuffer(5000);
  standardBuffer.fill(1);
  window.flushCommandBuffer();
  assert.equal(output[0].length, 5000);
  assert.equal(window.pages[0].buffer.length, STANDARD_PAGE_SIZE);

  output = [];
  let buf = window._allocCommandBuffer(1);
  buf.writeUInt8(0, 0);
  window.flushCommandBuffer();
  assert.deepEqual(output, [Buffer.from([0])]);
  assert.equal(window.pages.length, 1);
  assert.equal(window.pages[0].buffer.length, STANDARD_PAGE_SIZE);

  let writeOffset = window.global_writeOffset;
  assert.throws(
    () => window._allocCommandBuffer(MAX_PAGE_SIZE + 1),
    error => error.message.includes('SENIMAN_MAX_PAGE_SIZE')
      && error.message.includes('stagger large initial rendering')
  );
  assert.equal(window.global_writeOffset, writeOffset);
});

test('large initial templates are not limited by page size', async () => {
  let text = 'large-template-content-'.repeat(1000);
  let textBuffer = Buffer.from(text);
  let templateBuffer = Buffer.alloc(7 + textBuffer.length);
  templateBuffer.writeUInt16BE(2, 0);
  templateBuffer.writeUInt8(1 | (1 << 6), 2);
  templateBuffer.writeUInt8(0, 3);
  templateBuffer.writeUInt8(0, 4);
  templateBuffer.writeUInt16BE(textBuffer.length, 5);
  textBuffer.copy(templateBuffer, 7);

  let templateId = _declareBlock({
    tokens: ['main'],
    templateBuffer: templateBuffer.toString('base64'),
    elScriptBuffer: Buffer.from([0, 0, 0]).toString('base64')
  });
  let root = createRoot(() =>
    _createBlock(templateId, null, null, null, null, null)
  );
  root.configure({ SENIMAN_ENABLE_CRAWLER_RENDERER: '1' });

  let response = await root.getHtmlResponse({
    url: '/',
    headers: new Headers({ 'user-agent': 'Googlebot' }),
    ipAddress: '127.0.0.1',
    isSecure: false,
  });

  assert.ok(response.body.includes(text));
});
