let ActiveNode = null;
let ActiveWindow = null;
let UntrackActive = false;

export function getActiveWindow() {
  return ActiveWindow;
}

export function getActiveNode() {
  return ActiveNode;
}

export function setActiveWindow(window) {
  ActiveWindow = window;
}

export function setActiveNode(node) {
  ActiveNode = node;
}

export function runInNode(node, fn) {
  let oldNode = ActiveNode;
  ActiveNode = node;
  fn();
  ActiveNode = oldNode;
}

export function useState(initialValue) {

  let state = {
    value: initialValue,
    observerSet: new Set()
  };

  function getState() {
    registerDependency(state);

    return state.value;
  }

  let _activeWindow = ActiveWindow;

  function setState(newValue) {
    if (newValue instanceof Function) {
      newValue = newValue(state.value);
    }

    writeState(_activeWindow, state, newValue);
  }

  return [getState, setState];
}

const NODE_FRESH = 0;
const NODE_QUEUED = 1;
const NODE_DESTROYED = 2;

function _refreshNode(window, node) {

  if (node.updateState === NODE_QUEUED) {
    console.log('node already queued');
    return;
  }

  if (node.updateState === NODE_DESTROYED) {
    console.log('node already destroyed');
    //throw new Error('node already destroyed');
    return;
  }

  if (node.updateState === NODE_FRESH) {
    node.updateState = NODE_QUEUED;
    window.submitWork(node);

    _removeNodeFromSources(node);
    // destroy the node's entire subtree
    _removeNodeSubtree(node);
  }
}

function _removeNodeFromSources(node) {

  while (node.sourceSet.size) {
    let sourceList = Array.from(node.sourceSet);

    sourceList.forEach(source => {
      node.sourceSet.delete(source);
      source.observerSet.delete(node);
    });
  }
}

function _removeNodeSubtree(node) {

  if (node.children) {
    node.children.forEach(child => {

      _removeNodeFromSources(child);

      if (child.cleanups) {
        child.cleanups.forEach(cleanup => {
          cleanup();
        });

        child.cleanups = [];
      }

      // NOTE: maybe we don't need to do this
      child.updateState = NODE_DESTROYED;

      _removeNodeSubtree(child);
    });
  }
}

function writeState(window, state, newValue) {

  let current = state.value;

  if (current !== newValue) {
    state.value = newValue;

    state.observerSet.forEach(observer => {
      _refreshNode(window, observer);
    });
  }
}

function registerDependency(state) {

  if (UntrackActive) {
    return;
  }

  //console.log('registering dep', ActiveNode.id);
  let newObserver = ActiveNode;

  state.observerSet.add(newObserver);
  newObserver.sourceSet.add(state);

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

  const c = {
    type: EFFECT,
    value: value,
    fn,

    updateState: NODE_FRESH,
    updatedAt: null,

    parent: ActiveNode,
    children: [],

    sourceSet: new Set(),

    cleanups: null,
    context: null
  };


  if (ActiveNode) {
    ActiveNode.children.push(c);
  }

  return c;
}

export function useDisposableEffect(fn, value, window) {
  let effect = createEffect(fn, value);

  (window || ActiveWindow).submitWork(effect);

  return () => untrack(() => {
    _removeNodeFromSources(effect);
    // destroy the node's entire subtree
    _removeNodeSubtree(effect);
  });
}


export function untrack(fn) {

  UntrackActive = true;
  let val = fn();
  UntrackActive = false;

  return val;
}

/*

let [a, setA] = useState(0);

let memoA = useMemo(() => {

  return 1 + a();

});

let memoB = useMemo(() => {

  return memoA() + 1;

});

*/

export function useEffect(fn, value) {
  let effect = createEffect(fn, value);

  ActiveWindow.submitWork(effect);
}

const MEMO = 5;
const EFFECT = 6;

export function useMemo(fn) {

  let memo = {
    type: MEMO,
    value: null,
    fn,
    //window: ActiveNode.window,

    parent: ActiveNode,

    updateState: NODE_FRESH,
    updatedAt: null,

    sourceSet: new Set(),
    observerSet: new Set()

    /*

    sources: [],
    sourceObserverSlots: [],

    observers: [],
    observerSlots: []
    */
  };

  ActiveWindow.submitWork(memo);

  function readMemo() {
    registerDependency(memo);

    return memo.value;
  }

  return readMemo;
}

