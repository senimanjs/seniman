/**
 * This module -- serving as our signals / state management system -- is pretty much copy-pasted from different parts of the SolidJS codebase,
 * with some modifications to work tighter with our Window live-updating system.
 * TODO: add SolidJS's license here.
 */
let Owner = null;
let Listener = null;
let Effects = null;
let Updates = null;
let ExecCount = 0;
let runEffects = runQueue;

let ERROR = null;

const FRESH = 0;
const STALE = 1;
const PENDING = 2;

export function createRoot(fn, detachedOwner, window) {
    let listener = Listener, owner = Owner;
    let root = {
        owned: null,
        cleanups: null,
        context: null,
        owner: detachedOwner || owner,
        window: window || owner.window
    };

    let disposeFn = () => untrack(() => cleanNode(root));
    let updateFn = () => fn(disposeFn);

    Owner = root;
    Listener = null;

    try {
        return runUpdates(updateFn, true);
    } finally {
        Listener = listener;
        Owner = owner;
    }
}

// Run function, and gather possible effects to later execute when doing so.
function runUpdates(fn, init) {
    if (Updates) {
        return fn();
    }

    let wait = false;

    if (!init) {
        Updates = [];
    }

    if (Effects) {
        wait = true;
    } else {
        Effects = [];
    }

    ExecCount++;

    try {
        const res = fn();
        completeUpdates(wait);
        return res;
    } catch (err) {
        if (!Updates) Effects = null;
        handleError(err);
    }
}

function completeUpdates(wait) {
    if (Updates) {
        runQueue(Updates);
        Updates = null;
    }

    if (wait) {
        return;
    }

    const e = Effects;
    Effects = null;

    if (e.length) {
        runUpdates(() => runEffects(e), false);
    }
}

function runTop(node) {

    if (node.state === FRESH) {
        return;
    }

    if (node.state === PENDING) {
        return lookUpstream(node);
    }

    const ancestors = [node];

    while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {

        if ((node.state)) {
            ancestors.push(node);
        }
    }

    for (let i = ancestors.length - 1; i >= 0; i--) {
        node = ancestors[i];

        //console.log('node in RT', node)

        if (node.state === STALE) {
            updateComputation(node);
        } else if (node.state === PENDING) {
            const updates = Updates;
            Updates = null;
            runUpdates(() => lookUpstream(node, ancestors[0]), false);
            Updates = updates;
        }
    }
}

function runUserEffects(queue) {

    let i, userLength = 0;

    for (i = 0; i < queue.length; i++) {
        const e = queue[i];
        if (!e.user) runTop(e);
        else queue[userLength++] = e;
    }

    for (i = 0; i < userLength; i++) {
        runTop(queue[i]);
    }
}

function cleanNode(node) {

    //console.log('cleaning')
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

    if (node.children) {
        for (let i = 0; i < node.children.length; i++) {
            cleanNode(node.children[i]);
        }
        node.children = [];
    }

    if (node.cleanups) {
        for (let i = 0; i < node.cleanups.length; i++) {
            node.cleanups[i]();
        };
        node.cleanups = [];
    }

    node.state = FRESH;
}

function castError(err) {
    if (err instanceof Error || typeof err === "string") return err;
    return new Error("Unknown error");
}

function handleError(err) {
    err = castError(err);

    const fns = ERROR && lookup(Owner, ERROR);
    if (!fns) { throw err }
    for (const f of fns) f(err);
}

