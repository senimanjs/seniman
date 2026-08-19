import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deregisterWindow,
  registerWindow,
  runInWindow,
  schedulerInputWriter,
  schedulerOutputBuffer,
  SCHEDULER_INPUT_PAGE_SIZE,
  SCHEDULER_OUTPUT_PAGE_SIZE,
  useEffect
} from '../dist/state.js';
import {
  scheduler_deregisterWindow,
  scheduler_drainWork,
  scheduler_hasWork,
  scheduler_ingest,
  scheduler_registerWindow,
  SCHEDULER_OUTPUT_RUN_NODES
} from '../dist/scheduler.js';

const waitForScheduler = () => new Promise(resolve => setTimeout(resolve, 0));

function createWindow(id) {
  return {
    id,
    destroyed: false,
    lastEffectId: 2
  };
}

test('scheduler input supports more than 128 simultaneously dirty windows', async () => {
  let windows = [];
  let effectRunCount = 0;

  for (let i = 0; i < 300; i++) {
    let window = createWindow(10000 + i);
    windows.push(window);
    registerWindow(window);
    runInWindow(window.id, () => {
      useEffect(() => effectRunCount++);
    });
  }

  await waitForScheduler();

  assert.equal(effectRunCount, windows.length);
  assert.equal(schedulerInputWriter.offset, 0);
  assert.equal(schedulerInputWriter.frameStart, -1);
  assert.equal(schedulerOutputBuffer.length, SCHEDULER_OUTPUT_PAGE_SIZE);
  assert.equal(scheduler_hasWork(), false);

  windows.forEach(deregisterWindow);
});

test('scheduler input rolls over without growing its shared page', async () => {
  let window = createWindow(20000);
  let effectRunCount = 0;
  let effectCount = 7300;

  registerWindow(window);
  runInWindow(window.id, () => {
    for (let i = 0; i < effectCount; i++) {
      useEffect(() => effectRunCount++);
    }
  });

  assert.equal(schedulerInputWriter.buffer.length, SCHEDULER_INPUT_PAGE_SIZE);
  await waitForScheduler();
  assert.equal(effectRunCount, effectCount);
  assert.equal(schedulerInputWriter.buffer.length, SCHEDULER_INPUT_PAGE_SIZE);

  deregisterWindow(window);
});

test('stale buffered input cannot target a recycled scheduler slot', async () => {
  let oldWindow = createWindow(30000);
  let newWindow = createWindow(30001);
  let oldEffectRunCount = 0;
  let newEffectRunCount = 0;

  registerWindow(oldWindow);
  runInWindow(oldWindow.id, () => {
    useEffect(() => oldEffectRunCount++);
  });
  deregisterWindow(oldWindow);

  registerWindow(newWindow);
  assert.equal(newWindow.schedulerSlot, oldWindow.schedulerSlot);
  assert.notEqual(
    newWindow.schedulerGeneration,
    oldWindow.schedulerGeneration
  );

  runInWindow(newWindow.id, () => {
    useEffect(() => newEffectRunCount++);
  });

  await waitForScheduler();

  assert.equal(oldEffectRunCount, 0);
  assert.equal(newEffectRunCount, 1);

  deregisterWindow(newWindow);
});

test('scheduler output drains through fixed-size continuation pages', () => {
  let effectCount = 10;
  let handle = scheduler_registerWindow(40000);
  let input = Buffer.alloc(12 + effectCount * 9);

  input.writeUInt32LE(handle.slot, 0);
  input.writeUInt32LE(handle.generation, 4);
  input.writeUInt32LE(effectCount * 9, 8);

  for (let i = 0; i < effectCount; i++) {
    let offset = 12 + i * 9;
    input.writeUInt8(3, offset);
    input.writeUInt32LE(0, offset + 1);
    input.writeUInt32LE(4 + i * 2, offset + 5);
  }

  scheduler_ingest(input, input.length);

  let output = Buffer.alloc(28);
  let nodeIds = [];
  let drainCount = 0;

  while (true) {
    let length = scheduler_drainWork(output);

    if (length === 0) {
      break;
    }

    drainCount++;
    let offset = 0;

    while (offset < length) {
      assert.equal(output.readUInt8(offset), SCHEDULER_OUTPUT_RUN_NODES);
      assert.equal(output.readUInt32LE(offset + 4), handle.slot);
      assert.equal(output.readUInt32LE(offset + 8), handle.generation);

      let count = output.readUInt32LE(offset + 12);
      offset += 16;

      for (let i = 0; i < count; i++) {
        nodeIds.push(output.readUInt32LE(offset));
        offset += 4;
      }
    }
  }

  assert.ok(drainCount > 1);
  assert.deepEqual(
    nodeIds,
    Array.from({ length: effectCount }, (_, i) => 4 + i * 2)
  );
  assert.equal(scheduler_hasWork(), false);

  scheduler_deregisterWindow(handle.slot, handle.generation);
});
