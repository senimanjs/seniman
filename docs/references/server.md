# Server API Reference

Seniman provides a standalone Node HTTP server and an Express adapter. Both serve the initial HTML and upgrade Seniman's WebSocket connection on the same server.

The server examples on this page belong in application entry modules, not inside components. Only `useEnv()` is a component-scope API.

## Standalone server

```js
import { createServer, serve } from 'seniman/server';
```

### `serve(root, port)`

Starts a standalone server on `port` using default options.

```js
import { createRoot } from 'seniman';
import { serve } from 'seniman/server';

serve(createRoot(App), 3002);
```

Use `createServer()` when you need host selection, server events, or WebSocket options.

**Parameters:** `root` is the value returned by `createRoot()`. `port` is passed to Node's HTTP server.

`serve()` starts listening immediately, logs the selected port, and returns `undefined`. It uses Node's default listen host and does not accept Seniman server options.

### `createServer(root, options?)`

Creates and returns a Node `http.Server` without listening.

```js
let server = createServer(createRoot(App), {
  allowedOrigins: ['localhost', 'app.example.com'],
  perMessageDeflate: true
});

server.listen(3002, '0.0.0.0');
```

The returned object is a normal Node server. Use its `listen()`, `close()`, timeout settings, TLS termination arrangement, and event APIs as needed. Seniman handles ordinary GET requests, the initial HTML document, and WebSocket upgrades on that server.

The adapter derives the client IP from `X-Forwarded-For` when present, otherwise from the socket. It treats a request as secure when `X-Forwarded-Proto` equals `https`; configure those headers correctly when deploying behind a trusted reverse proxy.

## Options

### `allowedOrigins`

An Array of hostnames allowed in WebSocket `Origin` headers.

```js
{ allowedOrigins: ['localhost', 'app.example.com'] }
```

Entries are hostnames only—do not include a protocol or port. An entry containing `*` is matched as a wildcard pattern. When omitted or empty, every origin is accepted.

This is an origin check, not user authentication.

The check applies to WebSocket upgrades. A disallowed origin receives `401 Unauthorized`; the initial HTML GET is not an authentication boundary. Use an authenticating reverse proxy or application-level access control for sensitive apps.

### `perMessageDeflate`

Set to `true` to enable WebSocket per-message deflate using Seniman's configured compression settings. It is disabled by default.

```js
{ perMessageDeflate: true }
```

Seniman enables no-context-takeover in both directions, a 1024-byte threshold, compression level 3, memory level 7, and a concurrency limit of 10. These settings are currently fixed; passing a custom per-message-deflate object is not supported.

## Express

```js
import { wrapExpress } from 'seniman/express';
```

### `wrapExpress(app, root, options?)`

Adds Seniman's catch-all GET route and WebSocket upgrade handling to an Express application. It also wraps `app.listen()` so both protocols use the returned HTTP server.

```js
import express from 'express';
import { createRoot } from 'seniman';
import { wrapExpress } from 'seniman/express';

let app = express();
wrapExpress(app, createRoot(App), {
  allowedOrigins: ['app.example.com'],
  perMessageDeflate: true
});

app.listen(3002);
```

The options have the same meaning as `createServer()`.

Call `wrapExpress()` after registering application routes that should take precedence over Seniman's catch-all GET route, and before calling `app.listen()`. It mutates the Express app's `listen` method and returns `undefined`.

## Cloudflare Workers

```js
import { createServer, useEnv } from 'seniman/workers';
```

### `createServer(root, options?)`

Returns a module-worker object with a `fetch(request, env)` method.

```js
import { createRoot } from 'seniman';
import { createServer } from 'seniman/workers';

export default createServer(createRoot(App), {
  allowedOrigins: ['app.example.com']
});
```

The Workers adapter uses `WebSocketPair`, disables Seniman's built-in rate limiters, and sends uncompressed initial HTML so the platform can manage transfer encoding. Its supported option is `allowedOrigins`; per-message deflate is not configurable through the Workers WebSocket API.

### `serve(root, options?)`

Registers a `fetch` event listener for legacy Service Worker-format deployments.

```js
import { createRoot } from 'seniman';
import { serve } from 'seniman/workers';

serve(createRoot(App));
```

Prefer module-worker `createServer()` for new projects.

### `useEnv()`

Returns the Cloudflare `env` object associated with the current request/window through Seniman context.

```js
import { useEnv } from 'seniman/workers';

function App() {
  let env = useEnv();
  return <div>{env.DEPLOYMENT_NAME}</div>;
}
```

The available fields are determined by the bindings configured for the Worker.

## Hono on Workers

```js
import { wrapHono } from 'seniman/hono/workers';
```

### `wrapHono(app, root, options?)`

Adds Seniman's catch-all GET/WebSocket route to an existing Hono app.

```js
import { Hono } from 'hono';
import { createRoot } from 'seniman';
import { wrapHono } from 'seniman/hono/workers';

let app = new Hono();

app.get('/api/health', context => context.text('ok'));
wrapHono(app, createRoot(App), {
  allowedOrigins: ['app.example.com']
});

export default app;
```

Register specific Hono routes before calling `wrapHono()`, because it adds `app.get('*', ...)`. The adapter passes `context.env` to `useEnv()`, disables framework rate limiting and precompressed HTML, and returns `undefined`.
