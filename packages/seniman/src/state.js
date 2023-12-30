// Acknowledgement:
// This state system is highly inspired by SolidJS's signal system -- some lines of code are directly ported from SolidJS. 
// Some public API function names are directly ported from ReactJS.
// 
// SolidJS Github:
// https://github.com/solidjs/solid
// ReactJS Github:
// https://github.com/facebook/react

let ActiveNode = null;
let ActiveWindow = null;
let UntrackActive = false;

let ERROR = null;

const EXEC_PROMISE = 3;
const MEMO = 5;
const EFFECT = 6;

export class WorkQueue {

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

class ExternalPromise {
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }

  then(resolve, reject) {
    return this.promise.then(resolve, reject)
  }

  catch(reject) {
    return this.promise.catch(reject)
  }
}

export function processInputQueue(window) {

  setActiveWindow(window);

  const inputQueue = window.inputMessageQueue;

  while (inputQueue.length) {
    let inputBuffer = inputQueue.shift();

    untrack(() => {
      try {
        window.processInput(inputBuffer);
      } catch (e) {
        console.error(e);
      }
    });
  }

  // for now, always assume we're done with input, and set this.hasPendingInput to false
  window.hasPendingInput = false;

  setActiveWindow(null);
}

export function processWorkQueue(window) {
  ActiveWindow = window;

  const workQueue = window.workQueue;

  let i = 0;

  while (!workQueue.isEmpty()) {
    let node = workQueue.poll();

    if (node.type == EXEC_PROMISE) {
      node.resolver();
    } else {
      executeNode(window, node);
    }

    i++;
  }

  // for now, always assume we're done with work, and set this.hasPendingWork to false
  // later, we'll need to check if there's still work to do since we'll only be allowed to do a certain amount of work per frame
  window.hasPendingWork = false;

  window.flushCommandBuffer();

  ActiveWindow = null;
}

function submitWork(window, node) {
  window.workQueue.add(node);

  if (!window.hasPendingWork) {
    window.hasPendingWork = true;
    requestExecution(window);
  }
}

let loopAwaiting = true;
let loopWaitPromise = new ExternalPromise();

let pendingWorkWindowList = [];
let pendingInputWindowList = [];

function requestExecution(window) {

  pendingWorkWindowList.push(window);

  if (loopAwaiting) {
    loopAwaiting = false;
    loopWaitPromise.resolve();
  }
}

// TODO: refactor this loop to not use promise and instead have this fired by the server upon input or upon work submission
async function _runLoop() {

  await loopWaitPromise;

  while (true) {
    // prioritize windows that need input, and allocate (maybe a small) amount of work to them right away
    // so the user at least can see some updates quickly
    let allocWindow = _getNextWindowPendingInputAllocation();

    if (allocWindow) {
      processInputQueue(allocWindow);

      // TODO: pass amount of allowed work to do in this window
      processWorkQueue(allocWindow);

      continue;
    }

    // if there is no window that needs input processing, run the regular work scheduling
    allocWindow = _getNextWindowPendingWorkAllocation();

    if (allocWindow) {
      // TODO: pass amount of allowed work to do in this window
      processWorkQueue(allocWindow);
      continue;
    }

    loopAwaiting = true;
    loopWaitPromise = new ExternalPromise();
    await loopWaitPromise;
  }
}

_runLoop();

function _getNextWindowPendingInputAllocation() {

  if (pendingInputWindowList.length === 0) {
    return null;
  }

  return pendingInputWindowList.shift();
}

function _getNextWindowPendingWorkAllocation() {

  let nextWindow = pendingWorkWindowList.shift();

  if (!nextWindow) {
    return null;
  }

  return nextWindow;
}

export function notifyWindowPendingInput(window) {

  if (!window.hasPendingInput) {
    pendingInputWindowList.push(window);
    window.hasPendingInput = true;
  }

  if (loopAwaiting) {
    loopAwaiting = false;
    loopWaitPromise.resolve();
  }
}

///////////////////////////

export function getActiveWindow() {
  return ActiveWindow;
}

function setActiveWindow(window) {
  ActiveWindow = window;
}

function executeNode(window, node) {
  try {
    ActiveNode = node;

    if (node.updateState == NODE_DESTROYED) {
      ActiveNode = null;
      return;
    }

    cleanNode(node);
    let prevValue = node.value;
    node.value = node.fn(prevValue);

    if (node.value !== prevValue && node.type == MEMO) {
      let obs = node.observers;
      let length = obs.length;

      for (let i = 0; i < length; i++) {
        _queueNodeForUpdate(window, obs[i]);
      }
    }
  } catch (e) {
    console.error(e);
    handleError(e);
  } finally {
    ActiveNode = null;
  }
}

