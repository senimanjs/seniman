
import { schedulerInputCommand, schedulerOutputCommand } from "./state.js";

// This scheduler module & external call flow (strictly using buffers as high-perf I/O interface)
// is structured such that we'll be able to move this to a WASM module in the future.

const EFFECT = 1;
const MEMO = 2;

const NODE_FRESH = 0;
const NODE_QUEUED = 2;
const NODE_EXPIRED = 3;

const windowMap = new Map();

let ActiveWindow = null;

export function scheduler_registerWindow(windowId) {
  // TODO: move to a more efficient buffer pool approach soon
  windowMap.set(windowId, {
    id: windowId,
    childrenListMap: new Map(),
    sourcesMap: new Map(),
    observersMap: new Map(),
    nodeMap: new Map(),
    effectStatesMap: new Map(),
    workQueue: new WorkQueue()
  });
}

function deleteWindow(windowId) {
  windowMap.delete(windowId);
}

function postStateWrite(windowId, stateId) {
  let window = windowMap.get(windowId);

  if (!window) {
    console.error("Applying setState to a window that have gone away");
    return;
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

function registerDependency(windowId, activeNodeId, stateId) {

  // TODO: make this faster in the new buffer pool approach

  let window = windowMap.get(windowId);

  let stateObserverEntry = window.observersMap.get(stateId);

  let stateObserverCount = stateObserverEntry.observers.length;

  let activeNodeSourceEntry = window.sourcesMap.get(activeNodeId);
  activeNodeSourceEntry.sources.push(stateId);
  activeNodeSourceEntry.sourceSlots.push(stateObserverCount);

  let activeNodeSourcesLength = activeNodeSourceEntry.sources.length;

  stateObserverEntry.observers.push(activeNodeId);
  stateObserverEntry.observerSlots.push(activeNodeSourcesLength - 1);
}

function registerState(windowId, effectId, stateId) {

  let window = windowMap.get(windowId);

  window.observersMap.set(stateId, {
    observers: [],
    observerSlots: []
  });

  window.effectStatesMap.get(effectId).push(stateId);
}

function registerMemo(windowId, parentNodeId, memoId) {
  let window = windowMap.get(windowId);

  let memo = {
    id: memoId,
    type: MEMO,
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

function registerEffect(windowId, parentNodeId, effectId) {

  let window = windowMap.get(windowId);
  let depth;

  if (parentNodeId) {
    depth = window.nodeMap.get(parentNodeId).depth + 1;
  } else {
    depth = 0;
  }

  const effect = {
    id: effectId,
    type: EFFECT,
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

function disposeEffect(windowId, effectId) {

  let window = windowMap.get(windowId);

  let effect = window.nodeMap.get(effectId);

  let previousWindowId = ActiveWindow ? ActiveWindow.id : null;

  _setActiveWindowId(windowId);
  cleanNode(effect);
  _setActiveWindowId(previousWindowId);
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
  let deletedNodeIds = [];

  if (node.type == EFFECT) {
    // TODO: run this a bit later during calculateWork? or after the complete batch is executed.
    _removeEffectStates(nodeId);

    _removeNodeSubtree(nodeId, deletedNodeIds);
  }

  _removeNodeFromSources(nodeId);

  node.updateState = NODE_FRESH;
  node.deletedNodeIds = deletedNodeIds;
}

function _removeNodeSubtree(nodeId, deletedNodeIds) {
  let children = ActiveWindow.childrenListMap.get(nodeId);

  if (!children) {
    return;
  }

  let childrenCount = children.length;

  for (let i = 0; i < childrenCount; i++) {
    let childNodeId = children[i];
    let childNode = ActiveWindow.nodeMap.get(childNodeId);

    childNode.updateState = NODE_EXPIRED;

    deletedNodeIds.push(childNodeId);

    if (childNode.type == EFFECT) {
      _removeEffectStates(childNodeId);
      _removeNodeSubtree(childNodeId, deletedNodeIds);
    }

    _removeNodeFromSources(childNodeId);

    ActiveWindow.nodeMap.delete(childNodeId);
    ActiveWindow.sourcesMap.delete(childNodeId);

    if (childNode.type == EFFECT) {
      ActiveWindow.childrenListMap.delete(childNodeId);
      ActiveWindow.effectStatesMap.delete(childNodeId);
    } else {
      ActiveWindow.observersMap.delete(childNodeId);
    }
  }

  ActiveWindow.childrenListMap.set(nodeId, []);
}

function pushToWorkQueue(window, node) {
  window.workQueue.add(node);
}

/*
Scheduler Input command types:
- 1: registerDependency (windowId, activeNodeId, stateId)
- 2: registerState (windowId, effectId, stateId)
- 3: registerEffect (windowId, parentNodeId, effectId)
- 4: disposeEffect (windowId, effectId)
- 5: registerMemo (windowId, parentNodeId, memoId)
- 6: postStateWrite (windowId, stateId)
- 7: deregisterWindow (windowId)
*/
export function scheduler_calculateWorkBatch() {

  let batchWindowId = schedulerInputCommand.windowId;

  _setActiveWindowId(batchWindowId);

  let commandsCount = schedulerInputCommand.commands.length;

  for (let i = 0; i < commandsCount; i++) {

    let command = schedulerInputCommand.commands[i];

    switch (command.type) {
      case 1:
        registerDependency(batchWindowId, command.activeNodeId, command.stateId);
        break;
      case 2:
        registerState(batchWindowId, command.effectId, command.stateId);
        break;
      case 3:
        registerEffect(batchWindowId, command.parentNodeId, command.effectId);
        break;
      case 4:
        disposeEffect(batchWindowId, command.effectId);
        break;
      case 5:
        registerMemo(batchWindowId, command.parentNodeId, command.memoId);
        break;
      case 6:
        postStateWrite(batchWindowId, command.stateId);
        break;
      case 7:
        deleteWindow(batchWindowId);
        break;
    }
  }

  schedulerInputCommand.windowId = -1;
  schedulerInputCommand.commands = [];

  ////////////////////////////
  // SCHEDULER OUTPUT WRITE STAGE
  const workQueue = ActiveWindow.workQueue;

  schedulerOutputCommand.windowId = batchWindowId;
  schedulerOutputCommand.commands = [];

  let i = 0;

  while (!workQueue.isEmpty()) {
    let node = workQueue.poll();

    if (node.updateState === NODE_EXPIRED) {
      continue;
    }

    cleanNode(node);
    // command's node entry is [nodeType, nodeId,  deletedNodeIds]
    // isValid denotes whether the entry is still valid or not. can be made invalid if the an inflight state writes touches an in-batch node entry
    schedulerOutputCommand.commands.push([node.type, node.id, node.deletedNodeIds]);

    i++;
  }

  // return true if there's work to do
  return i > 0;
}

function _setActiveWindowId(windowId) {
  if (windowId) {
    ActiveWindow = windowMap.get(windowId);
  } else {
    ActiveWindow = null;
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