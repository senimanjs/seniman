# Introduction

Seniman is a server-driven web UI framework. Components, application state, and event handlers run on the server, while a small browser runtime applies the resulting DOM updates.

You write the interface with JSX:

```js
import { createRoot, useState } from 'seniman';
import { serve } from 'seniman/server';

function App() {
  let [count, setCount] = useState(0);

  return <button onClick={() => setCount(value => value + 1)}>
    Count: {count()}
  </button>;
}

serve(createRoot(App), 3002);
```

When the button is clicked, the browser sends the event to the server. The server updates `count`, determines that only the button's text changed, and sends the corresponding DOM command back through the WebSocket connection. It does not send a new HTML page or rerender the complete browser tree.

## The programming model

Seniman's core model has a few important properties:

- **The component tree lives on the server.** Components can directly use server-side services, databases, and application state.
- **State is fine-grained.** State getters establish dependencies where they are consumed, allowing Seniman to update a specific text node, property, style, or reactive scope.
- **Events can call server functions directly.** A normal function passed to an event such as `onClick` runs on the server.
- **Client functions are explicit.** Code that must use browser APIs can be declared with `$c`, with server values passed through `$s`.
- **Browser updates are incremental.** Seniman uses a compact binary protocol over WebSocket rather than sending HTML fragments for every change.

This architecture is particularly useful for interactive applications whose data and authority already live on the server. It also means that network latency and connection lifecycle are part of the application's runtime behavior, so interactions that require immediate browser-only feedback can be implemented with client functions.

Continue with [Installation](/docs/install) to set up a project, or see [Client Functions](/docs/client-functions) for the boundary between server and browser code.
