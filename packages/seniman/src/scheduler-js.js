import { Buffer } from 'node:buffer';
// This scheduler module & external call flow (strictly using buffers as high-perf I/O interface)
// is structured such that we'll be able to move this to a WASM module in the future.

const NODE_FRESH = 0;
const NODE_QUEUED = 2;
const NODE_EXPIRED = 3;
const NODE_DELETING = 4;
const INPUT_FRAME_HEADER_SIZE = 12;
const OUTPUT_PACKET_HEADER_SIZE = 28;

export const SCHEDULER_PACKET_START = 1;
export const SCHEDULER_PACKET_END = 2;
export const SCHEDULER_WINDOW_WORK_QUANTUM = 256;

const windowMap = new Map();
const freeWindowSlots = [];
const windowSlotGenerations = [];

let nextWindowSlot = 1;
let activeWindowQueue = [];
let activeWindowQueueHead = 0;

const OPERATION_NONE = 0;
const OPERATION_DISPOSE = 1;
const OPERATION_CLEAN = 2;
const PACKET_CALCULATE = 0;
const PACKET_FORWARD = 1;

let pendingWindow = null;
let pendingPacketId = 0;
let pendingPacketWorkCost = 0;
let pendingPacketPhase = PACKET_CALCULATE;
let pendingPacketStarted = false;
let pendingOperation = OPERATION_NONE;
let pendingOperationNode = null;
let pendingOperationParentId = 0;
let pendingForwardNodeCount = 0;
let pendingForwardNodeIndex = 0;

// A packet can contain at most one forward node per unit of scheduler work.
// Deletions stream directly to the output page and can exceed this bound.
const pendingForwardNodeIds = new Uint32Array(
  SCHEDULER_WINDOW_WORK_QUANTUM
);

let ActiveOutputBuffer = null;
let ActiveOutputOffset = 0;
let ActiveOutputEnd = 0;
let ActiveOutputDeletedNodeCount = 0;

let ActiveWindow = null;

export function scheduler_registerWindow(windowId) {
  let slot = freeWindowSlots.pop();

  if (slot == null) {
    slot = nextWindowSlot++;
  }

  let generation = ((windowSlotGenerations[slot] || 0) + 1) >>> 0;

  if (generation === 0) {
    generation = 1;
  }

  windowSlotGenerations[slot] = generation;
  windowMap.set(slot, {
    windowId,
    slot,
    generation,
    nextPacketId: 1,
    queued: false,
    paused: false,
    childrenListMap: new Map(),
    sourcesMap: new Map(),
    observersMap: new Map(),
    nodeMap: new Map(),
    effectStatesMap: new Map(),
    workQueue: new WorkQueue(),
    disposeList: []
  });

  return { slot, generation };
}

export function scheduler_deregisterWindow(slot, generation) {
  let window = windowMap.get(slot);

  if (!window || window.generation !== generation) {
    return;
  }

  window.queued = false;
  windowMap.delete(slot);
  freeWindowSlots.push(slot);
}

export function scheduler_setWindowPaused(slot, generation, paused) {
  let window = windowMap.get(slot);

  if (!window || window.generation !== generation || window.paused === paused) {
    return;
  }

  window.paused = paused;

  if (paused) {
    window.queued = false;
  } else if (!window.workQueue.isEmpty() || window.disposeList.length) {
    activateWindow(window);
  }
}

function activateWindow(window) {
  if (window.queued || window.paused) {
    return;
  }

  window.queued = true;
  activeWindowQueue.push(window.slot, window.generation);
}

function compactActiveWindowQueue() {
  if (activeWindowQueueHead === activeWindowQueue.length) {
    activeWindowQueue = [];
    activeWindowQueueHead = 0;
  } else if (
    activeWindowQueueHead >= 2048 &&
    activeWindowQueueHead * 2 >= activeWindowQueue.length
  ) {
    activeWindowQueue = activeWindowQueue.slice(activeWindowQueueHead);
    activeWindowQueueHead = 0;
  }
}

function peekActiveWindow() {
  while (activeWindowQueueHead < activeWindowQueue.length) {
    let slot = activeWindowQueue[activeWindowQueueHead];
    let generation = activeWindowQueue[activeWindowQueueHead + 1];
    let window = windowMap.get(slot);

    if (window?.queued && !window.paused && window.generation === generation) {
      return window;
    }

    activeWindowQueueHead += 2;
  }

  compactActiveWindowQueue();
  return null;
}

