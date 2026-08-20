# Application API Reference

The application APIs create a Seniman root and provide basic in-app navigation.

Root creation and configuration belong in the server entry module. `<Anchor>` is rendered inside a Seniman component like any other JSX element.

```js
import { Anchor, createRoot } from 'seniman';
```

## Application root

### `createRoot(rootComponent)`

Creates the root object consumed by a Seniman server adapter.

```js
import { createRoot } from 'seniman';
import { serve } from 'seniman/node';

function App() {
  return <main>Hello</main>;
}

let root = createRoot(App);
serve(root, 3002);
```

`rootComponent` is evaluated once for each browser window. Its state, effects, context, and cleanup belong to that window rather than being shared by every visitor.

**Parameter:** `rootComponent` is a component function or another renderable function. It receives no framework-defined props.

**Returns:** a Root object. Creating a Root does not open a port or evaluate the component; the selected server adapter does that when a browser window connects.

The Root owns all live browser windows for that application instance. A temporarily disconnected browser may reconnect to its existing window and resume from its last acknowledged render offset. Application values closed over outside `rootComponent` are process-wide and therefore shared; values created inside it are window-local.

```js
// Shared by every connected window.
let totalConnections = 0;

function App() {
  // Separate state for this browser window.
  let [count, setCount] = useState(0);
  totalConnections++;

  return <button onClick={() => setCount(count => count + 1)}>
    {count()}
  </button>;
}
```

### `root.setRateLimit({ disabled })`

Disables Seniman's built-in window-creation and input-message rate limiters when `disabled` is `true`.

```js
root.setRateLimit({ disabled: true });
```

This affects framework-level limits only. It does not add authentication or protect the application from untrusted network access.

The option is primarily intended for adapters or trusted deployments that provide their own limiting. Calling it with `disabled: false` does not restore limiters after they have been disabled; configure it once during application startup.

### `root.setDisableHtmlCompression()`

Disables Brotli and gzip compression for Seniman's initial HTML response.

```js
root.setDisableHtmlCompression();
```

This is primarily useful in runtimes that handle HTTP compression themselves.

It affects only the initial HTML document. WebSocket compression is configured separately by server adapters that support it.

## Navigation

### `<Anchor href onClick? class? style?>`

Renders an anchor that uses Seniman's client-side history for same-origin navigation.

```js
function Navigation() {
  return <Anchor href="/settings">Settings</Anchor>;
}
```

The optional `onClick` callback receives `href` before navigation. Return `false` to cancel the navigation.

```js
function Navigation() {
  return <Anchor href="/settings" onClick={href => {
    if (!canLeavePage()) return false;
  }}>
    Settings
  </Anchor>;
}
```

Cross-origin URLs perform a normal browser navigation. See [Client API](/docs/references/client) for direct access to location and history.

Root-relative URLs and absolute URLs are supported. Same-origin navigation does not reload the document: it updates `client.location`, pushes a history entry, and causes scopes reading the reactive location getters to update.

`class`, `style`, and children are forwarded to the rendered `<a>`. The component currently does not forward arbitrary anchor attributes such as `target`, `rel`, or `download`; use a native `<a>` when those are required.
