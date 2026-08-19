// This scheduler module & external call flow (strictly using buffers as high-perf I/O interface)
// is structured such that we'll be able to move this to a WASM module in the future.

const NODE_FRESH = 0;
const NODE_QUEUED = 2;
const NODE_EXPIRED = 3;
const INPUT_FRAME_HEADER_SIZE = 12;
const OUTPUT_RECORD_HEADER_SIZE = 16;

export const SCHEDULER_OUTPUT_RUN_NODES = 1;
export const SCHEDULER_OUTPUT_DELETE_NODES = 2;

const windowMap = new Map();
const freeWindowSlots = [];
const windowSlotGenerations = [];

let nextWindowSlot = 1;
let activeWindowQueue = [];
let activeWindowQueueHead = 0;
let pendingOutputType = 0;
let pendingDeletedNodeIndex = -1;
let pendingNodeIndex = 0;

let ActiveWindow = null;

export const schedulerOutputCommand = {
  windowId: -1,
  slot: 0,
  generation: 0,
  nodeIds: [],
  deletedNodeIds: []
};

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
    queued: false,
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

function activateWindow(window) {
  if (window.queued) {
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

    if (window?.queued && window.generation === generation) {
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
  return pendingOutputType !== 0 || peekActiveWindow() !== null;
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

function cleanNode(node) {
  let nodeId = node.id;
  let isEffect = nodeId % 2 == 0;
  if (isEffect) {
    // TODO: run this a bit later during calculateWork? or after the complete batch is executed.
    _removeEffectStates(nodeId);

    _removeNodeSubtree(nodeId);
  }

  _removeNodeFromSources(nodeId);

  node.updateState = NODE_FRESH;
}

function _removeNodeSubtree(nodeId) {
  let children = ActiveWindow.childrenListMap.get(nodeId);

  if (!children) {
    return;
  }

  let childrenCount = children.length;

  for (let i = 0; i < childrenCount; i++) {
    let childNodeId = children[i];
    let childNode = ActiveWindow.nodeMap.get(childNodeId);

    // A descendant can already be expired when its own disposer and an
    // ancestor disposer are processed in the same scheduler batch.
    if (!childNode || childNode.updateState === NODE_EXPIRED) {
      continue;
    }

    let isEffect = childNodeId % 2 == 0;

    childNode.updateState = NODE_EXPIRED;

    schedulerOutputCommand.deletedNodeIds.push(childNodeId);

    if (isEffect) {
      _removeNodeSubtree(childNodeId);
    }
  }

  ActiveWindow.childrenListMap.set(nodeId, []);
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

export function scheduler_calculateWorkBatch() {
  let window = takeActiveWindow();

  schedulerOutputCommand.nodeIds = [];
  schedulerOutputCommand.deletedNodeIds = [];

  if (!window) {
    schedulerOutputCommand.windowId = -1;
    schedulerOutputCommand.slot = 0;
    schedulerOutputCommand.generation = 0;
    return schedulerOutputCommand;
  }

  ActiveWindow = window;
  let batchWindowId = window.windowId;

  ////////////////////////////
  // SCHEDULER OUTPUT WRITE STAGE
  const workQueue = ActiveWindow.workQueue;
  const disposeList = ActiveWindow.disposeList;

  // tells state.js which window the output is for
  schedulerOutputCommand.windowId = batchWindowId;
  schedulerOutputCommand.slot = window.slot;
  schedulerOutputCommand.generation = window.generation;

  while (disposeList.length) {
    let [parentId, nodeId] = disposeList.pop();
    let node = ActiveWindow.nodeMap.get(nodeId);

    // Disposal requests may overlap: deleting an ancestor expires its entire
    // subtree, including descendants which already have explicit disposers in
    // this batch. Only the first path owns the scheduler cleanup.
    if (!node || node.updateState === NODE_EXPIRED) {
      continue;
    }

    _removeNodeSubtree(nodeId);

    node.updateState = NODE_EXPIRED;

    // if parent is not root
    if (parentId > 0) {
      // remove from the parent's children list
      let children = ActiveWindow.childrenListMap.get(parentId);
      let index = children?.indexOf(nodeId) ?? -1;

      if (index >= 0) {
        children.splice(index, 1);
      }
    }

    schedulerOutputCommand.deletedNodeIds.push(nodeId);
  }

  let i = 0;

  while (!workQueue.isEmpty()) {
    let node = workQueue.poll();

    if (node.updateState === NODE_EXPIRED) {
      continue;
    }

    cleanNode(node);

    schedulerOutputCommand.nodeIds.push(node.id);

    i++;
  }

  // run internal clean ups of the deleted nodes
  _deletedNodeCleanup();

  ActiveWindow = null;
  return schedulerOutputCommand;
}

function writeOutputRecordHeader(buffer, offset, type, count) {
  buffer.writeUInt8(type, offset);
  buffer.writeUInt8(0, offset + 1);
  buffer.writeUInt16LE(0, offset + 2);
  buffer.writeUInt32LE(schedulerOutputCommand.slot, offset + 4);
  buffer.writeUInt32LE(schedulerOutputCommand.generation, offset + 8);
  buffer.writeUInt32LE(count, offset + 12);
}

function preparePendingOutput() {
  while (pendingOutputType === 0) {
    if (!peekActiveWindow()) {
      return false;
    }

    scheduler_calculateWorkBatch();
    pendingDeletedNodeIndex = schedulerOutputCommand.deletedNodeIds.length - 1;
    pendingNodeIndex = 0;

    if (pendingDeletedNodeIndex >= 0) {
      pendingOutputType = SCHEDULER_OUTPUT_DELETE_NODES;
    } else if (schedulerOutputCommand.nodeIds.length > 0) {
      pendingOutputType = SCHEDULER_OUTPUT_RUN_NODES;
    }
  }

  return true;
}

export function scheduler_drainWork(buffer) {
  if (buffer.length < OUTPUT_RECORD_HEADER_SIZE + 4) {
    throw new Error('Scheduler output buffer is too small');
  }

  let writeOffset = 0;

  while (
    buffer.length - writeOffset >=
    OUTPUT_RECORD_HEADER_SIZE + 4
  ) {
    if (!preparePendingOutput()) {
      break;
    }

    let availableNodeCount = Math.floor(
      (buffer.length - writeOffset - OUTPUT_RECORD_HEADER_SIZE) / 4
    );
    let count;

    if (pendingOutputType === SCHEDULER_OUTPUT_DELETE_NODES) {
      count = Math.min(availableNodeCount, pendingDeletedNodeIndex + 1);
      writeOutputRecordHeader(
        buffer,
        writeOffset,
        SCHEDULER_OUTPUT_DELETE_NODES,
        count
      );
      writeOffset += OUTPUT_RECORD_HEADER_SIZE;

      for (let i = 0; i < count; i++) {
        buffer.writeUInt32LE(
          schedulerOutputCommand.deletedNodeIds[pendingDeletedNodeIndex--],
          writeOffset
        );
        writeOffset += 4;
      }

      if (pendingDeletedNodeIndex < 0) {
        schedulerOutputCommand.deletedNodeIds = [];
        pendingOutputType = schedulerOutputCommand.nodeIds.length > 0
          ? SCHEDULER_OUTPUT_RUN_NODES
          : 0;
      }
    } else {
      count = Math.min(
        availableNodeCount,
        schedulerOutputCommand.nodeIds.length - pendingNodeIndex
      );
      writeOutputRecordHeader(
        buffer,
        writeOffset,
        SCHEDULER_OUTPUT_RUN_NODES,
        count
      );
      writeOffset += OUTPUT_RECORD_HEADER_SIZE;

      for (let i = 0; i < count; i++) {
        buffer.writeUInt32LE(
          schedulerOutputCommand.nodeIds[pendingNodeIndex++],
          writeOffset
        );
        writeOffset += 4;
      }

      if (pendingNodeIndex === schedulerOutputCommand.nodeIds.length) {
        schedulerOutputCommand.nodeIds = [];
        pendingOutputType = 0;
      }
    }
  }

  return writeOffset;
}

function _deletedNodeCleanup() {

  let schedulerDeletedNodeCount = schedulerOutputCommand.deletedNodeIds.length;

  for (let i = 0; i < schedulerDeletedNodeCount; i++) {
    let childNodeId = schedulerOutputCommand.deletedNodeIds[i];
    let isEffect = childNodeId % 2 == 0;

    if (isEffect) {
      _removeEffectStates(childNodeId);
    }

    _removeNodeFromSources(childNodeId);

    ActiveWindow.nodeMap.delete(childNodeId);
    ActiveWindow.sourcesMap.delete(childNodeId);

    if (isEffect) {
      ActiveWindow.childrenListMap.delete(childNodeId);
      ActiveWindow.effectStatesMap.delete(childNodeId);
    } else {
      ActiveWindow.observersMap.delete(childNodeId);
    }
  }
}

class WorkQueue {

  constructor() {
    this.queue = [];
  }

  add(item) {
    // looping from the end of the list, find the first item that has the similar or less depth,
    // if so, insert after it. otherwise, insert at the beginning
    let i = this.queue.length - 1;
    while (i >= 0) {

      if (this.queue[i].depth <= item.depth) {
        this.queue.splice(i + 1, 0, item);
        return;
      }

      i--;
    }

    this.queue.unshift(item);
  }

  isEmpty() {
    return this.queue.length === 0;
  }

  poll() {
    return this.queue.shift();
  }
}