function takeActiveWindow() {
  let window = peekActiveWindow();

  if (window) {
    activeWindowQueueHead += 2;
    window.queued = false;
    compactActiveWindowQueue();
  }

  return window;
}

export function scheduler_hasWork() {
  return pendingWindow !== null || peekActiveWindow() !== null;
}

function postStateWrite(stateId) {
  let window = ActiveWindow;

  if (!window) {
    throw new Error('Writing state on a window that has gone away. Make sure you are using onDispose() to clean up any resources when the user navigates away from the page.');
  }

  let observerEntry = window.observersMap.get(stateId);

  if (!observerEntry) {
    return;
  }

  let observers = observerEntry.observers;
  let nodeMap = window.nodeMap;

  let observersLength = observers.length;

  for (let i = 0; i < observersLength; i++) {
    let nodeId = observers[i];
    let node = nodeMap.get(nodeId);

    if (node.updateState === NODE_FRESH) {
      node.updateState = NODE_QUEUED;
      pushToWorkQueue(window, node);
    }
  }
}

function registerDependency(activeNodeId, stateId) {

  // TODO: make this faster in the new buffer pool approach
  let window = ActiveWindow;

  let stateObserverEntry = window.observersMap.get(stateId);

  let stateObserverCount = stateObserverEntry.observers.length;

  let activeNodeSourceEntry = window.sourcesMap.get(activeNodeId);
  activeNodeSourceEntry.sources.push(stateId);
  activeNodeSourceEntry.sourceSlots.push(stateObserverCount);

  let activeNodeSourcesLength = activeNodeSourceEntry.sources.length;

  stateObserverEntry.observers.push(activeNodeId);
  stateObserverEntry.observerSlots.push(activeNodeSourcesLength - 1);
}

function registerState(effectId, stateId) {
  let window = ActiveWindow;

  window.observersMap.set(stateId, {
    observers: [],
    observerSlots: []
  });

  window.effectStatesMap.get(effectId).push(stateId);
}

function registerMemo(parentNodeId, memoId) {
  let window = ActiveWindow;

  let memo = {
    id: memoId,
    depth: window.nodeMap.get(parentNodeId).depth + 1,
    updateState: NODE_FRESH
  };

  window.nodeMap.set(memoId, memo);

  window.sourcesMap.set(memoId, {
    sources: [],
    sourceSlots: []
  });

  window.observersMap.set(memoId, {
    observers: [],
    observerSlots: []
  });

  window.childrenListMap.get(parentNodeId).push(memoId);

  pushToWorkQueue(window, memo);
}

function registerEffect(parentNodeId, effectId) {
  let window = ActiveWindow;
  let depth;

  if (parentNodeId) {
    depth = window.nodeMap.get(parentNodeId).depth + 1;
  } else {
    depth = 0;
  }

  const effect = {
    id: effectId,
    depth,
    updateState: NODE_FRESH
  };

  window.nodeMap.set(effectId, effect);

  if (parentNodeId) {
    window.childrenListMap.get(parentNodeId).push(effectId);
  }

  window.sourcesMap.set(effectId, {
    sources: [],
    sourceSlots: []
  });

  window.childrenListMap.set(effectId, []);
  window.effectStatesMap.set(effectId, []);

  pushToWorkQueue(window, effect);
}

function disposeEffect(parentId, effectId) {

  ActiveWindow.disposeList.push([parentId, effectId]);
  activateWindow(ActiveWindow);
}

///////////////////////

function _removeNodeFromSources(nodeId) {
  let { sources, sourceSlots } = ActiveWindow.sourcesMap.get(nodeId);

  while (sources.length) {
    const sourceId = sources.pop(),
      sourceIndex = sourceSlots.pop();

    // sources[sourceId].observers
    if (!ActiveWindow.observersMap.has(sourceId)) {
      continue;
    }

    let {
      observers: sourceObservers,
      observerSlots: sourceObserverSlots
    } = ActiveWindow.observersMap.get(sourceId);

    if (sourceObservers && sourceObservers.length > 0) {
      let obsId = sourceObservers.pop();
      let obsSlot = sourceObserverSlots.pop();

      if (sourceIndex < sourceObservers.length) {
        ActiveWindow.sourcesMap.get(obsId).sourceSlots[obsSlot] = sourceIndex;
        sourceObservers[sourceIndex] = obsId;
        sourceObserverSlots[sourceIndex] = obsSlot;
      }
    }
  }
}