export function getActiveNode() {
  return ActiveNode;
}

export function getActiveCell() {
  return ActiveNode;
}

export function runInNode(node, fn) {
  let oldNode = ActiveNode;
  let oldWindow = ActiveWindow;

  ActiveNode = node;
  ActiveWindow = node.window;
  fn();
  ActiveNode = oldNode;
  ActiveWindow = oldWindow;
}


export function runInCell(cell, fn) {
  runInNode(cell, fn);
}
/*

The wrapPromise makes sure that the activeNode that was active before the promise resolves is the same after the promise resolves.

let a = await wrapPromise(fetch(...));

*/
export function wrapPromise(promise) {
  let node = ActiveNode;
  let window = ActiveWindow;

  return promise.then(
    value => {
      return schedulePromiseResolve(window)
        .then(() => {
          // TODO: see if setting this here is "sync" enough
          // or if there could be executions in between this
          // and post-await code that could change the active node
          // small-scale tests seem to indicate that this is fine
          // but strong feeling there will be edge cases
          ActiveNode = node;
          ActiveWindow = window;
          return value;
        });
    },
    error => {
      return schedulePromiseResolve(window)
        .then(() => {
          ActiveNode = node;
          ActiveWindow = window;
          return error;
        });
    }
  );
}

function schedulePromiseResolve(window) {
  return new Promise(resolve => {
    let promiseEntry = {
      type: EXEC_PROMISE,
      resolver: resolve
    };

    submitWork(window, promiseEntry);
  });
}

// createId() returns a unique id for a node
// this is used to identify nodes in the dependency graph
// and to identify nodes in the work queue
let _id = 0;

function createId() {
  return _id++;
}

export function useState(initialValue) {

  let state = {
    id: createId(),
    value: initialValue,

    observers: [],
    observerSlots: []
  };

  function getState() {
    registerDependency(state);

    return state.value;
  }

  let _nodeWindow = ActiveWindow;

  function setState(newValue) {

    if (newValue instanceof Function) {
      newValue = newValue(state.value);
    }

    writeState(_nodeWindow, state, newValue);
  }

  return [getState, setState];
}

function writeState(window, state, newValue) {

  let current = state.value;

  if (current !== newValue) {
    state.value = newValue;

    let observers = state.observers;
    let length = observers.length;

    for (let i = 0; i < length; i++) {
      _queueNodeForUpdate(window, observers[i]);
    }
  }
}

const NODE_FRESH = 0;
const NODE_QUEUED = 2;
const NODE_DESTROYED = 3;

function _queueNodeForUpdate(window, node) {

  if (node.updateState === NODE_FRESH) {
    node.updateState = NODE_QUEUED;
    submitWork(window, node);
  }
}

function cleanNode(node) {
  _removeNodeFromSources(node);
  _runDisposeFns(node);

  _removeNodeSubtree(node);

  node.updateState = NODE_FRESH;
}

function _removeNodeFromSources(node) {

  if (node.sources) {
    while (node.sources.length) {
      const source = node.sources.pop(),
        index = node.sourceSlots.pop(),
        obs = source.observers;

      // TODO: we don't need to check for observers list existence?
      if (obs && obs.length) {
        const n = obs.pop(),
          s = source.observerSlots.pop();
        if (index < obs.length) {
          n.sourceSlots[s] = index;
          obs[index] = n;
          source.observerSlots[index] = s;
        }
      }
    }
  }
}

function _runDisposeFns(node) {

  if (node.cleanups && node.cleanups.length) {
    // loop over the clean ups 
    for (let i = 0; i < node.cleanups.length; i++) {
      node.cleanups[i]();
    }

    node.cleanups = [];
  }
}

function _removeNodeSubtree(node) {

  if (node.children) {
    let childrenCount = node.children.length;

    for (let i = 0; i < childrenCount; i++) {
      let child = node.children[i];
      _removeNodeFromSources(child);
      _runDisposeFns(child);

      child.updateState = NODE_DESTROYED;

      _removeNodeSubtree(child);
    }

    node.children = [];
  }
}


