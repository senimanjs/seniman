let ActiveNode = null;
let ActiveWindow = null;

export function getActiveWindow() {
  return ActiveWindow;
}

const FRESH = 0;
const STALE = 1;
const PENDING = 2;

export function useState(initialValue, window) {

  let state = {
    value: initialValue,
    window: ActiveWindow,

    //observers: [],
    //observerSlots: []

    observerSet: new Set()
  };

  //let activeNode = ActiveNode;

  //let activeWorker = ActiveWorker;

  function getState() {

    registerDependency(state);

    return state.value;
  }

  function setState(newValue) {

    /*
    activeWorker.submitWork(() => {
      if (typeof value === 'function') {
        state.value = newValue(state.value);
      } else {
        state.value = newValue;
      }
    });
    */

    if (newValue instanceof Function) {
      newValue = newValue(state.value);
    }

    // writeSignal(signalState, newValue);

    writeState(state, newValue);
  }

  return [getState, setState];
}

function writeState(state, newValue) {

  let current = state.value;

  if (current !== newValue) {
    state.value = newValue;

    let window = state.window;
    console.log('updating state observers', state.observerSet.size)


    state.observerSet.forEach(observer => {
      //console.log('observer', observer.id);

      // if the observer is already pending, we don't need to do anything
      if (observer.updateState === PENDING) {

        console.log('already pending observer');
        return;
      }

      // if the observer is fresh, we need to mark it as stale
      if (observer.updateState === FRESH) {
        observer.updateState = STALE;
      }

      // if the observer is stale, we need to mark it as pending
      if (observer.updateState === STALE) {
        observer.updateState = PENDING;
        window.submitWork(observer);
      }
    });

    /*
  // for every observer, we need to submit work to the state's window
  for (let i = 0; i < state.observers.length; i++) {
    let observer = state.observers[i];



  }
  */


    console.log('======================================');
  }
}

function registerDependency(state) {

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

// createId function that creates an id of integer between 100 and 1000
function createId() {
  return Math.floor(Math.random() * 1000) + 100;
}

function createEffect(fn, value, window) {

  const c = {

    id: createId(),
    type: EFFECT,
    value: value,
    fn,
    window: window,

    updateState: FRESH,
    updatedAt: null,

    parent: ActiveNode,
    children: [],
    //observers: [],

    //sources: [],
    //sourceObserverSlots: [],

    sourceSet: new Set(),

    cleanups: [],

    context: null
  };


  if (ActiveNode) {
    ActiveNode.children.push(c);
  }

  return c;
}

export function useDisposableEffect(fn, value, window) {
  let effect = createEffect(fn, value, window);

  (window || ActiveNode.window).submitWork(effect);

  return () => untrack(() => cleanNode(effect));
}


export function untrack(fn) {
  return fn();
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
  let effect = createEffect(fn, value, ActiveNode.window);

  ActiveNode.window.submitWork(effect);
}

const MEMO = 5;
const EFFECT = 6;

export function useMemo(fn) {

  let memo = {
    id: createId(),
    type: MEMO,
    value: null,
    fn,
    window: ActiveNode.window,

    parent: ActiveNode,

    updateState: FRESH,
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

  ActiveNode.window.submitWork(memo);

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

export function setActiveWindow(window) {
  ActiveWindow = window;
}

export function setActiveNode(node) {
  ActiveNode = node;
}

export function executeNode(window, node) {
  try {
    //console.log('executing node', node.id);

    setActiveNode(node);

    if (node.type === MEMO) {

      cleanNode(node);

      let prevValue = node.value;

      node.value = node.fn(prevValue);

      if (node.value !== prevValue) {
        node.observerSet.forEach(observer => {
          window.submitWork(observer);
        });
      }

    } else {
      cleanNode(node);

      let nextValue = node.fn(node.value);
      node.value = nextValue;
    }
  } catch (e) {
    console.error(e);
  } finally {
    ActiveNode = null;
  }
}
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