function _removeEffectStates(nodeId) {

  let effectStates = ActiveWindow.effectStatesMap.get(nodeId);

  for (let i = 0; i < effectStates.length; i++) {
    // delete the state from the observersMap
    let stateId = effectStates[i];
    ActiveWindow.observersMap.delete(stateId);
  }

  ActiveWindow.effectStatesMap.set(nodeId, []);
}

function _removeNodeSubtree(nodeId) {
  let children = ActiveWindow.childrenListMap.get(nodeId);

  if (!children) {
    return true;
  }

  while (children.length) {
    let childIndex = children.length - 1;
    let childNodeId = children[childIndex];
    let childNode = ActiveWindow.nodeMap.get(childNodeId);

    if (!childNode || childNode.updateState === NODE_EXPIRED) {
      children.pop();
      continue;
    }

    let isEffect = childNodeId % 2 == 0;

    childNode.updateState = NODE_DELETING;

    if (isEffect && !_removeNodeSubtree(childNodeId)) {
      return false;
    }

    if (ActiveOutputOffset + 4 > ActiveOutputEnd) {
      return false;
    }

    children.pop();
    childNode.updateState = NODE_EXPIRED;
    _deletedNodeCleanup(childNode);
    _writeDeletedNode(childNodeId);
  }

  ActiveWindow.childrenListMap.set(nodeId, []);
  return true;
}

function pushToWorkQueue(window, node) {
  window.workQueue.add(node);
  activateWindow(window);
}

export function scheduler_ingest(buffer, length) {
  if (length > buffer.length) {
    throw new Error('Scheduler input length exceeds its buffer');
  }

  let readOffset = 0;

  while (readOffset < length) {
    if (length - readOffset < INPUT_FRAME_HEADER_SIZE) {
      throw new Error('Invalid scheduler input frame');
    }

    let slot = buffer.readUInt32LE(readOffset);
    let generation = buffer.readUInt32LE(readOffset + 4);
    let commandByteLength = buffer.readUInt32LE(readOffset + 8);
    let frameEnd = readOffset + INPUT_FRAME_HEADER_SIZE + commandByteLength;

    if (frameEnd > length) {
      throw new Error('Invalid scheduler input frame length');
    }

    readOffset += INPUT_FRAME_HEADER_SIZE;

    let window = windowMap.get(slot);

    if (!window || window.generation !== generation) {
      readOffset = frameEnd;
      continue;
    }

    ActiveWindow = window;

    function readUInt32() {
      let value = buffer.readUInt32LE(readOffset);
      readOffset += 4;
      return value;
    }

    while (readOffset < frameEnd) {
      let commandType = buffer.readUInt8(readOffset++);

      switch (commandType) {
        case 1:
          registerDependency(readUInt32(), readUInt32());
          break;
        case 2:
          registerState(readUInt32(), readUInt32());
          break;
        case 3:
          registerEffect(readUInt32(), readUInt32());
          break;
        case 4:
          disposeEffect(readUInt32(), readUInt32());
          break;
        case 5:
          registerMemo(readUInt32(), readUInt32());
          break;
        case 6:
          postStateWrite(readUInt32());
          break;
        default:
          throw new Error(`Invalid scheduler input command: ${commandType}`);
      }
    }

    if (readOffset !== frameEnd) {
      throw new Error('Invalid scheduler input command length');
    }
  }

  ActiveWindow = null;
}

function startPendingPacket() {
  let window = takeActiveWindow();

  if (!window) {
    return false;
  }

  pendingWindow = window;
  pendingPacketId = window.nextPacketId++;
  pendingPacketWorkCost = 0;
  pendingPacketPhase = PACKET_CALCULATE;
  pendingPacketStarted = false;
  pendingOperation = OPERATION_NONE;
  pendingOperationNode = null;
  pendingOperationParentId = 0;
  pendingForwardNodeCount = 0;
  pendingForwardNodeIndex = 0;

  if (window.nextPacketId > 0xffffffff) {
    window.nextPacketId = 1;
  }

  return true;
}

function finishPendingOperation() {
  let node = pendingOperationNode;
  let nodeId = node.id;

  if (pendingOperation === OPERATION_DISPOSE) {
    if (ActiveOutputOffset + 4 > ActiveOutputEnd) {
      return false;
    }

    if (pendingOperationParentId > 0) {
      let children = ActiveWindow.childrenListMap.get(
        pendingOperationParentId
      );
      let index = children?.indexOf(nodeId) ?? -1;

      if (index >= 0) {
        children.splice(index, 1);
      }
    }

    node.updateState = NODE_EXPIRED;
    _deletedNodeCleanup(node);
    _writeDeletedNode(nodeId);
  } else {
    _removeNodeFromSources(nodeId);
    node.updateState = NODE_FRESH;
    pendingForwardNodeIds[pendingForwardNodeCount++] = nodeId;
  }

  pendingOperation = OPERATION_NONE;
  pendingOperationNode = null;
  pendingOperationParentId = 0;
  return true;
}

