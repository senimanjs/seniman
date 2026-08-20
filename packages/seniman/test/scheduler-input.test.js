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
  SCHEDULER_TURN_WORK_BUDGET,
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
  scheduler_setWindowPaused,
  SCHEDULER_PACKET_END,
  SCHEDULER_PACKET_START,
  SCHEDULER_WINDOW_WORK_QUANTUM
} from '../dist/scheduler.js';

test('paused scheduler windows retain work until resumed', () => {
  let handle = scheduler_registerWindow(9001);

  ingestSchedulerCommands(handle, [[3, 0, 4]]);
  scheduler_setWindowPaused(handle.slot, handle.generation, true);

  assert.equal(scheduler_hasWork(), false);
  assert.deepEqual(drainSchedulerNodeIds(), []);

  scheduler_setWindowPaused(handle.slot, handle.generation, false);

  assert.equal(scheduler_hasWork(), true);
  assert.deepEqual(drainSchedulerNodeIds(), [4]);
  scheduler_deregisterWindow(handle.slot, handle.generation);
});

async function waitForScheduler() {
  do {
    await new Promise(resolve => setTimeout(resolve, 0));
  } while (scheduler_hasWork() || schedulerInputWriter.offset > 0);
}

function createWindow(id) {
  return {
    id,
    destroyed: false,
    publicationOpen: false,
    publicationPacketId: 0,
    lastReadableId: 1,
    lastEffectId: 2,
    beginPublication(packetId) {
      this.publicationOpen = true;
      this.publicationPacketId = packetId;
    },
    commitPublication() {
      this.publicationOpen = false;
      this.publicationPacketId = 0;
    }
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
      let deletedNodeCount = output.readUInt32LE(offset + 16);
      let nodeCount = output.readUInt32LE(offset + 20);
      offset += 28 + deletedNodeCount * 4;

      for (let i = 0; i < nodeCount; i++) {
        nodeIds.push(output.readUInt32LE(offset));
        offset += 4;
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

function drainSchedulerRecords() {
  let output = Buffer.alloc(SCHEDULER_OUTPUT_PAGE_SIZE);
  let length = scheduler_drainWork(output);
  let records = [];
  let offset = 0;

  while (offset < length) {
    let flags = output.readUInt8(offset);
    let slot = output.readUInt32LE(offset + 4);
    let packetId = output.readUInt32LE(offset + 12);
    let deletedNodeCount = output.readUInt32LE(offset + 16);
    let nodeCount = output.readUInt32LE(offset + 20);
    let workCost = output.readUInt32LE(offset + 24);
    let deletedNodeIds = [];
    let nodeIds = [];
    offset += 28;

    for (let i = 0; i < deletedNodeCount; i++) {
      deletedNodeIds.push(output.readUInt32LE(offset));
      offset += 4;
    }

    for (let i = 0; i < nodeCount; i++) {
      nodeIds.push(output.readUInt32LE(offset));
      offset += 4;
    }

    records.push({
      flags,
      slot,
      packetId,
      workCost,
      deletedNodeIds,
      nodeIds
    });
  }

  return records;
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

test('scheduler yields after the per-turn work budget', async () => {
  let window = createWindow(25000);
  let effectRunCount = 0;
  let effectCount = SCHEDULER_TURN_WORK_BUDGET + 10;

  registerWindow(window);
  runInWindow(window.id, () => {
    for (let i = 0; i < effectCount; i++) {
      useEffect(() => effectRunCount++);
    }
  });

  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(effectRunCount, SCHEDULER_TURN_WORK_BUDGET);
  assert.equal(scheduler_hasWork(), true);

  await waitForScheduler();
  assert.equal(effectRunCount, effectCount);

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

  let output = Buffer.alloc(32);
  let nodeIds = [];
  let drainCount = 0;
  let packetId;

  while (true) {
    let length = scheduler_drainWork(output);

    if (length === 0) {
      break;
    }

    drainCount++;
    let offset = 0;

    while (offset < length) {
      let flags = output.readUInt8(offset);
      assert.equal(output.readUInt32LE(offset + 4), handle.slot);
      assert.equal(output.readUInt32LE(offset + 8), handle.generation);
      packetId ??= output.readUInt32LE(offset + 12);
      assert.equal(output.readUInt32LE(offset + 12), packetId);
      assert.equal(output.readUInt32LE(offset + 16), 0);

      let count = output.readUInt32LE(offset + 20);
      offset += 28;

      if (drainCount === 1) {
        assert.ok(flags & SCHEDULER_PACKET_START);
      }

      for (let i = 0; i < count; i++) {
        nodeIds.push(output.readUInt32LE(offset));
        offset += 4;
      }

      if (nodeIds.length === effectCount) {
        assert.ok(flags & SCHEDULER_PACKET_END);
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

test('replacement deletions stream before forward work across pages', () => {
  let handle = scheduler_registerWindow(40500);
  let childCount = 20;
  let registerCommands = [];

  ingestSchedulerCommands(handle, [[3, 0, 4]]);
  drainSchedulerNodeIds();

  for (let i = 0; i < childCount; i++) {
    registerCommands.push([3, 4, 6 + i * 2]);
  }

  ingestSchedulerCommands(handle, registerCommands);
  drainSchedulerNodeIds();
  ingestSchedulerCommands(handle, [
    [2, 4, 101],
    [1, 4, 101],
    [6, 101]
  ]);

  let output = Buffer.alloc(32);
  let deletedNodeIds = [];
  let nodeIds = [];
  let flags = [];
  let packetId;
  let sawForwardNode = false;

  while (true) {
    let length = scheduler_drainWork(output);

    if (length === 0) {
      break;
    }

    let recordFlags = output.readUInt8(0);
    let recordPacketId = output.readUInt32LE(12);
    let deletedNodeCount = output.readUInt32LE(16);
    let nodeCount = output.readUInt32LE(20);
    let offset = 28;

    packetId ??= recordPacketId;
    assert.equal(recordPacketId, packetId);
    flags.push(recordFlags);

    for (let i = 0; i < deletedNodeCount; i++) {
      assert.equal(sawForwardNode, false);
      deletedNodeIds.push(output.readUInt32LE(offset));
      offset += 4;
    }

    for (let i = 0; i < nodeCount; i++) {
      sawForwardNode = true;
      nodeIds.push(output.readUInt32LE(offset));
      offset += 4;
    }
  }

  assert.ok(flags[0] & SCHEDULER_PACKET_START);
  assert.ok(flags.at(-1) & SCHEDULER_PACKET_END);
  assert.ok(flags.length > 1);
  assert.deepEqual(
    deletedNodeIds,
    Array.from({ length: childCount }, (_, i) => 6 + (childCount - i - 1) * 2)
  );
  assert.deepEqual(nodeIds, [4]);
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

test('scheduler rotates unfinished windows after one work quantum', () => {
  let busyHandle = scheduler_registerWindow(43000);
  let smallHandle = scheduler_registerWindow(43001);
  let busyNodeCount = SCHEDULER_WINDOW_WORK_QUANTUM + 10;
  let busyCommands = [];

  for (let i = 0; i < busyNodeCount; i++) {
    busyCommands.push([3, 0, 4 + i * 2]);
  }

  ingestSchedulerCommands(busyHandle, busyCommands);
  ingestSchedulerCommands(smallHandle, [[3, 0, 4]]);

  let records = drainSchedulerRecords();

  assert.deepEqual(
    records.map(record => [
      record.slot,
      record.deletedNodeIds.length,
      record.nodeIds.length,
      record.workCost
    ]),
    [
      [
        busyHandle.slot,
        0,
        SCHEDULER_WINDOW_WORK_QUANTUM,
        SCHEDULER_WINDOW_WORK_QUANTUM
      ],
      [smallHandle.slot, 0, 1, 1],
      [busyHandle.slot, 0, 10, 10]
    ]
  );
  assert.deepEqual(
    records
      .filter(record => record.slot === busyHandle.slot)
      .flatMap(record => record.nodeIds),
    Array.from({ length: busyNodeCount }, (_, i) => 4 + i * 2)
  );
  assert.equal(scheduler_hasWork(), false);

  scheduler_deregisterWindow(busyHandle.slot, busyHandle.generation);
  scheduler_deregisterWindow(smallHandle.slot, smallHandle.generation);
});

test('scheduler applies the work quantum to disposals', () => {
  let busyHandle = scheduler_registerWindow(44000);
  let smallHandle = scheduler_registerWindow(44001);
  let busyNodeCount = SCHEDULER_WINDOW_WORK_QUANTUM + 10;
  let registerCommands = [];
  let disposeCommands = [];

  for (let i = 0; i < busyNodeCount; i++) {
    let nodeId = 4 + i * 2;
    registerCommands.push([3, 0, nodeId]);
    disposeCommands.push([4, 0, nodeId]);
  }

  ingestSchedulerCommands(busyHandle, registerCommands);
  drainSchedulerNodeIds();

  ingestSchedulerCommands(busyHandle, disposeCommands);
  ingestSchedulerCommands(smallHandle, [[3, 0, 4]]);

  assert.deepEqual(
    drainSchedulerRecords().map(record => [
      record.slot,
      record.deletedNodeIds.length,
      record.nodeIds.length
    ]),
    [
      [busyHandle.slot, SCHEDULER_WINDOW_WORK_QUANTUM, 0],
      [smallHandle.slot, 0, 1],
      [busyHandle.slot, 10, 0]
    ]
  );
  assert.equal(scheduler_hasWork(), false);

  scheduler_deregisterWindow(busyHandle.slot, busyHandle.generation);
  scheduler_deregisterWindow(smallHandle.slot, smallHandle.generation);
});

test('scheduler packets keep replacement deletion and forward work together', () => {
  let handle = scheduler_registerWindow(45000);

  ingestSchedulerCommands(handle, [[3, 0, 4]]);
  drainSchedulerNodeIds();
  ingestSchedulerCommands(handle, [[3, 4, 6]]);
  drainSchedulerNodeIds();

  ingestSchedulerCommands(handle, [
    [2, 4, 101],
    [1, 4, 101],
    [2, 6, 103],
    [1, 6, 103],
    [6, 101],
    [6, 103]
  ]);

  let records = drainSchedulerRecords();

  assert.equal(records.length, 1);
  assert.equal(
    records[0].flags,
    SCHEDULER_PACKET_START | SCHEDULER_PACKET_END
  );
  assert.deepEqual(records[0].deletedNodeIds, [6]);
  assert.deepEqual(records[0].nodeIds, [4]);
  assert.equal(scheduler_hasWork(), false);

  scheduler_deregisterWindow(handle.slot, handle.generation);
});
