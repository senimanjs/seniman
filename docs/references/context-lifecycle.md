# Context & Lifecycle API Reference

Context carries server-side values through a component subtree. Lifecycle callbacks release resources when their owning reactive scope reruns or is removed.

Create Context identities at module scope. Render Providers and call `useContext()` and `onDispose()` only while a Seniman component or another active scope is executing.

```js
import {
  createContext,
  onDispose,
  useContext
} from 'seniman';
```

## Context

### `createContext(defaultValue?)`

Creates a context object with a `Provider` component.

```js
const ThemeContext = createContext('light');
```

The declaration above intentionally runs at module scope.

**Returns:** an object with an identity used by `useContext()` and a `Provider` component used to establish a value in a subtree. Create contexts at module scope so every provider and consumer refers to the same identity.

In the current implementation, a consumer without a matching Provider receives `undefined`. `defaultValue` is used when a Provider is present but its `value` is absent or otherwise falsy. If `false`, `0`, or an empty string is a meaningful value, pass it inside an object or getter.

### `<Context.Provider value>`

Makes a value available to descendants rendered inside the provider.

```js
function App() {
  return <ThemeContext.Provider value={themeService}>
    <Page />
  </ThemeContext.Provider>;
}
```

The provider captures its value when its scope is created. Pass reactive getters or stateful objects when descendants need to observe later changes.

Providers may be nested. `useContext()` reads the closest provider value inherited by the active component scope.

```js
function App() {
  return <ThemeContext.Provider value={outerTheme}>
    <Header />
    <ThemeContext.Provider value={dialogTheme}>
      <Dialog />
    </ThemeContext.Provider>
  </ThemeContext.Provider>;
}
```

### `useContext(context)`

Returns the nearest value for `context` in the active component scope.

```js
function ThemeButton() {
  let theme = useContext(ThemeContext);
  return <button>{theme}</button>;
}
```

The read itself is synchronous and not reactive. Reactivity comes from the value placed in the context—for example, a state getter, service object, or Collection.

## Cleanup

### `onDispose(fn)`

Registers `fn` with the currently executing component, memo, or effect scope.

```js
let timer = setInterval(refresh, 1000);

onDispose(() => {
  clearInterval(timer);
});
```

For an effect, registered callbacks run before the effect reruns and when the effect is finally removed. For a component-owned scope, they run when that rendered component is removed or its owner is disposed.

Callbacks run in registration order.

`onDispose()` does not return an unregister function. If a resource needs to be stopped manually before its owner ends, make the callback tolerate repeated cleanup or use an API such as `useDisposableEffect()` that provides an explicit disposer.

Cleanup is server-side. Browser event listeners or other browser resources created through `client.exec()` should return an unmount function from the corresponding JSX lifecycle client function, or otherwise remove themselves in browser-side cleanup.