function lookup(owner, key) {
    return owner
        ? owner.context && owner.context[key] !== undefined
            ? owner.context[key]
            : lookup(owner.owner, key)
        : undefined;
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

function createProvider(id, options) {
    return function provider(props) {
        let res;
        createRenderEffect(
            () =>
            (res = untrack(() => {
                Owner.context = { [id]: props.value };
                return children(() => props.children);
            })),
            undefined,
            options
        );
        return res;
    };
}

function runQueue(queue) {
    for (let i = 0; i < queue.length; i++) runTop(queue[i]);
}

function updateComputation(node) {
    cleanNode(node);

    const owner = Owner,
        listener = Listener,
        time = ExecCount;

    Listener = Owner = node;

    //console.log('run computation in update computation');
    //console.log('before run computation', Owner);

    runComputation(
        node,
        node.value,
        time
    );
    Listener = listener;
    Owner = owner;
}

function runComputation(node, value, time) {

    let nextValue;

    try {
        nextValue = node.fn(value);
    } catch (err) {
        if (node.pure) {
            node.state = STALE;
        }

        handleError(err);
    }

    if (!node.updatedAt || node.updatedAt <= time) {
        if (node.updatedAt != null && "observers" in (node)) { // if is memo
            writeSignal(node, nextValue, true);
        } else { // if regular effect
            node.value = nextValue;
        }
        node.updatedAt = time;
    }
}

function writeSignal(node, value) {
    let current = node.value;

    if (current != value) {
        node.value = value;
        if (node.observers && node.observers.length) {
            runUpdates(() => {

                // mark direct observers as stale, and recursively mark their observers as pending
                for (let i = 0; i < node.observers.length; i++) {
                    const o = node.observers[i];
                    if (o.state == FRESH) {
                        if (o.pure) {
                            Updates.push(o);
                        } else {
                            Effects.push(o);
                        }
                        if (o.observers) {
                            markObserversAsPending(o);
                        }
                    }

                    o.state = STALE;
                }

            }, false);
        }
    }
}


function readSignal() {

    if (this.sources && this.state) {
        if (this.state === STALE) {
            updateComputation(this);
        } else if (this.state === PENDING) {
            const updates = Updates;
            Updates = null;
            runUpdates(() => lookUpstream(this), false);
            Updates = updates;
        } else {
            throw new Error("invalid state");
        }
    }

    if (Listener) {
        let sSlot = this.observers ? this.observers.length : 0;

        Owner.sources.push(this);
        Owner.sourceSlots.push(sSlot);

        this.observers.push(Owner);
        this.observerSlots.push(Owner.sources.length - 1);
    }

    return this.value;
}

function lookUpstream(node, ignore) {

    node.state = FRESH;

    for (let i = 0; i < node.sources.length; i += 1) {
        const source = node.sources[i];
        if (source.sources) {
            if (source.state === STALE) {
                if (source !== ignore) runTop(source);
            } else if (source.state === PENDING)
                lookUpstream(source, ignore);
        }
    }
}

function markObserversAsPending(node) {

    for (let i = 0; i < node.observers.length; i += 1) {
        const o = node.observers[i];
        if (o.state == FRESH) {
            o.state = PENDING;

            if (o.pure) {
                Updates.push(o);
            } else {
                Effects.push(o);
            }

            if (o.observers) {
                markObserversAsPending(o);
            }
        }
    }
}

export function createRenderEffect(
    fn,
    value,
    options
) {
    const c = createComputation(fn, value, false, STALE, options);
    //if (Scheduler && Transition && Transition.running) Updates!.push(c);
    updateComputation(c);
}

export function untrack(fn) {
    const listener = Listener;
    Listener = null;
    try {
        return fn();
    } finally {
        Listener = listener;
    }
}

export function useState(initialValue) {

    let signalState = {
        value: initialValue,
        observers: [],
        observerSlots: []
    };

    let setter = (newValue) => {
        //console.log('setting to', newValue);//, observers);
        if (newValue instanceof Function) {
            newValue = newValue(signalState.value);
        }

        writeSignal(signalState, newValue);
    }

    return [readSignal.bind(signalState), setter];
}

export function getActiveWindow() {
    return Owner?.window;
}

function createComputation(fn, init, pure, state, options) {
    const c = {
        fn,
        state: state,
        updatedAt: null,
        owned: [],
        sources: [],
        sourceSlots: [],
        cleanups: [],
        value: init,
        owner: Owner,
        window: Owner.window,
        context: null,
        user: false,
        pure
    };

    //console.log('Owner at CC', Owner);

    if (!Owner.owned) Owner.owned = [c];
    else Owner.owned.push(c);

    //console.log('new C', c)

    return c;
}

export function useEffect(fn, value) {

    runEffects = runUserEffects;

    const c = createComputation(fn, value, false, STALE, undefined);
    c.user = true;

    Effects ? Effects.push(c) : updateComputation(c);
}

export function useMemo(fn, value) {

    const c = createComputation(fn, value, true, 0);
    c.observers = [];
    c.observerSlots = [];

    updateComputation(c);

    return readSignal.bind(c);
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
    return (ctx = lookup(Owner, context.id)) !== undefined ? ctx : context.defaultValue;
}

export function children(fn) {
    const children = useMemo(fn);
    const memo = useMemo(() => resolveChildren(children()));

    return memo;
}

export function onCleanup(fn) {
    if (Owner === null) {
        console.warn("cleanups created outside a `createRoot` or `render` will never be run");
        return;
    } else if (Owner.cleanups === null) Owner.cleanups = [fn];
    else Owner.cleanups.push(fn);
}

export function onError(fn) {
    ERROR || (ERROR = Symbol("error"));
    if (Owner === null) {
        return;
    }

    else if (Owner.context === null) Owner.context = { [ERROR]: [fn] };
    else if (!Owner.context[ERROR]) Owner.context[ERROR] = [fn];
    else Owner.context[ERROR].push(fn);
}

export function getOwner() {
    return Owner;
}

export function runWithOwner(o, fn) {
    const prev = Owner;
    Owner = o;
    try {
        return runUpdates(fn, true);
    } finally {
        Owner = prev;
    }
}