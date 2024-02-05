// Acknowledgement:
// This state system is highly inspired by SolidJS's signal system -- some lines of code are directly ported from SolidJS. 
// Some public API function names are directly ported from ReactJS.
// 
// SolidJS Github:
// https://github.com/solidjs/solid
// ReactJS Github:
// https://github.com/facebook/react

import { scheduler_registerWindow, scheduler_deregisterWindow, scheduler_calculateWorkBatch } from "./scheduler.js";

let ActiveNode = null;
let ActiveWindow = null;
let ActiveNodeMap = null;
let UntrackActive = false;

const windowMap = new Map();
const windowNodeMap = new Map();

export function getWindow(windowId) {
  return windowMap.get(windowId);
}

export function registerWindow(window) {
  windowMap.set(window.id, window);
  windowNodeMap.set(window.id, new Map());

  scheduler_registerWindow(window.id);
}

export function deregisterWindow(window) {
  windowMap.delete(window.id);
  windowNodeMap.delete(window.id);

  scheduler_deregisterWindow(window.id);
}

export function runInWindow(windowId, fn) {
  // run setActiveWindowId, but keep track of the previous active window
  let prevActiveWindow = ActiveWindow;

  _setActiveWindowId(windowId);
  fn();
  _setActiveWindowId(prevActiveWindow ? prevActiveWindow.id : null);
}

function _setActiveWindowId(id) {
  if (id) {
    ActiveWindow = windowMap.get(id);
    ActiveNodeMap = windowNodeMap.get(id);
  } else {
    ActiveWindow = null;
    ActiveNodeMap = null;
  }
}

function shouldMemoUpdate(node, prevValue, newValue) {

  let shouldUpdate = false;

  if (!node.comparator) {
    shouldUpdate = true;
  } else {
    shouldUpdate = !node.comparator(prevValue, newValue);
  }

  return shouldUpdate;
}

function _runNode(nodeId) {
  try {
    let node = ActiveNodeMap.get(nodeId);

    ActiveNode = node;

    let prevValue = node.value;
    node.value = node.fn(prevValue);

    // if memo, check if value has changed, if so, update observers
    if (nodeId % 2 == 1 && shouldMemoUpdate(node, prevValue, node.value)) {
      _postStateWrite(ActiveWindow.id, nodeId);
    }

  } catch (err) {
    handleError(err);
  } finally {
    ActiveNode = null;
  }
}

function _deleteNode(nodeId) {
  ActiveNodeMap.delete(nodeId);
}

function _runEffectDisposers(nodeId, isDeletion) {

  let node = ActiveNodeMap.get(nodeId);

  if (node.disposeFns) {
    let disposeFns = node.disposeFns;
    let disposeFnsCount = disposeFns.length;

    // loop over the clean ups 
    for (let i = 0; i < disposeFnsCount; i++) {
      disposeFns[i]();
    }

    if (!isDeletion) {
      node.disposeFns = [];
    }
  }
}

export function enqueueWindowInput(windowId, inputBuffer) {

  _setActiveWindowId(windowId);

  untrack(() => {
    try {
      ActiveWindow.processInput(inputBuffer);
    } catch (e) {
      console.error(e);
    }
  });

  _execWork();
  ExecWorkStartTimeout = null;

  _setActiveWindowId(null);
}

// let schedulerOutputBuffer = Buffer.alloc(2048 * 4);
export let schedulerOutputCommand = {
  windowId: -1,
  nodeIds: [],
  deletedNodeIds: []
};

let ExecWorkStartTimeout;

function _scheduleExecWork() {

  if (ExecWorkStartTimeout) {
    return;
  }

  ExecWorkStartTimeout = setTimeout(() => {
    _execWork();
    ExecWorkStartTimeout = null;
  }, 0);
}

function _execWork() {

  while (true) {
    if (schedulerInputWriter.activeWindowCount == 0) {
      break;
    }

    // schedulerOutputCommand will be filled with the work to be done
    scheduler_calculateWorkBatch();

    let availableSchedulerCommandCount = schedulerOutputCommand.nodeIds.length;
    let deletedNodeIdsCount = schedulerOutputCommand.deletedNodeIds.length;
    let batchWindowId = schedulerOutputCommand.windowId;

    if (availableSchedulerCommandCount > 0 || deletedNodeIdsCount > 0) {
      _setActiveWindowId(batchWindowId);

      for (let i = deletedNodeIdsCount - 1; i >= 0; i--) {
        let nodeId = schedulerOutputCommand.deletedNodeIds[i];

        _runEffectDisposers(nodeId, true);
        _deleteNode(nodeId);
      }

      for (let i = 0; i < availableSchedulerCommandCount; i++) {
        let nodeId = schedulerOutputCommand.nodeIds[i];

        _runEffectDisposers(nodeId, false);
        _runNode(nodeId);
      }

      // if the window input entry has new input writes in this tick, 
      // then continue the loop, skipping the window entry deletion below
      let windowInputEntry = schedulerInputWriter.windowEntryMap.get(batchWindowId);

      if (windowInputEntry.offset > 0) {
        continue;
      }
    }

    // free the window input entry for reuse

    // remove the active window entry index & push into the free window indices so it can be reused
    schedulerInputWriter.freeEntryIndices.push(schedulerInputWriter.activeWindowIndices.shift());

    // reduce the active window count
    schedulerInputWriter.activeWindowCount--;

    // remove the entry from the map
    schedulerInputWriter.windowEntryMap.delete(batchWindowId);
  }
}