function continuePendingOperation() {
  let nodeId = pendingOperationNode.id;

  if (nodeId % 2 === 0 && !_removeNodeSubtree(nodeId)) {
    return false;
  }

  return finishPendingOperation();
}

function calculatePendingPacket() {
  let window = pendingWindow;
  let workQueue = window.workQueue;
  let disposeList = window.disposeList;

  ActiveWindow = window;

  try {
    while (
      pendingOperation !== OPERATION_NONE ||
      pendingPacketWorkCost < SCHEDULER_WINDOW_WORK_QUANTUM
    ) {
      if (pendingOperation !== OPERATION_NONE) {
        if (!continuePendingOperation()) {
          return false;
        }

        continue;
      }

      if (disposeList.length) {
        let disposal = disposeList.pop();
        let parentId = disposal[0];
        let node = window.nodeMap.get(disposal[1]);

        // Disposal requests can overlap when an ancestor owns cleanup for an
        // explicitly disposed descendant in the same packet.
        if (
          !node ||
          node.updateState === NODE_EXPIRED ||
          node.updateState === NODE_DELETING
        ) {
          pendingPacketWorkCost++;
          continue;
        }

        node.updateState = NODE_DELETING;
        pendingOperation = OPERATION_DISPOSE;
        pendingOperationNode = node;
        pendingOperationParentId = parentId;
        continue;
      }

      if (workQueue.isEmpty()) {
        break;
      }

      let node = workQueue.poll();
      pendingPacketWorkCost++;

      if (
        node.updateState === NODE_EXPIRED ||
        node.updateState === NODE_DELETING
      ) {
        continue;
      }

      if (node.id % 2 === 0) {
        _removeEffectStates(node.id);
      }

      pendingOperation = OPERATION_CLEAN;
      pendingOperationNode = node;
    }

    if (
      (disposeList.length || !workQueue.isEmpty()) &&
      windowMap.get(window.slot) === window
    ) {
      activateWindow(window);
    }

    pendingPacketPhase = PACKET_FORWARD;
    return true;
  } finally {
    ActiveWindow = null;
  }
}

function clearPendingPacket() {
  pendingWindow = null;
  pendingOperation = OPERATION_NONE;
  pendingOperationNode = null;
  pendingForwardNodeCount = 0;
  pendingForwardNodeIndex = 0;
  pendingPacketStarted = false;
}

function writeOutputPacketHeader(
  buffer,
  offset,
  flags,
  deletedNodeCount,
  nodeCount
) {
  buffer.writeUInt8(flags, offset);
  buffer.writeUInt8(0, offset + 1);
  buffer.writeUInt16LE(0, offset + 2);
  buffer.writeUInt32LE(pendingWindow.slot, offset + 4);
  buffer.writeUInt32LE(pendingWindow.generation, offset + 8);
  buffer.writeUInt32LE(pendingPacketId, offset + 12);
  buffer.writeUInt32LE(deletedNodeCount, offset + 16);
  buffer.writeUInt32LE(nodeCount, offset + 20);
  buffer.writeUInt32LE(pendingPacketWorkCost, offset + 24);
}

