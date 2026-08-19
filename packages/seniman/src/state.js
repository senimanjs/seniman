// Acknowledgement:
// This state system is highly inspired by SolidJS's signal system -- some lines of code are directly ported from SolidJS. 
// Some public API function names are directly ported from ReactJS.
// 
// SolidJS Github:
// https://github.com/solidjs/solid
// ReactJS Github:
// https://github.com/facebook/react

import {
  scheduler_registerWindow,
  scheduler_deregisterWindow,
  scheduler_ingest,
  scheduler_drainWork,
  SCHEDULER_OUTPUT_RUN_NODES,
  SCHEDULER_OUTPUT_DELETE_NODES,
  schedulerOutputCommand
} from "./scheduler.js";

export { schedulerOutputCommand };

let ActiveNode = null;
let ActiveWindow = null;
let ActiveNodeMap = null;
let UntrackActive = false;

const windowMap = new Map();
const windowNodeMap = new Map();
const schedulerWindowMap = new Map();

export function getWindow(windowId) {
  return windowMap.get(windowId);
}

export function registerWindow(window) {
  windowMap.set(window.id, window);
  windowNodeMap.set(window.id, new Map());

  let schedulerHandle = scheduler_registerWindow(window.id);
  window.schedulerSlot = schedulerHandle.slot;
  window.schedulerGeneration = schedulerHandle.generation;
  schedulerWindowMap.set(schedulerHandle.slot, window);
}

export function deregisterWindow(window) {
  windowMap.delete(window.id);
  windowNodeMap.delete(window.id);

  if (schedulerWindowMap.get(window.schedulerSlot) === window) {
    schedulerWindowMap.delete(window.schedulerSlot);
  }

  scheduler_deregisterWindow(
    window.schedulerSlot,
    window.schedulerGeneration
  );
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
  let window = windowMap.get(windowId);

  if (!window || window.destroyed) {
    return;
  }

  _setActiveWindowId(windowId);

  untrack(() => {
    try {
      ActiveWindow.processInput(inputBuffer);
    } catch (e) {
      console.error(e);
    }
  });

  if (ExecWorkStartTimeout) {
    clearTimeout(ExecWorkStartTimeout);
    ExecWorkStartTimeout = null;
  }
  _execWork();

  _setActiveWindowId(null);
}

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
  _flushSchedulerInput();

  while (true) {
    let outputLength = scheduler_drainWork(schedulerOutputBuffer);

    if (outputLength === 0) {
      break;
    }

    _executeSchedulerOutput(outputLength);
    _flushSchedulerInput();
  }

  _setActiveWindowId(null);
}

////////////////////////////////////

export const SCHEDULER_OUTPUT_PAGE_SIZE = 64 * 1024;
export const SCHEDULER_INPUT_PAGE_SIZE = 64 * 1024;
const SCHEDULER_INPUT_FRAME_HEADER_SIZE = 12;
const SCHEDULER_OUTPUT_RECORD_HEADER_SIZE = 16;

export const schedulerOutputBuffer = Buffer.allocUnsafe(
  SCHEDULER_OUTPUT_PAGE_SIZE
);

export let schedulerInputWriter = {
  buffer: Buffer.allocUnsafe(SCHEDULER_INPUT_PAGE_SIZE),
  offset: 0,
  frameStart: -1,
  frameSlot: 0,
  frameGeneration: 0
};

