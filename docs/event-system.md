# Understanding Events

An interaction begins in the browser, but most Seniman application state lives on the server. The event system connects those two runtimes without requiring every handler to contain networking code.

Most event handling falls into one of three patterns:

1. Pass a server function directly when the browser only needs to report that something happened.
2. Use a helper such as `withValue()` or `preventDefault()` for common browser-to-server behavior.
3. Use `$c` and `$s` when browser event data or browser-only logic is required.

This guide develops those patterns using the primary event types. For every supported event and the exact helper APIs, see the [Events reference](/docs/references/events).

## What runs where

Seniman components execute on the server. Native events still originate in the browser.

| Code | Runs in | Purpose |
| --- | --- | --- |
| Component functions | Server | Build interface structure and own state |
| Plain event handlers | Server | Update application state after an event |
| `$c(() => ...)` functions | Browser | Read native events and use browser APIs |
| `$s(handler)(...)` calls | Browser to server | Send selected values to a server handler |

Keeping this boundary in mind makes the event syntax much easier to choose.

## The simplest handler

For buttons and other actions where the event object is irrelevant, pass a server function directly to the event prop.

```js
import { useState } from 'seniman';

function Counter() {
  let [count, setCount] = useState(0);

  function increment() {
    setCount(value => value + 1);
  }

  return <button onClick={increment}>
    Count: {count()}
  </button>;
}
```

`increment` runs on the server in the component's scope. It can update state, mutate a Collection, access context, or call application services.

The native browser event is not passed to a direct server handler. This form represents a no-argument notification: the button was clicked.

## Sending an input value

Input values exist in the browser. `withValue()` provides the common pattern of reading `event.target.value` in the browser and sending that string to a server handler.

```js
import { useState, withValue } from 'seniman';

function NameField() {
  let [name, setName] = useState('');

  return <label>
    Name
    <input value={name()} onChange={withValue(setName)} />
    <span>Hello, {name() || 'stranger'}.</span>
  </label>;
}
```

Use this pattern for inputs, textareas, and selects when the value is the only browser data the server needs.

`onChange` follows the browser's native change-event timing. When an interface needs different timing or additional event fields, use a client function instead.

## Preventing browser defaults

Some events have browser behavior that must be cancelled immediately. A form submission, for example, would normally navigate away from the page. `preventDefault()` cancels that behavior in the browser before calling the server handler.

```js
import { preventDefault } from 'seniman';

function SearchForm() {
  function submitSearch() {
    runSearch();
  }

  return <form onSubmit={preventDefault(submitSearch)}>
    <input name="query" />
    <button type="submit">Search</button>
  </form>;
}
```

The helper does not pass the event object or call `stopPropagation()`. Use `$c` when the browser-side behavior needs more control.

## Reading the native event

Wrap a function in `$c` when the handler needs native event fields, DOM APIs, or logic that must run before a network round trip.

The following input sends its value to the server only when Enter is pressed:

```js
function CommandInput() {
  let submitCommand = command => {
    runCommand(command);
  };

  return <input onKeyDown={$c(event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      $s(submitCommand)(event.currentTarget.value);
    }
  })} />;
}
```

The `$c` function runs in the browser and receives the native `KeyboardEvent`. `$s(submitCommand)(...)` sends only the selected string to the server.

Because this `$c` function is attached directly to an event prop, Seniman automatically turns the captured server function into a lifecycle-owned handler. Explicit `createHandler()` is reserved for standalone client functions such as those passed to `client.exec()`.

For deeper coverage of client functions and captured values, see [Client Functions](/docs/client-functions).

## Primary event types

### Actions and forms

- `onClick` handles buttons, links, and discrete pointer actions.
- `onChange` handles committed changes to inputs, textareas, and selects.
- `onSubmit` handles form submission. Pair it with `preventDefault()` unless normal navigation is intended.

Prefer direct server handlers for discrete actions. Use `withValue()` for a single field value and `$c` when multiple fields or native event properties must be inspected.

### Keyboard input

- `onKeyDown` fires when a key is pressed and is usually the right place for shortcuts or Enter/Escape behavior.
- `onKeyUp` fires when the key is released.

Keyboard handlers commonly need `event.key`, modifier states, or composition state, so a `$c` handler is often appropriate. Send only the semantic action or text the server requires.

### Focus

- `onFocus` reports that an element received focus.
- `onBlur` reports that it lost focus.

Focus can be application state—for example, whether an editor is active—but purely visual focus styling is better expressed with CSS. Avoid a server round trip when no server-owned state depends on the event.

### Mouse and scrolling

- `onMouseEnter` and `onMouseLeave` are useful when hover changes application state rather than appearance alone.
- `onMouseDown`, `onMouseMove`, and `onMouseUp` support drag-like interactions.
- `onScroll` and `onWheel` report viewport movement and wheel input.

These events can fire rapidly. Perform immediate visual work, sampling, throttling, or coalescing inside `$c`, then send meaningful updates to the server. Do not send every mousemove or scroll sample unless the application truly needs each one.

### Resource lifecycle

- `onLoad` reports that an image, script, or other resource loaded.
- `onUnload` reports the corresponding unload event where the browser emits one.

Use a browser-side `onLoad` function when a library must be initialized in the browser. Use a direct server handler when the server only needs to know that loading completed.

```js
import { Script } from 'seniman/head';

function AnalyticsScript() {
  return <Script
    src="/analytics.js"
    onLoad={$c(() => {
      window.analytics.initialize();
    })}
  />;
}
```

## Choosing a pattern

| Need | Use |
| --- | --- |
| Notify the server of a discrete event | Plain server handler |
| Send `event.target.value` | `withValue()` |
| Cancel the default, then notify the server | `preventDefault()` |
| Read native event fields | `$c` with `$s(handler)(...)` |
| Use DOM or browser APIs | `$c` |
| Handle high-frequency input | Throttle or coalesce in `$c` |

The [Events reference](/docs/references/events) lists every supported event prop, the precise behavior of `createHandler()`, `$c`, `$s`, `withValue()`, and `preventDefault()`, and the supported value types that can cross the browser-server boundary.