export function scheduler_drainWork(buffer, workBudget = Infinity) {
  if (buffer.length < OUTPUT_PACKET_HEADER_SIZE + 4) {
    throw new Error('Scheduler output buffer is too small');
  }

  let writeOffset = 0;
  let drainedWorkCost = 0;

  while (
    buffer.length - writeOffset >=
    OUTPUT_PACKET_HEADER_SIZE + 4
  ) {
    if (pendingWindow === null && drainedWorkCost >= workBudget) {
      break;
    }

    if (pendingWindow === null && !startPendingPacket()) {
      break;
    }

    let headerOffset = writeOffset;
    writeOffset += OUTPUT_PACKET_HEADER_SIZE;
    ActiveOutputBuffer = buffer;
    ActiveOutputOffset = writeOffset;
    ActiveOutputEnd = buffer.length;
    ActiveOutputDeletedNodeCount = 0;

    if (pendingPacketPhase === PACKET_CALCULATE) {
      calculatePendingPacket();
    }

    let nodeCount = 0;

    if (pendingPacketPhase === PACKET_FORWARD) {
      while (
        pendingForwardNodeIndex < pendingForwardNodeCount &&
        ActiveOutputOffset + 4 <= ActiveOutputEnd
      ) {
        buffer.writeUInt32LE(
          pendingForwardNodeIds[pendingForwardNodeIndex++],
          ActiveOutputOffset
        );
        ActiveOutputOffset += 4;
        nodeCount++;
      }
    }

    writeOffset = ActiveOutputOffset;
    let deletedNodeCount = ActiveOutputDeletedNodeCount;
    let packetComplete = pendingPacketPhase === PACKET_FORWARD &&
      pendingForwardNodeIndex === pendingForwardNodeCount;

    if (deletedNodeCount === 0 && nodeCount === 0) {
      writeOffset = headerOffset;

      if (packetComplete) {
        drainedWorkCost += pendingPacketWorkCost;
        clearPendingPacket();
        continue;
      }

      throw new Error('Scheduler output packet made no progress');
    }

    let flags = pendingPacketStarted ? 0 : SCHEDULER_PACKET_START;

    if (packetComplete) {
      flags |= SCHEDULER_PACKET_END;
    }

    writeOutputPacketHeader(
      buffer,
      headerOffset,
      flags,
      deletedNodeCount,
      nodeCount
    );

    if (packetComplete) {
      drainedWorkCost += pendingPacketWorkCost;
      clearPendingPacket();
    } else {
      pendingPacketStarted = true;
    }
  }

  ActiveOutputBuffer = null;
  return writeOffset;
}

function _writeDeletedNode(nodeId) {
  ActiveOutputBuffer.writeUInt32LE(nodeId, ActiveOutputOffset);
  ActiveOutputOffset += 4;
  ActiveOutputDeletedNodeCount++;
  pendingPacketWorkCost++;
}

function _deletedNodeCleanup(node) {
  let nodeId = node.id;
  let isEffect = nodeId % 2 == 0;

  if (isEffect) {
    _removeEffectStates(nodeId);
  }

  _removeNodeFromSources(nodeId);

  ActiveWindow.nodeMap.delete(nodeId);
  ActiveWindow.sourcesMap.delete(nodeId);

  if (isEffect) {
    ActiveWindow.childrenListMap.delete(nodeId);
    ActiveWindow.effectStatesMap.delete(nodeId);
  } else {
    ActiveWindow.observersMap.delete(nodeId);
  }
}

class WorkQueue {

  constructor() {
    this.queue = [];
    this.nextSequence = 0;
  }

  add(item) {
    let queue = this.queue;
    let index = queue.length;

    item.queueSequence = this.nextSequence++;
    queue.push(item);

    while (index > 0) {
      let parentIndex = (index - 1) >> 1;
      let parent = queue[parentIndex];

      if (!comesBefore(item, parent)) {
        break;
      }

      queue[index] = parent;
      index = parentIndex;
    }

    queue[index] = item;
  }

  isEmpty() {
    return this.queue.length === 0;
  }

  poll() {
    let queue = this.queue;
    let first = queue[0];
    let last = queue.pop();

    if (queue.length === 0) {
      this.nextSequence = 0;
      return first;
    }

    let index = 0;
    let halfLength = queue.length >> 1;

    while (index < halfLength) {
      let leftIndex = index * 2 + 1;
      let rightIndex = leftIndex + 1;
      let childIndex = leftIndex;

      if (
        rightIndex < queue.length &&
        comesBefore(queue[rightIndex], queue[leftIndex])
      ) {
        childIndex = rightIndex;
      }

      let child = queue[childIndex];

      if (!comesBefore(child, last)) {
        break;
      }

      queue[index] = child;
      index = childIndex;
    }

    queue[index] = last;
    return first;
  }
}

function comesBefore(a, b) {
  return a.depth < b.depth ||
    (a.depth === b.depth && a.queueSequence < b.queueSequence);
}

export const SCHEDULER_INPUT_PAGE_SIZE = 64 * 1024;
export const SCHEDULER_OUTPUT_PAGE_SIZE = 64 * 1024;

const schedulerInputBuffer = Buffer.allocUnsafe(SCHEDULER_INPUT_PAGE_SIZE);

export function scheduler_getInputBuffer() {
  return schedulerInputBuffer;
}

export function scheduler_getMemorySize() {
  return 0;
}

export function scheduler_getMemoryGrowthCount() {
  return 0;
}
