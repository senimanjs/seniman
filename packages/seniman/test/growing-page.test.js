import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot, _createBlock, _declareBlock } from '../dist/index.js';
import {
  MAX_PAGE_SIZE,
  STANDARD_PAGE_SIZE,
} from '../dist/buffer-pool.js';
import { Window } from '../dist/window.js';

function allocCommandBuffer(window, size, scheduleFlush = true) {
  let buffer = window._allocCommandPage(size, scheduleFlush);
  return buffer.subarray(
    window.commandBufferOffset,
    window.commandBufferOffset + size
  );
}

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
  let standardBuffer = allocCommandBuffer(window, 5000);
  standardBuffer.fill(1);
  window.flushCommandBuffer();
  assert.equal(output[0].length, 5000);
  assert.equal(window.pages[0].buffer.length, STANDARD_PAGE_SIZE);

  output = [];
  let buf = allocCommandBuffer(window, 1);
  buf.writeUInt8(0, 0);
  window.flushCommandBuffer();
  assert.deepEqual(output, [Buffer.from([0])]);
  assert.equal(window.pages.length, 1);
  assert.equal(window.pages[0].buffer.length, STANDARD_PAGE_SIZE);

  let writeOffset = window.global_writeOffset;
  assert.throws(
    () => allocCommandBuffer(window, MAX_PAGE_SIZE + 1),
    error => error.message.includes('SENIMAN_MAX_PAGE_SIZE')
      && error.message.includes('stagger large initial rendering')
  );
  assert.equal(window.global_writeOffset, writeOffset);
});

test('window publication commits rollover pages as one replayable packet', () => {
  let output = [];
  let window = new Window(
    { lowMemoryMode: false },
    { windowId: '123456789012345678901' },
    null,
    null,
    buffer => output.push(Buffer.from(buffer))
  );

  window.flushCommandBuffer();
  let initialOffset = window.global_publishOffset;
  window.registerReadOffset(initialOffset);
  output = [];

  window.beginPublication();
  allocCommandBuffer(window, STANDARD_PAGE_SIZE - initialOffset).fill(1);
  allocCommandBuffer(window, 1000).fill(2);
  window._handleBlockCleanup(11);
  window.flushCommandBuffer();

  assert.deepEqual(output, []);
  assert.equal(window.global_publishOffset, initialOffset);
  assert.throws(
    () => window.registerReadOffset(window.global_writeOffset),
    /beyond published output/
  );

  window._restreamUnreadPages();
  assert.deepEqual(output, []);

  window.commitPublication();

  assert.equal(output.length, 1);
  assert.equal(
    output[0].length,
    STANDARD_PAGE_SIZE - initialOffset + 1000 + 5
  );
  assert.deepEqual(
    output[0].subarray(-5),
    Buffer.from([9, 0, 11, 0, 0])
  );
  assert.equal(window.global_publishOffset, window.global_writeOffset);

  let committedPacket = output[0];
  output = [];
  window._restreamUnreadPages();
  assert.deepEqual(output, [committedPacket]);
});

test('deferred scheduler publications flush as one window message', () => {
  let output = [];
  let window = new Window(
    { lowMemoryMode: false },
    { windowId: '123456789012345678901' },
    null,
    null,
    buffer => output.push(Buffer.from(buffer))
  );

  window.flushCommandBuffer();
  output = [];

  window.beginPublication(1);
  allocCommandBuffer(window, 100).fill(1);
  window.commitPublication(1, false);
  window.beginPublication(2);
  allocCommandBuffer(window, 200).fill(2);
  window.commitPublication(2, false);

  assert.deepEqual(output, []);

  window.flushCommandBuffer();

  assert.equal(output.length, 1);
  assert.equal(output[0].length, 300);
});