////////////////////////////////////

export let schedulerInputWriter = {
  windowEntryMap: new Map(), // mapping from windowId to bufferIndex
  activeWindowIndices: [],
  activeWindowCount: 0,
  freeEntryIndices: [], // free buffer indices
  windowInputEntries: [],
};

// TODO: use buffer pool to allocate these on-demand
for (let i = 0; i < 128; i++) {
  schedulerInputWriter.windowInputEntries.push({
    buffer: Buffer.allocUnsafe(4096),
    offset: 0,
    windowId: -1
  });

  schedulerInputWriter.freeEntryIndices.push(i);
}

function _writeInputCommand(windowId, size) {
  let windowInputEntry = schedulerInputWriter.windowEntryMap.get(windowId);

  // acquire a new window input entry if needed
  if (!windowInputEntry) {
    // console.log("new window input entry for windowId", windowId);
    let windowEntryIndex = schedulerInputWriter.freeEntryIndices.pop();

    if (windowEntryIndex == null) {
      throw new Error("no free buffer");
    }

    windowInputEntry = schedulerInputWriter.windowInputEntries[windowEntryIndex];
    schedulerInputWriter.windowEntryMap.set(windowId, windowInputEntry);

    schedulerInputWriter.activeWindowCount++;
    schedulerInputWriter.activeWindowIndices.push(windowEntryIndex);

    windowInputEntry.windowId = windowId;
    windowInputEntry.offset = 0;
  }

  let { buffer, offset } = windowInputEntry;

  if (offset + size > buffer.length) {
    throw new Error(`short buffer overflow, size: ${size}, offset: ${offset}, buffer length: ${buffer.length}`);
  }

  let commandBuffer = buffer.subarray(offset, offset + size);

  windowInputEntry.offset += size;

  return commandBuffer;
}

function _registerDependency(windowId, activeNodeId, stateId) {

  let buf = _writeInputCommand(windowId, 9);
  buf.writeUInt8(1, 0);
  buf.writeUInt32LE(activeNodeId, 1);
  buf.writeUInt32LE(stateId, 5);
}

function _registerState(windowId, effectId, stateId) {

  let buf = _writeInputCommand(windowId, 9);
  buf.writeUInt8(2, 0);
  buf.writeUInt32LE(effectId, 1);
  buf.writeUInt32LE(stateId, 5);
}

function _registerEffect(windowId, parentNodeId, effectId) {

  let buf = _writeInputCommand(windowId, 9);
  buf.writeUInt8(3, 0);
  buf.writeUInt32LE(parentNodeId, 1);
  buf.writeUInt32LE(effectId, 5);

  _scheduleExecWork();
}

function _disposeEffect(windowId, parentNodeId, effectId) {
  let buf = _writeInputCommand(windowId, 9);
  buf.writeUInt8(4, 0);
  buf.writeUInt32LE(parentNodeId, 1)
  buf.writeUInt32LE(effectId, 5);
  _scheduleExecWork();
}

function _registerMemo(windowId, parentNodeId, memoId) {

  let buf = _writeInputCommand(windowId, 9);
  buf.writeUInt8(5, 0);
  buf.writeUInt32LE(parentNodeId, 1);
  buf.writeUInt32LE(memoId, 5);
}

function _postStateWrite(windowId, stateId) {

  let buf = _writeInputCommand(windowId, 5);
  buf.writeUInt8(6, 0);
  buf.writeUInt32LE(stateId, 1);

  _scheduleExecWork();
}

///////////////////////////

export function getActiveWindow() {
  return ActiveWindow;
}

export function getActiveNode() {
  return ActiveNode;
}

export function getActiveCell() {
  return ActiveNode;
}

export function runInScope(scope, fn) {
  let oldNode = ActiveNode;
  ActiveNode = scope.node;
  runInWindow(scope.windowId, fn);
  ActiveNode = oldNode;
}

export function getActiveScope() {
  return {
    windowId: ActiveWindow.id,
    node: ActiveNode,
  };
}

