# Events API Reference

Seniman event props accept either server handlers or client functions. Event names use JSX casing such as `onClick`, `onKeyDown`, and `onWheel`.

Event props and `createHandler()` belong inside a Seniman component or another active scope. Every primary example below is shown as a component so the server-owned and browser-owned portions are explicit.

## Server handlers

### `onEvent={serverFunction}`

A plain function passed directly to an event prop runs on the server when the browser reports the event.

```js
function CounterButton(props) {
  return <button onClick={() => {
    props.setCount(count => count + 1);
  }}>
    Increment
  </button>;
}
```

Use a client function when the handler needs browser event data or browser-only APIs.

The direct form is shorthand for a no-argument server call. The browser `Event` object is not serialized and is not passed to `serverFunction`.

```js
function handleClick() {
  // Runs on the server; there is no browser event argument here.
  setOpen(true);
}

<button onClick={handleClick}>Open</button>
```

The function runs in the owning Seniman scope, so it may read and update state, mutate Collections or Sequences, use context captured by that scope, and register cleanup.

### `createHandler(fn)`

Creates a lifecycle-owned server handler reference that a `$c` client function can call through `$s`.

```js
import {
  createHandler,
  createRef,
  useClient,
  useState
} from 'seniman';

function PreviewPanel(props) {
  let client = useClient();
  let previewRef = createRef();
  let [preview, setPreview] = useState('');
  let [width, setWidth] = useState(null);

  let reportWidth = createHandler(value => {
    setWidth(Math.round(value));
  });

  async function generatePreview() {
    let text = await props.renderPreview();
    setPreview(text);

    client.exec($c(() => {
      requestAnimationFrame(() => {
        let preview = $s(previewRef).get();
        $s(reportWidth)(preview.getBoundingClientRect().width);
      });
    }));
  }

  return <div>
    <button onClick={generatePreview}>Generate preview</button>
    <pre ref={previewRef}>{preview()}</pre>
    <p>Width: {width() ?? 'not measured'}px</p>
  </div>;
}
```

The button first invokes its ordinary server handler. After asynchronous server work has generated the preview, `client.exec()` measures the newly rendered element in the browser and `reportWidth` carries the result back to server state. A `$c` click handler would run before the server work and DOM update complete. Unlike a `$c` function attached directly to a JSX event or lifecycle prop, `client.exec()` does not automatically convert captured raw functions into handlers, so this boundary requires `createHandler()`.

The handler is removed when its owning scope is disposed.

**Parameter:** `fn` is the server function to invoke.

**Returns:** an opaque handler token. The token is meaningful to `$s()` inside client functions; it is not itself a normally callable JavaScript function on the server.

Handler arguments are decoded copies of values sent by the browser. Supported values include strings, numbers, booleans, `null`, Arrays, plain objects, and `ArrayBuffer` values. DOM nodes, browser events, class instances, cyclic objects, Symbols, and functions cannot be sent directly.

## Client functions

### `$c(clientFunction)`

Marks a function for compilation and execution in the browser.

```js
function SubmitButton() {
  return <button onClick={$c(event => {
    event.currentTarget.disabled = true;
  })}>
    Submit
  </button>;
}
```

`$c` is compiler syntax, not a runtime import.

The function body is compiled into the Seniman browser runtime and therefore must be self-contained. Browser globals such as `window`, `document`, and the event object are available. Server values must be explicitly referenced with `$s(...)`; ordinary closure capture is not available in the browser.

When used as an event prop, the browser calls the function with the native event. Use `event.currentTarget` for the element whose Seniman handler is running and `event.target` for the originating descendant.

### `$s(serverValue)`

Makes a server-supplied value available inside a `$c` function. Calling a handler wrapped with `$s` sends the call and its arguments to the server.

```js
function ClickArea() {
  let report = (x, y) => {
    console.log(x, y);
  };

  return <div onClick={$c(event => {
    $s(report)(event.clientX, event.clientY);
  })} />;
}
```

`$s` is also compiler syntax and is only valid within a `$c` function.

`$s` can capture serializable values as well as special Seniman values such as handlers, refs, channels, and modules. Ordinary values are snapshots taken when the client function is attached or executed; changing the original server object later does not mutate the browser copy.

Calls to `$s(handler)(...)` are asynchronous and fire-and-forget from the browser's perspective. They do not return the server function's return value.

## Helpers

### `withValue(fnOrHandler)`

Returns a client event handler that calls the server function with `event.target.value`.

```js
import { withValue } from 'seniman';

function NameInput(props) {
  return <input onChange={withValue(value => {
    props.setName(value);
  })} />;
}
```

It is suitable for inputs, textareas, selects, and other event targets with a `value` property. The value is read in the browser at event time and sent as the handler's only argument.

### `preventDefault(fnOrHandler)`

Returns a client event handler that calls `event.preventDefault()`, then invokes the server function without arguments.

```js
import { preventDefault } from 'seniman';

function EditorForm() {
  return <form onSubmit={preventDefault(() => save())}>
    ...
  </form>;
}
```

Because `preventDefault()` runs in the browser before the network request, it takes effect immediately. The helper does not call `stopPropagation()` and does not pass the event to the server handler.

## Supported events

Seniman currently recognizes these JSX event props:

| Category | Event props |
| --- | --- |
| General | `onClick`, `onFocus`, `onBlur`, `onChange` |
| Scrolling | `onScroll`, `onWheel` |
| Keyboard | `onKeyDown`, `onKeyUp` |
| Mouse | `onMouseEnter`, `onMouseLeave`, `onMouseMove`, `onMouseDown`, `onMouseUp` |
| Lifecycle | `onLoad`, `onUnload` |
| Drag and drop | `onDragStart`, `onDrag`, `onDragEnd`, `onDragEnter`, `onDragLeave`, `onDragOver`, `onDrop` |
| Other | `onContextMenu`, `onSubmit`, `onPaste` |

Event props are case-sensitive. Use the JSX names above rather than lowercase HTML attribute names such as `onclick`.

Browser-side throttling or coalescing should be implemented in a `$c` handler when an event can fire at high frequency, especially `onScroll`, `onWheel`, `onMouseMove`, and drag events. Each server-handler call uses the Seniman input channel and is subject to the application's input rate limits.
