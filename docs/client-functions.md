# Running Code in the Browser

Seniman is server-first: components, state, effects, and ordinary event handlers run on the server. Client functions are the deliberate escape hatch for code that must use native events, DOM elements, browser APIs, or immediate browser timing.

Two compiler markers define the boundary:

- `$c(() => ...)` marks a function that runs in the browser.
- `$s(value)` makes a server-supplied value available inside that client function.

Neither marker is imported at runtime. The Seniman compiler recognizes them while building the application.

For a guide to choosing event-handler patterns, start with [Understanding Events](/docs/event-system). For exact supported values and helper signatures, see the [Events reference](/docs/references/events) and [Client reference](/docs/references/client).

## Stay server-side by default

A plain function passed to an event prop is a server handler:

```js
function CounterButton(props) {
  return <button onClick={() => {
    props.increment();
  }}>
    Increment
  </button>;
}
```

This is the shortest and clearest form when the browser only needs to report a discrete action. It keeps application logic, credentials, and service access on the server.

Introduce `$c` only when the browser needs to do something before or instead of that server call.

## Use `$c` for native browser behavior

A `$c` event handler receives the native browser event and can use browser globals.

```js
function ConfirmButton() {
  return <button onClick={$c(event => {
    event.currentTarget.disabled = true;
    console.log('Disabled immediately in the browser');
  })}>
    Confirm
  </button>;
}
```

The function body is compiled and sent to the browser. It does not close over arbitrary server variables like a normal JavaScript closure. Values crossing that boundary must be marked with `$s`.

Use `event.currentTarget` for the element whose handler is running. Use `event.target` when the originating descendant matters.

## Send selected browser data to the server

Create a server function in the component scope, then call it from `$c` through `$s`.

```js
import { useState } from 'seniman';

function CommandInput() {
  let [lastCommand, setLastCommand] = useState('');

  let submit = command => {
    setLastCommand(command);
    runCommand(command);
  };

  return <div>
    <input onKeyDown={$c(event => {
      if (event.key === 'Enter') {
        $s(submit)(event.currentTarget.value);
      }
    })} />
    <p>Last command: {lastCommand()}</p>
  </div>;
}
```

The browser sends only the input string. The DOM element and `KeyboardEvent` remain in the browser.

Because the `$c` function is attached directly to an event prop, Seniman automatically gives the captured server function a lifecycle-owned handler reference.

Calls from the browser are asynchronous and fire-and-forget. A server handler's return value does not become a browser return value. Send a later browser command or channel value when a result must travel back.

## Capture server values with `$s`

Ordinary values wrapped in `$s` are serialized snapshots.

```js
import { useClient } from 'seniman';

function AnnounceButton(props) {
  let client = useClient();

  return <button onClick={() => {
    let message = props.message;

    client.exec($c(() => {
      window.alert($s(message));
    }));
  }}>
    Announce
  </button>;
}
```

Changing `message` on the server later does not mutate the copy already sent to the browser. Execute another client function or use a Channel to send another value.

Strings, numbers, booleans, `null`, Arrays, plain objects, and binary buffers can cross as data. Functions, DOM objects, cyclic structures, and arbitrary class instances cannot. Handlers, refs, channels, and modules are special Seniman tokens rather than ordinary serialized objects.

## Execute browser work from a server handler

Event props are one entry point for client functions. `client.exec()` is the other: server code decides when a browser function should run.

```js
import { useClient } from 'seniman';

function CopyButton(props) {
  let client = useClient();

  function copy() {
    let text = props.text;

    client.exec($c(() => {
      navigator.clipboard.writeText($s(text));
    }));
  }

  return <button onClick={copy}>Copy</button>;
}
```

`exec()` is also fire-and-forget. Use it for focus, selection, clipboard access, measurements, browser library calls, and other operations that have no server equivalent.

When browser work must report a result back to server state, create an explicit handler for that return path:

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
  let [height, setHeight] = useState(null);

  let reportHeight = createHandler(value => {
    setHeight(Math.round(value));
  });

  async function generatePreview() {
    let text = await props.renderPreview();
    setPreview(text);

    client.exec($c(() => {
      requestAnimationFrame(() => {
        let preview = $s(previewRef).get();
        $s(reportHeight)(preview.getBoundingClientRect().height);
      });
    }));
  }

  return <div>
    <button onClick={generatePreview}>Generate preview</button>
    <pre ref={previewRef}>{preview()}</pre>
    <p>Rendered height: {height() ?? 'not measured'}px</p>
  </div>;
}
```

The click starts asynchronous server work. Only after the generated preview is stored does `client.exec()` ask the browser to measure the newly rendered element. The lifecycle-owned handler then carries that measurement back to server state. A `$c` click handler cannot replace this flow because its browser code runs before the asynchronous server work and resulting DOM update have completed.

Explicit `createHandler()` is necessary because this `$c` function is executed independently rather than attached directly to a JSX event or lifecycle prop.

## Refer to a rendered element

`createRef()` creates a server token that resolves to a DOM element inside client code.

```js
import { createRef } from 'seniman';

function SearchBox() {
  let inputRef = createRef();

  return <div>
    <input ref={inputRef} />
    <button onClick={$c(() => {
      $s(inputRef).get()?.focus();
    })}>
      Focus search
    </button>
  </div>;
}
```

The ref token exists on the server; `.get()` exists on its browser representation and returns the mounted DOM element. Do not try to inspect the DOM element from server code.

Prefer an element passed directly to a lifecycle function when the behavior belongs entirely to that element. Use a ref when another handler or later `client.exec()` call must find it.

## Mount and clean up browser behavior

`onMount` can install behavior when an element appears. A client function may return cleanup that runs when that element is removed.

```js
function EscapeListener(props) {
  let cancel = () => props.cancel();

  return <div onMount={$c(rootElement => {
    let onKeyDown = event => {
      if (event.key === 'Escape') {
        $s(cancel)();
      }
    };

    rootElement.addEventListener('keydown', onKeyDown);

    return () => {
      rootElement.removeEventListener('keydown', onKeyDown);
    };
  })} tabindex="0">
    {props.children}
  </div>;
}
```

Put mount logic on the element it owns. This guarantees the element exists when setup runs and gives the browser runtime the correct lifetime for cleanup.

## Reuse and stream browser logic

As browser behavior grows, two Client APIs avoid repeatedly reinstalling ad hoc functions:

- `createModule()` defines reusable browser-side logic once per browser window.
- `createChannel()` streams later server values to a browser-side receiver.

These are useful for throttlers, editors, terminal input, media controllers, and other long-lived browser integrations. Their complete lifecycle and examples are in the [Client reference](/docs/references/client).

## Keep the boundary narrow

| Situation | Preferred form |
| --- | --- |
| Server only needs notification | Plain server event handler |
| Server needs one input value | `withValue()` |
| Browser must cancel default behavior | `preventDefault()` or `$c` |
| Browser event fields are needed | `$c` calling `$s(handler)` |
| Server initiates browser work | `client.exec($c(...))` |
| Browser behavior follows one element's lifetime | `onMount={$c(...)}` |
| Later code needs a DOM element | `createRef()` |

Client functions are most maintainable when they translate browser details into small semantic server messages. Keep durable state and application decisions on the server; keep DOM mechanics and immediate browser behavior in `$c`.