function registerDependency(stateId) {

  if (UntrackActive || !ActiveNode) {
    return;
  }

  _registerDependency(ActiveWindow.id, ActiveNode.id, stateId);
}

function identity(value, newValue) {
  return value === newValue;
}


const equals = identity; // Declaring a separate variable for the equals function


export function useState(initialValue, options = { equals }) {

  let id = ActiveWindow.lastReadableId += 2;
  let state = { id, value: initialValue };
  let ActiveWindowId = ActiveWindow.id;

  _registerState(ActiveWindowId, ActiveNode.id, id);

  function getState() {
    registerDependency(id);

    return state.value;
  }

  function setState(newValue) {

    if (newValue instanceof Function) {
      newValue = newValue(state.value);
    }

    let current = state.value;
    let shouldUpdate = false;

    if (!equals) {
      shouldUpdate = true;
    } else {
      shouldUpdate = !equals(current, newValue);
    }

    if (shouldUpdate) {
      state.value = newValue;

      _postStateWrite(ActiveWindowId, id);
    }
  }

  return [getState, setState];
}

function createEffect(windowId, id, fn, value) {

  let parentNodeId = ActiveNode ? ActiveNode.id : null;
  let context = ActiveNode ? ActiveNode.context : {};

  const effect = {
    id,
    value,
    fn,
    context,
    disposeFns: null
  };

  ActiveNodeMap.set(id, effect);

  _registerEffect(windowId, parentNodeId, id);
}


export function useEffect(fn, value) {
  let id = ActiveWindow.lastEffectId += 2;

  createEffect(ActiveWindow.id, id, fn, value);
}

export function useDisposableEffect(fn, value) {
  let id = ActiveWindow.lastEffectId += 2;

  let ActiveWindowId = ActiveWindow.id;
  let parentNodeId = ActiveNode ? ActiveNode.id : 0;

  createEffect(ActiveWindowId, id, fn, value);

  return () => _disposeEffect(ActiveWindowId, parentNodeId, id);
}

export function untrack(fn) {

  UntrackActive = true;
  let val = fn();
  UntrackActive = false;

  return val;
}

export function useMemo(fn, initialValue, options = { equals }) {
  let id = ActiveWindow.lastReadableId += 2;

  let memo = {
    id,
    value: initialValue,
    context: ActiveNode.context,
    fn,
    comparator: options.equals
  };

  ActiveNodeMap.set(id, memo);

  _registerMemo(ActiveWindow.id, ActiveNode.id, id);

  function readMemo() {
    registerDependency(id);

    return memo.value;
  }

  return readMemo;
}


export function onDispose(fn) {
  if (ActiveNode.disposeFns === null) {
    ActiveNode.disposeFns = [fn];
  } else {
    ActiveNode.disposeFns.push(fn);
  }
}

export const onCleanup = onDispose;

export function useCallback(fn) {

  let _activeWindowId = ActiveWindow.id;
  let _activeNode = ActiveNode;

  return (...args) => {
    let _prevNode = ActiveNode;
    let _prevWindowId = _activeWindowId;

    ActiveNode = _activeNode;
    _setActiveWindowId(_activeWindowId);

    let res = fn(...args);

    ActiveNode = _prevNode;
    _setActiveWindowId(_prevWindowId);

    return res;
  }
}

function castError(err) {
  if (err instanceof Error || typeof err === "string") return err;
  return new Error("Unknown error");
}

function handleError(err) {
  err = castError(err);

  console.error("error", err);

  // get the error handler in the current context
  let fn = ActiveNode.context[ErrorContext.id];

  fn(err);
}

let ErrorContext = createContext();

export function ErrorHandler(props) {
  return <ErrorContext.Provider value={props.onError}>
    {props.children}
  </ErrorContext.Provider>;
}

function createProvider(id, defaultValue) {

  return function Provider(props) {

    ActiveNode.context = {
      ...ActiveNode.context,

      //get [id]() {
      //  return props.value || defaultValue;
      //}

      [id]: untrack(() => props.value || defaultValue)
    };

    return props.children;
  };
}

export function createContext(
  defaultValue
) {
  const id = Symbol("context");
  return { id, Provider: createProvider(id, defaultValue) };
}

export function useContext(context) {
  return ActiveNode.context[context.id];
}

export function children(fn) {
  const children = useMemo(fn);
  const memo = useMemo(() => _resolveChildren(children()));

  return memo;
}

function _resolveChildren(children) {
  if (typeof children === "function" && !children.length) return _resolveChildren(children());
  if (Array.isArray(children)) {
    const results = [];
    for (let i = 0; i < children.length; i++) {
      const result = _resolveChildren(children[i]);
      Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
    }
    return results;
  }
  return children;
}
