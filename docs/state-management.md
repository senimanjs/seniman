# Managing Reactive State

State gives a Seniman component memory and connects that memory to the parts of the interface that display it. The central idea is simple: state is read through a getter, and Seniman tracks where that getter is called.

When the value changes, Seniman reruns those subscribed scopes. It does not rerun the entire application or rebuild unrelated DOM.

This guide covers the usual progression from local state to derived values, effects, and shared context. For exact signatures and edge cases, see the [Reactivity reference](/docs/references/reactivity) and [Context & Lifecycle reference](/docs/references/context-lifecycle).

## Start with local state

Call `useState()` inside a component. It returns a getter and setter.

```js
import { useState } from 'seniman';

function Counter() {
  let [count, setCount] = useState(0);

  return <div>
    <span>Count: {count()}</span>
    <button onClick={() => setCount(value => value + 1)}>
      Increment
    </button>
  </div>;
}
```

`count()` reads the current value. `setCount()` replaces it and notifies scopes that read it.

Use the updater form when the new value depends on the current one:

```js
setCount(current => current + 1);
```

This is safer than calculating from an earlier captured value, especially when several updates can happen close together.

For objects and Arrays, create a replacement value rather than mutating in place:

```js
setUser(current => ({
  ...current,
  name: 'Ada'
}));
```

Seniman compares state by identity. Setting the same object reference again does not reveal which property was changed.

## State reads define update boundaries

The location of a getter call determines what reruns.

```js
function Profile() {
  let [name, setName] = useState('Ada');

  return <section>
    <h1>Profile</h1>
    <p>Name: {name()}</p>
    <button onClick={() => setName('Grace')}>Rename</button>
  </section>;
}
```

Here, the getter is read by the text expression inside the paragraph. Changing `name` updates that expression; the static heading and button are left alone.

This fine-grained behavior is why getters are functions rather than plain values. Calling a getter in a broader scope creates a broader dependency. Keep reads near the output or calculation that actually needs them.

## Reactive scopes, not component rerenders

In React, the component function is the render pass. Updating state runs that function again with a new state snapshot, then React reconciles its returned tree.

In Seniman, the component function creates a persistent server-side component instance. Within it, Seniman creates reactive scopes for dynamic JSX expressions, memos, and effects.

A reactive scope is the unit of both dependency tracking and rerendering. While a scope runs, Seniman records every state or memo getter it calls. When one of those values changes, Seniman reruns that same scope—not the surrounding component—and streams the scope's resulting DOM changes to the browser.

```js
function Counter() {
  let [count, setCount] = useState(0);

  console.log('Counter instance created');

  return <section>
    <h1>Counter</h1>
    <button onClick={() => setCount(value => value + 1)}>
      Count: {count()}
    </button>
  </section>;
}
```

The `Count: {count()}` expression has a reactive scope. Its first run calls `count()`, so that scope subscribes to the state. Clicking the button changes the value, causing the same expression scope to run again and update its text. It does not run `Counter()` again, recreate the static heading, or print the log again. The component function runs again only if its owning scope replaces that component with a new instance.

This is also why Seniman state is returned as a getter rather than a plain render-time value. Calling `count()` reads the current value and subscribes whichever scope is currently running. Memos and effects use the same tracking-and-rerunning mechanism, so they track synchronous getter reads instead of dependency arrays.

## Derive values with `useMemo`

Use a memo when a value is calculated from other reactive values and is read in more than one place, or when downstream code should subscribe to the calculation as one unit.

```js
import { useMemo, useState, withValue } from 'seniman';

function NameEditor() {
  let [firstName, setFirstName] = useState('Ada');
  let [lastName, setLastName] = useState('Lovelace');

  let fullName = useMemo(() =>
    `${firstName()} ${lastName()}`
  );

  return <div>
    <input value={firstName()} onChange={withValue(setFirstName)} />
    <input value={lastName()} onChange={withValue(setLastName)} />
    <h1>{fullName()}</h1>
  </div>;
}
```

The memo records the getters read during its calculation. It recalculates when either name changes and notifies scopes reading `fullName()` only when the memo result changes.

Do not use a memo merely to rename a state getter or perform a trivial calculation used once. A direct JSX expression is usually clearer.

## Use effects for work, not rendering

An effect runs server-side work in response to reactive dependencies. Getters read synchronously inside the effect become dependencies.

```js
import { onDispose, useEffect, useState } from 'seniman';

function SearchResults(props) {
  let [results, setResults] = useState([]);
  let [loading, setLoading] = useState(false);

  useEffect(() => {
    let query = props.query;
    let controller = new AbortController();
    let active = true;

    onDispose(() => {
      active = false;
      controller.abort();
    });
    setLoading(true);

    search(query, { signal: controller.signal })
      .then(nextResults => {
        if (active) setResults(nextResults);
      })
      .catch(error => {
        if (active && error.name !== 'AbortError') {
          console.error(error);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
  });

  return loading()
    ? <p>Loading…</p>
    : <ResultList results={results()} />;
}
```

When `props.query` changes, Seniman cleans up the previous run before starting the next one. The abort prevents an obsolete request from racing with the current request.

An async effect may also be written with `async`, but only getter reads before the first `await` are tracked. Resolve dependencies at the beginning:

```js
useEffect(async () => {
  let query = props.query;
  let results = await search(query);
  setResults(results);
});
```

Effects are appropriate for database or API calls, subscriptions, timers, logging, and synchronization with systems outside rendering. If code only calculates display output, use JSX or a memo instead.

## Clean up owned resources

Timers, subscriptions, streams, and other resources should end with the scope that created them.

```js
import { onDispose, useState } from 'seniman';

function Clock() {
  let [now, setNow] = useState(new Date());
  let timer = setInterval(() => setNow(new Date()), 1000);

  onDispose(() => clearInterval(timer));

  return <time>{now().toLocaleTimeString()}</time>;
}
```

Inside an effect, cleanup runs before the effect reruns and when it is removed. At component level, cleanup runs when that component scope is disposed.

## Share state through context

Props are the clearest way to pass values through nearby components. Context is useful when many descendants need the same service or reactive state and forwarding it through every intermediate component would add noise.

Create the Context identity at module scope, then provide a value inside the component tree:

```js
import { createContext, useContext, useState } from 'seniman';

const ThemeContext = createContext();

function App() {
  let [theme, setTheme] = useState('dark');
  let themeService = { theme, setTheme };

  return <ThemeContext.Provider value={themeService}>
    <Toolbar />
    <Page />
  </ThemeContext.Provider>;
}

function ThemeButton() {
  let { theme, setTheme } = useContext(ThemeContext);

  return <button onClick={() => {
    setTheme(current => current === 'dark' ? 'light' : 'dark');
  }}>
    Theme: {theme()}
  </button>;
}
```

The Context read is not itself reactive. In this example, the provided state getter carries reactivity to the consumer.

## Choosing the right primitive

| Need | Use |
| --- | --- |
| Store one reactive value | `useState()` |
| Calculate a reusable reactive value | `useMemo()` |
| Run work when dependencies change | `useEffect()` |
| Release a component or effect resource | `onDispose()` |
| Share values through a subtree | Context |
| Maintain a changing ordered list | [Collection](/docs/collection) |

Keep state close to the components that own it, place getter reads near their consumers, and use effects only at boundaries with work outside rendering. Those three habits preserve Seniman's small, predictable update scopes.
