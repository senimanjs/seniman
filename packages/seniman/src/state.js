// Acknowledgement:
// This state system is highly inspired by SolidJS's signal system -- some lines of code are directly ported from SolidJS. 
// Some public API function names are directly ported from ReactJS.
// 
// SolidJS Github:
// https://github.com/solidjs/solid
// ReactJS Github:
// https://github.com/facebook/react

import { registerDependency_internal, registerEffect, disposeEffect, registerMemo, registerState, postStateWrite } from "./scheduler.js";

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
}

export function deregisterWindow(windowId) {
  windowMap.delete(windowId);
  windowNodeMap.delete(windowId);
}

export function setActiveWindowId(id) {
  if (id) {
    ActiveWindow = windowMap.get(id);
    ActiveNodeMap = windowNodeMap.get(id);
  } else {
    ActiveWindow = null;
    ActiveNodeMap = null;
  }
}

export function runInput(inputBuffer) {
  ActiveWindow.processInput(inputBuffer);
}

export function runMemo(memoId) {

  try {
    let node = ActiveNodeMap.get(memoId);

    ActiveNode = node;

    let prevValue = node.value;
    node.value = node.fn(prevValue);

    // if memo, check if value has changed, if so, update observers
    if (node.value !== prevValue) {
      postStateWrite(ActiveWindow.id, memoId);
    }
  } catch (err) {
    handleError(err);
  } finally {
    ActiveNode = null;
  }
}

export function runEffect(effectId) {

  try {
    let node = ActiveNodeMap.get(effectId);

    ActiveNode = node;

    let prevValue = node.value;
    node.value = node.fn(prevValue);

  } catch (err) {
    handleError(err);
  } finally {
    ActiveNode = null;
  }
}

export function deleteNode(nodeId) {
  ActiveNodeMap.delete(nodeId);
}

export function runEffectDisposers(nodeId) {

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
  let oldWindow = ActiveWindow;

  ActiveNode = scope.node;
  ActiveWindow = scope.window;
  fn();
  ActiveNode = oldNode;
  ActiveWindow = oldWindow;
}

export function getActiveScope() {
  return {
    window: ActiveWindow,
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

  registerDependency_internal(ActiveWindow.id, ActiveNode.id, stateId);
}

export function useState(initialValue) {

  let id = createId();

  let state = {
    id,
    value: initialValue
  };

  registerState(ActiveWindow.id, ActiveNode.id, id);

  function getState() {
    registerDependency(id);

    return state.value;
  }

  let _nodeWindow = ActiveWindow;

  function setState(newValue) {

    if (newValue instanceof Function) {
      newValue = newValue(state.value);
    }

    let current = state.value;

    if (current !== newValue) {
      state.value = newValue;

      postStateWrite(_nodeWindow.id, id);
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

  if (!ActiveNodeMap) {
    windowNodeMap.get(windowId).set(id, effect);
  } else {
    ActiveNodeMap.set(id, effect);
  }

  registerEffect(windowId, parentNodeId, id);
}

export function useEffect(fn, value) {
  let id = createId();

  createEffect(ActiveWindow.id, id, fn, value);
}

export function useDisposableEffect(fn, value, windowId) {

  let id = createId();

  windowId = windowId || ActiveWindow.id;

  createEffect(windowId, id, fn, value);

  return () => untrack(() => disposeEffect(windowId, id));
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

  registerMemo(ActiveWindow.id, ActiveNode.id, id);

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
  const memo = useMemo(() => resolveChildren(children()));

  return memo;
}

function resolveChildren(children) {
  if (typeof children === "function" && !children.length) return resolveChildren(children());
  if (Array.isArray(children)) {
    const results = [];
    for (let i = 0; i < children.length; i++) {
      const result = resolveChildren(children[i]);
      Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
    }
    return results;
  }
  return children;
}
