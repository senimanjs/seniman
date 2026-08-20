import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from '../dist/window.js';

function createWindow() {
  return new Window(
    { lowMemoryMode: false },
    { windowId: '123456789012345678901' },
    null,
    null,
    () => {}
  );
}

function encodeBlockIds(blockIds) {
  let buffer = Buffer.alloc(blockIds.length * 2);

  blockIds.forEach((blockId, index) => {
    buffer.writeUInt16BE(blockId, index * 2);
  });

  return buffer;
}

test('free block ID storage grows and shrinks with returned IDs', () => {
  let window = createWindow();
  let blockIds = Array.from({ length: 100 }, () => window._createBlockId());

  assert.equal(window.freeBlockIds, null);

  window._recycleBlockIds(encodeBlockIds(blockIds), blockIds.length);

  assert.equal(window.freeBlockIdCount, 100);
  assert.equal(window.freeBlockIds.length, 128);

  let reusedBlockIds = Array.from(
    { length: blockIds.length },
    () => window._createBlockId()
  );

  assert.deepEqual(reusedBlockIds, [...blockIds].reverse());
  assert.equal(window.freeBlockIdCount, 0);
  assert.equal(window.freeBlockIds.length, 16);
  assert.equal(window._createBlockId(), 111);
});

test('sequential block churn keeps the free ID pool small', () => {
  let window = createWindow();
  let blockId = window._createBlockId();
  let buffer = encodeBlockIds([blockId]);

  for (let i = 0; i < 1000; i++) {
    window._recycleBlockIds(buffer, 1);
    assert.equal(window._createBlockId(), blockId);
  }

  assert.equal(window.freeBlockIds.length, 16);
  assert.equal(window.latestBlockId, blockId);
});

test('block IDs return after their client deletion is queued', async () => {
  let window = createWindow();
  let blockId = window._createBlockId();

  window._handleBlockCleanup(blockId);
  assert.equal(window.freeBlockIdCount, 0);

  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(window.freeBlockIdCount, 1);
  assert.equal(window._createBlockId(), blockId);
});
