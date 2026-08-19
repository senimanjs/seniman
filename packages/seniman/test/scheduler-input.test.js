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
  onDispose,
  useState,
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
    lastReadableId: 1,
    lastEffectId: 2
  };
}

function drainSchedulerNodeIds() {
  let output = Buffer.alloc(SCHEDULER_OUTPUT_PAGE_SIZE);
  let nodeIds = [];

  while (true) {
    let length = scheduler_drainWork(output);

    if (length === 0) {
      return nodeIds;
    }

    let offset = 0;

    while (offset < length) {
      let type = output.readUInt8(offset);
      let count = output.readUInt32LE(offset + 12);
      offset += 16;

      for (let i = 0; i < count; i++) {
        let nodeId = output.readUInt32LE(offset);
        offset += 4;

        if (type === SCHEDULER_OUTPUT_RUN_NODES) {
          nodeIds.push(nodeId);
        }
      }
    }
  }
}

function ingestSchedulerCommands(handle, commands) {
  let commandByteLength = commands.reduce(
    (length, command) => length + (command[0] === 6 ? 5 : 9),
    0
  );
  let input = Buffer.alloc(12 + commandByteLength);
  let offset = 12;

  input.writeUInt32LE(handle.slot, 0);
  input.writeUInt32LE(handle.generation, 4);
  input.writeUInt32LE(commandByteLength, 8);

  for (let command of commands) {
    input.writeUInt8(command[0], offset);
    input.writeUInt32LE(command[1], offset + 1);
    offset += 5;

    if (command[0] !== 6) {
      input.writeUInt32LE(command[2], offset);
      offset += 4;
    }
  }

  scheduler_ingest(input, input.length);
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

test('scheduler preserves stable depth ordering', () => {
  let handle = scheduler_registerWindow(41000);

  ingestSchedulerCommands(handle, [
    [3, 0, 4],
    [3, 0, 12]
  ]);
  assert.deepEqual(drainSchedulerNodeIds(), [4, 12]);

  ingestSchedulerCommands(handle, [
    [3, 4, 6],
    [3, 4, 10],
    [3, 4, 16]
  ]);
  assert.deepEqual(drainSchedulerNodeIds(), [6, 10, 16]);

  ingestSchedulerCommands(handle, [[3, 6, 8]]);
  assert.deepEqual(drainSchedulerNodeIds(), [8]);

  let observedNodes = [8, 16, 12, 10];
  let commands = [];

  for (let i = 0; i < observedNodes.length; i++) {
    let nodeId = observedNodes[i];
    let stateId = 101 + i * 2;
    commands.push([2, nodeId, stateId], [1, nodeId, stateId]);
  }

  for (let i = 0; i < observedNodes.length; i++) {
    commands.push([6, 101 + i * 2]);
  }

  ingestSchedulerCommands(handle, commands);
  assert.deepEqual(drainSchedulerNodeIds(), [12, 16, 10, 8]);

  scheduler_deregisterWindow(handle.slot, handle.generation);
});

test('dirty ancestor expires its queued old child before replacement', async () => {
  let window = createWindow(42000);
  let setParentState;
  let setOldChildState;
  let parentRunCount = 0;
  let childRunsByParent = new Map();
  let oldChildDisposeCount = 0;

  registerWindow(window);
  runInWindow(window.id, () => {
    useEffect(() => {
      let parentRun = ++parentRunCount;
      let [parentState, setParent] = useState(0);
      parentState();
      setParentState = setParent;

      useEffect(() => {
        let [childState, setChild] = useState(0);
        childState();
        childRunsByParent.set(
          parentRun,
          (childRunsByParent.get(parentRun) || 0) + 1
        );

        if (parentRun === 1) {
          setOldChildState = setChild;
          onDispose(() => oldChildDisposeCount++);
        }
      });
    });
  });

  await waitForScheduler();
  setParentState(1);
  setOldChildState(1);
  await waitForScheduler();

  assert.equal(parentRunCount, 2);
  assert.equal(childRunsByParent.get(1), 1);
  assert.equal(childRunsByParent.get(2), 1);
  assert.equal(oldChildDisposeCount, 1);

  deregisterWindow(window);
});