function registerDependency(state) {

  if (UntrackActive || !ActiveNode) {
    return;
  }

  let sSlot = state.observers ? state.observers.length : 0;

  ActiveNode.sources.push(state);
  ActiveNode.sourceSlots.push(sSlot);

  state.observers.push(ActiveNode);
  state.observerSlots.push(ActiveNode.sources.length - 1);

  /*

  state.observerSet.push(newObserver);

  console.log('state new observer', state.observers.map(o => o.id));
  // for performance, we want to keep track where the state is in the effect's sources array
  // just set it to effect.sources.length - 1 since we just pushed it
  state.observerSlots.push(newObserver.sources.length - 1);

  newObserver.sources.push(state);
  // for performance, we want to keep track where effect is in the state's observers array
  newObserver.sourceObserverSlots.push(state.observers.length - 1);

  console.log('newObserver.sourceObserverSlots', newObserver.sourceObserverSlots);
  */
}

function createEffect(fn, value) {

  const effect = {
    id: createId(),
    type: EFFECT,
    value: value,
    fn,
    depth: !ActiveNode ? 0 : ActiveNode.depth + 1,
    window: ActiveWindow,

    updateState: NODE_FRESH,
    updatedAt: null,

    parent: ActiveNode,
    children: [],

    sources: [],
    sourceSlots: [],

    cleanups: null,
    context: null
  };

  if (ActiveNode) {
    ActiveNode.children.push(effect);
  }

  return effect;
}

export function useDisposableEffect(fn, value, window) {
  let effect = createEffect(fn, value);

  submitWork(window || ActiveWindow, effect);

  return () => untrack(() => cleanNode(effect));
}

export function untrack(fn) {

  UntrackActive = true;
  let val = fn();
  UntrackActive = false;

  return val;
}

export function useEffect(fn, value) {
  let effect = createEffect(fn, value);

  submitWork(ActiveWindow, effect);
}


export function useMemo(fn) {

  let memo = {
    id: createId(),
    type: MEMO,
    value: null,
    fn,
    depth: !ActiveNode ? 0 : ActiveNode.depth + 1,
    window: ActiveNode.window,

    parent: ActiveNode,

    updateState: NODE_FRESH,
    updatedAt: null,

    sources: [],
    sourceSlots: [],

    observers: [],
    observerSlots: []
  };

  if (ActiveNode) {
    ActiveNode.children.push(memo);
  }

  submitWork(ActiveWindow, memo);

  function readMemo() {
    registerDependency(memo);

    return memo.value;
  }

  return readMemo;
}

export function onCleanup(fn) {
  onDispose(fn);
}

export function onDispose(fn) {
  if (ActiveNode === null) {
    throw new Error();
  } else if (ActiveNode.cleanups === null) {
    ActiveNode.cleanups = [fn];
  } else {
    ActiveNode.cleanups.push(fn);
  }
}

export function useCallback(fn) {

  let _activeWindow = ActiveWindow;
  let _activeNode = ActiveNode;
  return (...args) => {
    ActiveNode = _activeNode;
    ActiveWindow = _activeWindow;
    return fn(...args);
  }
}

export function onError(fn) {
  ERROR || (ERROR = Symbol("error"));
  if (ActiveNode === null) {
    return;
  }

  else if (ActiveNode.context === null) ActiveNode.context = { [ERROR]: [fn] };
  else if (!ActiveNode.context[ERROR]) ActiveNode.context[ERROR] = [fn];
  else ActiveNode.context[ERROR].push(fn);
}

function castError(err) {
  if (err instanceof Error || typeof err === "string") return err;
  return new Error("Unknown error");
}

function handleError(err) {
  err = castError(err);

  const fns = ERROR && lookup(ActiveNode, ERROR);
  if (!fns) { throw err }
  for (const f of fns) f(err);
}

function lookup(node, key) {
  return node
    ? node.context && node.context[key] !== undefined
      ? node.context[key]
      : lookup(node.parent, key)
    : undefined;
}

function createProvider(id, options) {

  return function Provider(props) {

    return () => {
      //untrack(() => {
      ActiveNode.context = { [id]: props.value };
      //});

      return props.children;
    };
  };
}

export function createContext(
  defaultValue,
  options
) {
  const id = Symbol("context");
  return { id, Provider: createProvider(id, options), defaultValue };
}

export function useContext(context) {
  let ctx;
  return (ctx = lookup(ActiveNode, context.id)) !== undefined ? ctx : context.defaultValue;
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