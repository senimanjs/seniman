# Reactivity API Reference

Seniman tracks state reads in rendered JSX expressions, memos, and effects. Updates rerun the smallest subscribed scope rather than rerunning the entire application root.

The APIs on this page require an active Seniman scope. Call them while a component, effect, or another framework-owned scope is executing—not at module scope. Examples that show only a few statements are excerpts from such a component.

```js
import {
  useState,
  useMemo,
  useEffect,
  useDisposableEffect,
  untrack,
  useCallback,
  onDispose
} from 'seniman';
```

## State

### `useState(initialValue)`

Creates a reactive value and returns a getter and setter.

```js
function Counter() {
  let [count, setCount] = useState(0);

  return <button onClick={() => setCount(value => value + 1)}>
    {count()}
  </button>;
}
```

Calling the getter subscribes the currently executing reactive scope. The setter accepts either a replacement value or an updater function. An update is skipped when the new value is strictly equal to the current value.

**Parameter:** `initialValue` may be any JavaScript value. A function passed as the initial value is stored as-is; it is not treated as a lazy initializer.

**Returns:** `[getValue, setValue]`.

- `getValue()` synchronously returns the current value.
- `setValue(nextValue)` replaces it.
- `setValue(updater)` calls `updater(currentValue)` and stores the result.

State belongs to the active Seniman scope. Create it while a component, memo, or effect is executing—not at module scope. Multiple setter calls are processed in call order, and later updater functions observe the value written by earlier calls.

```js
setCount(1);
setCount(current => current + 1); // stores 2
```

Objects and Arrays are compared by identity. Mutating one in place and setting the same reference does not notify subscribers; create a replacement value instead.

```js
setUser(current => ({ ...current, name: 'Ada' }));
```

## Derived values

### `useMemo(fn, initialValue?, options?)`

Creates a reactive getter whose value is calculated by `fn`.

```js
function Name(props) {
  let fullName = useMemo(() =>
    `${props.firstName} ${props.lastName}`
  );

  return <span>{fullName()}</span>;
}
```

State and memo getters read synchronously by `fn` become dependencies. When one changes, the memo recalculates and notifies its own subscribers if the result changed.

`initialValue` is passed as the previous value on the first calculation. `fn` receives the previous calculated value on later calculations.

The optional `options.equals` comparator receives the previous and next values. Return `true` to suppress downstream updates.

```js
let selection = useMemo(
  previous => calculateSelection(previous),
  null,
  { equals: (previous, next) => previous?.id === next?.id }
);
```

**Returns:** a zero-argument reactive getter. Reading it subscribes the current scope to the memo rather than directly to every state read by `fn`.

The default comparator uses strict equality. Passing `{ equals: false }` disables comparison, so every recalculation notifies downstream subscribers.

Memos should calculate and return a value. Avoid side effects inside them; use `useEffect()` when the purpose of the function is to perform work.

## Effects

### `useEffect(fn, initialValue?)`

Creates an effect that runs after its current owner is initialized and reruns when a synchronously read dependency changes.

```js
function CounterLogger(props) {
  useEffect(() => {
    console.log('Current count:', props.count);
  });

  return null;
}
```

`fn` receives the previous value returned by the effect. On its first run, it receives `initialValue`.

The return value is retained only as the next `previousValue`; returning a function does not register cleanup. Use `onDispose()` inside the effect for that.

```js
useEffect(() => {
  let controller = new AbortController();
  let currentQuery = query();

  onDispose(() => controller.abort());
  loadResults(currentQuery, { signal: controller.signal });
});
```

Cleanup registered during a run executes before the next run and again if the effect is permanently removed.

With an async effect, only getter calls before the first `await` are tracked. Read dependencies before starting asynchronous work.

Effects run in Seniman's scheduled work phase rather than inline at the `useEffect()` call. Setter calls made by an effect schedule any newly affected work after the current work item.

### `useDisposableEffect(fn, initialValue?)`

Creates an effect with the same tracking behavior as `useEffect()` and returns a function that permanently disposes it.

```js
function SearchWatcher(props) {
  let stop = useDisposableEffect(() => {
    console.log(props.query);
  });

  return <button onClick={stop}>Stop watching</button>;
}
```

Use this when an effect must end before its surrounding component or effect scope is disposed.

After disposal, the effect no longer responds to its dependencies and its registered cleanup callbacks run. Treat the returned function as a one-shot disposer.

## Dependency control

### `untrack(fn)`

Runs `fn` and returns its result without subscribing the current reactive scope to getters read inside it.

```js
useEffect(() => {
  let activeId = selectedId();
  let snapshot = untrack(() => records());
  saveSelection(activeId, snapshot);
});
```

`untrack()` suppresses dependency registration only for the synchronous duration of `fn`. It does not freeze values or prevent setters called inside `fn` from notifying their existing subscribers.

### `useCallback(fn)`

Returns a function bound to the current Seniman window and reactive scope.

```js
function MessageStream(props) {
  let appendMessage = useCallback(message => {
    props.messages.push(message);
  });

  props.stream.on('message', appendMessage);
  onDispose(() => props.stream.off('message', appendMessage));

  return null;
}
```

Use it when a callback will be invoked later by code outside the current Seniman execution, such as a timer, stream, or library callback. Normal JSX event handlers do not usually need it.

Arguments and the return value pass through unchanged. The binding is to the window and scope active at creation time, so cleanup registrations and reactive APIs used during the later callback apply to that captured owner.

For cleanup behavior, see [Context & Lifecycle](/docs/references/context-lifecycle).
