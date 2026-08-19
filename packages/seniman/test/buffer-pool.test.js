import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bufferPool,
  MAX_RETAINED_STANDARD_PAGE_COUNT,
  STANDARD_PAGE_SIZE
} from '../dist/buffer-pool.js';

test('standard output page retention is globally bounded', () => {
  let excessCount = 32;
  let buffers = Array.from(
    { length: MAX_RETAINED_STANDARD_PAGE_COUNT + excessCount },
    () => Buffer.allocUnsafe(STANDARD_PAGE_SIZE)
  );

  let retainedCount = 0;

  buffers.forEach(buffer => {
    if (bufferPool.returnBuffer(buffer)) {
      retainedCount++;
    }
  });

  assert.equal(retainedCount, MAX_RETAINED_STANDARD_PAGE_COUNT);
  assert.equal(bufferPool.retainedCount, MAX_RETAINED_STANDARD_PAGE_COUNT);

  let retainedBuffers = new Set(
    buffers.slice(0, MAX_RETAINED_STANDARD_PAGE_COUNT)
  );

  for (let i = 0; i < MAX_RETAINED_STANDARD_PAGE_COUNT; i++) {
    assert.ok(retainedBuffers.has(bufferPool.alloc()));
  }

  assert.equal(bufferPool.retainedCount, 0);
});

test('emergency output pages are never retained', () => {
  let emergencyBuffer = bufferPool.alloc(STANDARD_PAGE_SIZE + 1);

  assert.equal(emergencyBuffer.length, STANDARD_PAGE_SIZE + 1);
  assert.equal(bufferPool.returnBuffer(emergencyBuffer), false);
  assert.equal(bufferPool.retainedCount, 0);
});
