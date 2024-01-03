import { runEffect, runEffectDisposers, runMemo, untrack, setActiveWindowId, runInput, deleteNode } from "./state.js";

const EFFECT = 1;
const MEMO = 2;

const NODE_FRESH = 0;
const NODE_QUEUED = 2;
const NODE_EXPIRED = 3;

const windowMap = new Map();

let ActiveWindow = null;
let workStartTimeout = null;
let pendingWorkWindowList = [];

export function registerWindow(windowId) {

  // TODO: move to a more efficient buffer pool approach soon
  windowMap.set(windowId, {
    id: windowId,
    hasPendingWork: false,
    childrenListMap: new Map(),
    sourcesMap: new Map(),
    observersMap: new Map(),
    nodeMap: new Map(),
    effectStatesMap: new Map(),
    workQueue: new WorkQueue()
  });
}

export function deregisterWindow(windowId) {
  windowMap.delete(windowId);
}

export function postStateWrite(windowId, stateId) {
  let window = windowMap.get(windowId);
  let observerEntry = window.observersMap.get(stateId);

  if (!observerEntry) {
    return;
  }

  let observers = observerEntry.observers;
  let nodeMap = window.nodeMap;

  //  console.log("postStateWrite", windowId, stateId, observers);
  let observersLength = observers.length;

  for (let i = 0; i < observersLength; i++) {
    let nodeId = observers[i];
    let node = nodeMap.get(nodeId);

    if (node.updateState === NODE_FRESH) {
      node.updateState = NODE_QUEUED;
      submitWork(window, node);
    }
  }
}

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

  if (node.type == EFFECT) {
    runEffectDisposers(nodeId);
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

    childNode.updateState = NODE_EXPIRED;

    if (childNode.type == EFFECT) {
      runEffectDisposers(childNodeId);
      _removeEffectStates(childNodeId);
      _removeNodeSubtree(childNodeId);
    }

    _removeNodeFromSources(childNodeId);

    deleteNode(childNodeId);

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

function submitWork(window, node) {

  window.workQueue.add(node);

  if (!window.hasPendingWork) {
    window.hasPendingWork = true;

    pendingWorkWindowList.push(window.id);

    if (workStartTimeout) {
      return;
    }

    workStartTimeout = setTimeout(() => {
      workStartTimeout = null;
      _workLoop();
    }, 0);
  }
}

function _workLoop() {

  // TODO: allow passing of amount of work per loop
  while (true) {
    let windowId = pendingWorkWindowList.shift();

    if (windowId) {
      _setActiveWindowId(windowId);
      processWorkQueue();
      _setActiveWindowId(null);
      // TODO: if the we're early preempting the work queue for this window, reinsert the window on the back of the pendingWorkWindowList
    } else {
      break;
    }
  }
}


function _setActiveWindowId(windowId) {
  setActiveWindowId(windowId);

  if (windowId) {
    ActiveWindow = windowMap.get(windowId);
  } else {
    ActiveWindow = null;
  }
}

export function enqueueWindowInput(windowId, inputBuffer) {

  _setActiveWindowId(windowId);

  processInputQueue(inputBuffer);
  processWorkQueue();

  _setActiveWindowId(null);
}

function processInputQueue(inputBuffer) {

  untrack(() => {
    try {
      runInput(inputBuffer);
    } catch (e) {
      console.error(e);
    }
  });
}

function processWorkQueue() {

  const workQueue = ActiveWindow.workQueue;

  let i = 0;

  while (!workQueue.isEmpty()) {
    let node = workQueue.poll();

    if (node.updateState === NODE_EXPIRED) {
      continue;
    }

    cleanNode(node);

    if (node.type == MEMO) {
      runMemo(node.id);
    } else {
      runEffect(node.id);
    }

    i++;
  }

  // for now, always assume we're done with work, and set this.hasPendingWork to false
  // later, we'll need to check if there's still work to do since we'll only be allowed to do a certain amount of work per frame
  ActiveWindow.hasPendingWork = false;
}


export function registerDependency_internal(windowId, activeNodeId, stateId) {

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

export function registerState(windowId, effectId, stateId) {

  let window = windowMap.get(windowId);

  window.observersMap.set(stateId, {
    observers: [],
    observerSlots: []
  });

  window.effectStatesMap.get(effectId).push(stateId);
}

export function registerMemo(windowId, parentNodeId, memoId) {
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

  submitWork(window, memo);
}

export function registerEffect(windowId, parentNodeId, effectId) {

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

  submitWork(window, effect);
}

export function disposeEffect(windowId, effectId) {

  let window = windowMap.get(windowId);

  let effect = window.nodeMap.get(effectId);

  let previousWindowId = ActiveWindow ? ActiveWindow.id : null;

  _setActiveWindowId(windowId);
  cleanNode(effect);
  _setActiveWindowId(previousWindowId);
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