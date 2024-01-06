// Acknowledgement:
// This state system is highly inspired by SolidJS's signal system -- some lines of code are directly ported from SolidJS. 
// Some public API function names are directly ported from ReactJS.
// 
// SolidJS Github:
// https://github.com/solidjs/solid
// ReactJS Github:
// https://github.com/facebook/react

import { scheduler_registerWindow, scheduler_calculateWorkBatch } from "./scheduler.js";

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

  schedulerInputCommand.commands.push({
    type: 7
  });
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


function _runNode(nodeId, isMemo) {
  try {
    let node = ActiveNodeMap.get(nodeId);

    ActiveNode = node;

    let prevValue = node.value;
    node.value = node.fn(prevValue);

    // if memo, check if value has changed, if so, update observers
    if (isMemo && node.value !== prevValue) {
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

function _runEffectDisposers(nodeId) {

  let node = ActiveNodeMap.get(nodeId);

  if (node.disposeFns) {
    let disposeFns = node.disposeFns;

    // loop over the clean ups 
    for (let i = 0; i < disposeFns.length; i++) {
      disposeFns[i]();
    }

    node.disposeFns = [];
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

  _setActiveWindowId(null);
}


// let schedulerInputBuffer = Buffer.alloc(8192);
export let schedulerInputCommand = {
  windowId: -1,
  commands: []
}

// let schedulerOutputBuffer = Buffer.alloc(2048 * 4);
export let schedulerOutputCommand = {
  windowId: -1,
  commands: []
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

  let loopCount = 0;

  while (true) {
    // schedulerOutputCommand will be filled with the work to be done
    let isWorkAvailable = scheduler_calculateWorkBatch();

    loopCount++;

    if (!isWorkAvailable) {
      break;
    }

    _setActiveWindowId(schedulerOutputCommand.windowId);

    schedulerInputCommand.windowId = schedulerOutputCommand.windowId;
    schedulerInputCommand.commands = [];

    let schedulerCommandCount = schedulerOutputCommand.commands.length;

    for (let i = 0; i < schedulerCommandCount; i++) {
      let [type, nodeId, deletedNodeIds] = schedulerOutputCommand.commands[i];

      if (deletedNodeIds) {
        // run loop in reverse
        for (let j = deletedNodeIds.length - 1; j >= 0; j--) {
          let nodeId = deletedNodeIds[j];
          _runEffectDisposers(nodeId);
          _deleteNode(nodeId);
        }
      }

      _runEffectDisposers(nodeId);

      _runNode(nodeId, type === 2);
    }
  }
}

////////////////////////////////////

function _initializeSchedulerInput(windowId) {
  if (schedulerInputCommand.windowId == -1) {
    schedulerInputCommand.windowId = windowId;
  } else if (windowId != schedulerInputCommand.windowId) {
    throw new Error("windowId mismatch");
  }
}

function _registerDependency(windowId, activeNodeId, stateId) {

  if (windowId != schedulerInputCommand.windowId) {
    throw new Error("windowId mismatch");
  }

  schedulerInputCommand.commands.push({
    type: 1,
    activeNodeId,
    stateId
  });
}

function _registerState(windowId, effectId, stateId) {

  if (windowId != schedulerInputCommand.windowId) {
    throw new Error("windowId mismatch");
  }

  schedulerInputCommand.commands.push({
    type: 2,
    effectId,
    stateId
  });
}

function _registerEffect(windowId, parentNodeId, effectId) {
  _initializeSchedulerInput(windowId);

  schedulerInputCommand.commands.push({
    type: 3,
    parentNodeId,
    effectId
  });

  _scheduleExecWork();
}

function _disposeEffect(windowId, effectId) {
  _initializeSchedulerInput(windowId);

  schedulerInputCommand.commands.push({
    type: 4,
    windowId,
    effectId
  });

  _scheduleExecWork();
}

function _registerMemo(windowId, parentNodeId, memoId) {
  _initializeSchedulerInput(windowId);

  schedulerInputCommand.commands.push({
    type: 5,
    parentNodeId,
    memoId
  });
}

function _postStateWrite(windowId, stateId) {
  _initializeSchedulerInput(windowId);

  schedulerInputCommand.commands.push({
    type: 6,
    stateId
  });

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

// createId() returns a unique id for a node
// this is used to identify nodes in the dependency graph
// and to identify nodes in the work queue
let _id = 1;

function createId() {
  return _id++;
}

function registerDependency(stateId) {

  if (UntrackActive || !ActiveNode) {
    return;
  }

  _registerDependency(ActiveWindow.id, ActiveNode.id, stateId);
}

export function useState(initialValue) {

  let id = createId();
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

    if (current !== newValue) {
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
  let id = createId();

  createEffect(ActiveWindow.id, id, fn, value);
}

export function useDisposableEffect(fn, value) {
  let id = createId();

  let ActiveWindowId = ActiveWindow.id;

  createEffect(ActiveWindowId, id, fn, value);

  return () => _disposeEffect(ActiveWindowId, id);
}

export function untrack(fn) {

  UntrackActive = true;
  let val = fn();
  UntrackActive = false;

  return val;
}

export function useMemo(fn) {

  let id = createId();

  let memo = {
    id,
    value: null,
    context: ActiveNode.context,
    fn
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

  let _activeWindow = ActiveWindow;
  let _activeNode = ActiveNode;

  return (...args) => {
    let _prevNode = ActiveNode;
    let _prevWindow = ActiveWindow;

    ActiveNode = _activeNode;
    ActiveWindow = _activeWindow;

    let res = fn(...args);

    ActiveNode = _prevNode;
    ActiveWindow = _prevWindow;

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