export function onCleanup(fn) {
  if (ActiveNode === null) {
    throw new Error();
  } else if (ActiveNode.cleanups === null) {
    ActiveNode.cleanups = [fn];
  } else {
    ActiveNode.cleanups.push(fn);
  }
}

export function useCallback(fn) {

  let _activeNode = ActiveNode;
  return () => {
    ActiveNode = _activeNode;
    return fn(...arguments);
  }
}

export function executeNode(window, node) {
  try {
    setActiveNode(node);

    if (node.updateState == NODE_DESTROYED) {
      console.log('Destroyed node in executeNode');
      return;
    }

    if (node.type === MEMO) {

      let prevValue = node.value;
      node.value = node.fn(prevValue);

      if (node.value !== prevValue) {
        node.observerSet.forEach(observer => {
          _refreshNode(window, observer);
        });
      }

      node.updateState = NODE_FRESH;

    } else {
      //cleanNode(node);

      let nextValue = node.fn(node.value);
      node.value = nextValue;
      node.updateState = NODE_FRESH;
    }
  } catch (e) {
    console.error(e);
  } finally {
    ActiveNode = null;
  }
}



/*
console.log('node.sources', node.sources.map(s => s.id), node.sourceObserverSlots);

// each loop, take out the last source and its slot
const sourceToDelete = node.sources.pop(),
  deletedSourceIndex = node.sourceObserverSlots.pop(),
  // prep the observers list
  sourceToDeleteObservers = sourceToDelete.observers;

console.log('deleting', sourceToDelete.id)
console.log('sourceToDeleteObservers BEFORE', sourceToDeleteObservers.map(o => o.id));

// if there are observers, we need to remove the node from the observers list
// NOTE: but why do we need to check if there are observers? 
// unless there are bugs in the code, there should always be at least one observer (the node itself)
if (sourceToDeleteObservers && sourceToDeleteObservers.length) {

  // pop the last observer and its slot
  const poppedObserver = sourceToDeleteObservers.pop(),
    poppedObserverSlot = sourceToDelete.observerSlots.pop();

  // if the node we're removing is not the last one in the list,
  if (deletedSourceIndex < sourceToDeleteObservers.length) {

    // we need to swap the observer we just removed with the actual entry we want to remove

    sourceToDelete.observerSlots[deletedSourceIndex] = poppedObserverSlot;
    sourceToDeleteObservers[deletedSourceIndex] = poppedObserver;

    console.log('deletedSourceIndex', deletedSourceIndex);
    // need to update the slot of the observer we just swapped
    poppedObserver.sourceObserverSlots[poppedObserverSlot] = deletedSourceIndex;
  }
}
console.log('sourceToDeleteObservers AFTER', sourceToDeleteObservers.map(o => o.id));
*/

/*
function cleanNode(node) {

  //console.log('cleaning up node ', node.id)
  // remove the node from its sources
  if (node.sourceSet.size) {

    //console.log('sources', node.sourceSet.size);
    // for every node's source, we need to remove the node from the source's observers list 
    // (source can be either memo or signal)
    while (node.sourceSet.size) {

      let sourceList = Array.from(node.sourceSet);

      sourceList.forEach(source => {
        node.sourceSet.delete(source);
        source.observerSet.delete(node);
      });

    }
  }

  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      cleanNode(node.children[i]);
    }
    node.children = [];
  }

  if (node.cleanups) {
    for (let i = 0; i < node.cleanups.length; i++) {
      node.cleanups[i]();
    }

    node.cleanups = [];
  }

  node.updateState = FRESH;
}

*/

function lookup(owner, key) {
  return owner
    ? owner.context && owner.context[key] !== undefined
      ? owner.context[key]
      : lookup(owner.parent, key)
    : undefined;
}

function createProvider(id, options) {

  return function Provider(props) {

    return () => {
      untrack(() => {
        ActiveNode.context = { [id]: props.value };
      });

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

console.log('STATEV2');