test('publication tracking keeps one scalar end and replays overflow ends', () => {
  let output = [];
  let window = new Window(
    { lowMemoryMode: false },
    { windowId: '123456789012345678901' },
    null,
    null,
    buffer => output.push(Buffer.from(buffer))
  );

  window.flushCommandBuffer();
  let firstEnd = window.global_publishOffset;
  assert.equal(window.publicationEndOffset, firstEnd);
  assert.equal(window.publications, null);

  allocCommandBuffer(window, 3).fill(2);
  window.flushCommandBuffer();
  let secondEnd = window.global_publishOffset;
  allocCommandBuffer(window, 4).fill(3);
  window.flushCommandBuffer();
  let thirdEnd = window.global_publishOffset;

  assert.deepEqual(window.publications, [secondEnd, thirdEnd]);

  window.registerReadOffset(firstEnd);
  assert.equal(window.publicationEndOffset, secondEnd);
  output = [];
  window._restreamUnreadPages();
  assert.deepEqual(output, [Buffer.alloc(3, 2), Buffer.alloc(4, 3)]);

  window.registerReadOffset(secondEnd);
  assert.equal(window.publicationEndOffset, thirdEnd);
  assert.equal(window.publications, null);

  window.registerReadOffset(thirdEnd);
  assert.equal(window.publicationEndOffset, 0);
});

test('ping is shared transport control outside the acknowledged output stream', () => {
  let output = [];
  let window = new Window(
    { lowMemoryMode: false },
    { windowId: '123456789012345678901' },
    null,
    null,
    buffer => output.push(Buffer.from(buffer))
  );

  window.flushCommandBuffer();
  window.registerReadOffset(window.global_publishOffset);
  assert.equal(window.pages.length, 1);
  assert.equal(window.pages[0].buffer.length, STANDARD_PAGE_SIZE);
  let writablePage = window.pages[0];
  output = [];
  let offsetBeforePing = window.global_publishOffset;

  window.sendPing();

  assert.deepEqual(output, [Buffer.from([0])]);
  assert.equal(window.global_writeOffset, offsetBeforePing);
  assert.equal(window.global_publishOffset, offsetBeforePing);
  assert.equal(window.pages.length, 1);
  assert.equal(window.pages[0], writablePage);
});

test('finalizing a fully acknowledged writable page recycles it immediately', () => {
  let window = new Window(
    { lowMemoryMode: false },
    { windowId: '123456789012345678901' },
    null,
    null,
    () => {}
  );

  window.flushCommandBuffer();
  let initialSize = window.global_publishOffset;
  window.registerReadOffset(initialSize);

  allocCommandBuffer(window, STANDARD_PAGE_SIZE - initialSize).fill(1);
  window.flushCommandBuffer();
  window.registerReadOffset(window.global_publishOffset);

  let acknowledgedPage = window.pages[0];
  assert.equal(acknowledgedPage.finalSize, 0);

  allocCommandBuffer(window, 1).fill(2);

  assert.equal(window.pages.length, 1);
  assert.notEqual(window.pages[0], acknowledgedPage);
  assert.equal(window.pages[0].global_headOffset, STANDARD_PAGE_SIZE);
});

test('client acknowledgement directly advances the retained output offset', () => {
  let window = new Window(
    { lowMemoryMode: false },
    { windowId: '123456789012345678901' },
    null,
    null,
    () => {}
  );

  window.flushCommandBuffer();
  window.registerClientAcknowledgement(window.global_publishOffset);
  assert.equal(window.global_readOffset, window.global_publishOffset);

  allocCommandBuffer(window, 40000).fill(1);
  window.flushCommandBuffer();
  window.registerClientAcknowledgement(window.global_publishOffset);
  assert.equal(window.global_readOffset, window.global_publishOffset);
});

test('single-page publications bypass the general retained-page scan', () => {
  let output = [];
  let window = new Window(
    { lowMemoryMode: false },
    { windowId: '123456789012345678901' },
    null,
    null,
    buffer => output.push(Buffer.from(buffer))
  );

  window.flushCommandBuffer();
  window.registerReadOffset(window.global_publishOffset);
  output = [];
  window._readOutputRange = () => {
    throw new Error('single-page output used the general range path');
  };

  allocCommandBuffer(window, 10).fill(7);
  window.flushCommandBuffer();

  assert.deepEqual(output, [Buffer.alloc(10, 7)]);
  assert.equal(window.global_publishOffset, window.global_writeOffset);
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
  root.configure({
    SENIMAN_ENABLE_CRAWLER_RENDERER: '1',
    SENIMAN_MAX_UNACKNOWLEDGED_OUTPUT_BYTES: '1',
    SENIMAN_MAX_RETAINED_OUTPUT_BYTES: '1'
  });

  let response = await root.getHtmlResponse({
    url: '/',
    headers: new Headers({ 'user-agent': 'Googlebot' }),
    ipAddress: '127.0.0.1',
    isSecure: false,
  });

  assert.ok(response.body.includes(text));
});