// Output records are [type, slot, generation, node count, node IDs].
function _executeSchedulerOutput(length) {
  let readOffset = 0;

  while (readOffset < length) {
    if (length - readOffset < SCHEDULER_OUTPUT_RECORD_HEADER_SIZE) {
      throw new Error('Invalid scheduler output record');
    }

    let type = schedulerOutputBuffer.readUInt8(readOffset);
    let slot = schedulerOutputBuffer.readUInt32LE(readOffset + 4);
    let generation = schedulerOutputBuffer.readUInt32LE(readOffset + 8);
    let nodeCount = schedulerOutputBuffer.readUInt32LE(readOffset + 12);
    let recordEnd = readOffset +
      SCHEDULER_OUTPUT_RECORD_HEADER_SIZE +
      nodeCount * 4;

    if (recordEnd > length) {
      throw new Error('Invalid scheduler output record length');
    }

    readOffset += SCHEDULER_OUTPUT_RECORD_HEADER_SIZE;

    let window = schedulerWindowMap.get(slot);
    let isCurrentWindow = window &&
      window.schedulerGeneration === generation;

    if (isCurrentWindow) {
      _setActiveWindowId(window.id);
    }

    for (let i = 0; i < nodeCount; i++) {
      let nodeId = schedulerOutputBuffer.readUInt32LE(readOffset);
      readOffset += 4;

      if (!isCurrentWindow) {
        continue;
      }

      if (type === SCHEDULER_OUTPUT_DELETE_NODES) {
        _runEffectDisposers(nodeId, true);
        _deleteNode(nodeId);
      } else if (type === SCHEDULER_OUTPUT_RUN_NODES) {
        if (!window.destroyed) {
          _runEffectDisposers(nodeId, false);
          _runNode(nodeId);
        }
      } else {
        throw new Error(`Invalid scheduler output type: ${type}`);
      }
    }

    if (readOffset !== recordEnd) {
      throw new Error('Invalid scheduler output node count');
    }
  }
}

function _closeSchedulerInputFrame() {
  let frameStart = schedulerInputWriter.frameStart;

  if (frameStart < 0) {
    return;
  }

  let commandByteLength = schedulerInputWriter.offset -
    frameStart -
    SCHEDULER_INPUT_FRAME_HEADER_SIZE;

  schedulerInputWriter.buffer.writeUInt32LE(
    commandByteLength,
    frameStart + 8
  );
  schedulerInputWriter.frameStart = -1;
  schedulerInputWriter.frameSlot = 0;
  schedulerInputWriter.frameGeneration = 0;
}

function _flushSchedulerInput() {
  _closeSchedulerInputFrame();

  if (schedulerInputWriter.offset > 0) {
    scheduler_ingest(
      schedulerInputWriter.buffer,
      schedulerInputWriter.offset
    );
    schedulerInputWriter.offset = 0;
  }
}

function _startSchedulerInputFrame(slot, generation) {
  let frameStart = schedulerInputWriter.offset;
  let buffer = schedulerInputWriter.buffer;

  buffer.writeUInt32LE(slot, frameStart);
  buffer.writeUInt32LE(generation, frameStart + 4);
  buffer.writeUInt32LE(0, frameStart + 8);

  schedulerInputWriter.frameStart = frameStart;
  schedulerInputWriter.frameSlot = slot;
  schedulerInputWriter.frameGeneration = generation;
  schedulerInputWriter.offset += SCHEDULER_INPUT_FRAME_HEADER_SIZE;
}

// Input frames are [slot, generation, command byte length, commands].
function _writeInputCommand(windowId, size) {
  if (size > SCHEDULER_INPUT_PAGE_SIZE - SCHEDULER_INPUT_FRAME_HEADER_SIZE) {
    throw new Error('Scheduler input command exceeds the input page size');
  }

  let window = windowMap.get(windowId);

  if (!window) {
    throw new Error('Cannot write scheduler input for a deregistered window');
  }

  let slot = window.schedulerSlot;
  let generation = window.schedulerGeneration;
  let writer = schedulerInputWriter;
  let isCurrentFrame = writer.frameStart >= 0 &&
    writer.frameSlot === slot &&
    writer.frameGeneration === generation;

  if (!isCurrentFrame) {
    _closeSchedulerInputFrame();

    if (
      writer.offset + SCHEDULER_INPUT_FRAME_HEADER_SIZE + size >
      SCHEDULER_INPUT_PAGE_SIZE
    ) {
      _flushSchedulerInput();
    }

    _startSchedulerInputFrame(slot, generation);
  } else if (writer.offset + size > SCHEDULER_INPUT_PAGE_SIZE) {
    _flushSchedulerInput();
    _startSchedulerInputFrame(slot, generation);
  }

  let offset = writer.offset;
  let commandBuffer = writer.buffer.subarray(offset, offset + size);
  writer.offset += size;

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
  let window = windowMap.get(windowId);

  if (!window || window.destroyed) {
    return;
  }

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
    let window = windowMap.get(ActiveWindowId);

    if (!window || window.destroyed) {
      return;
    }

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
    let window = windowMap.get(_activeWindowId);

    if (!window || window.destroyed) {
      return;
    }

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
