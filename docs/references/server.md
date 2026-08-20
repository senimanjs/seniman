# Server API Reference

Seniman exposes a root separately from the server that hosts it. `serve` is the short path for a standalone Node app; runtime entrypoints provide explicit HTTP and WebSocket integration for custom servers.

## Node

```js
import { createRoot } from 'seniman';
import { serve } from 'seniman/node';

serve(createRoot(App), 3002);
```

`serve(root, port, options?)` creates and starts the Node server. It returns the server so the application can configure timeouts, listen for events, or close it.

Use `createEntrypoint` when the application owns the server:

```js
import { createServer } from 'node:http';
import { createRoot } from 'seniman';
import { createEntrypoint } from 'seniman/node';

let entrypoint = createEntrypoint(createRoot(App));
let server = createServer(entrypoint.request);
server.on('upgrade', entrypoint.upgrade);
server.listen(3002);
```

`createEntrypoint(root, options?)` returns three handlers:

- `request(req, res)` handles Node HTTP requests.
- `upgrade(req, socket, head)` handles Node WebSocket upgrades.
- `fetch(request)` handles standard Fetch requests, which is useful with Fetch-based Node routers.

The server remains an ordinary Node server. Your application owns listening, shutdown, TLS, middleware and static-file serving.

### Express

Register application routes and static files before the Seniman fallback, then attach the upgrade handler to Express's returned HTTP server.

```js
import express from 'express';
import { createRoot } from 'seniman';
import { createEntrypoint } from 'seniman/node';

let app = express();
let entrypoint = createEntrypoint(createRoot(App));

app.use('/assets', express.static('public'));
app.use(entrypoint.request);

let server = app.listen(3002);
server.on('upgrade', entrypoint.upgrade);
```

## Options

### `allowedOrigins`

An array of hostnames allowed in WebSocket `Origin` headers.

```js
serve(root, 3002, {
  allowedOrigins: ['localhost', 'app.example.com']
});
```

Entries are hostnames only. An entry containing `*` is matched as a wildcard. When omitted or empty, every origin is accepted.

### `perMessageDeflate`

Both `serve` and `createEntrypoint` accept `perMessageDeflate: true`. It is disabled by default. Cloudflare and Bun control WebSocket compression through their runtimes.

## Cloudflare Workers

Install `seniman-cloudflare`, then export its entrypoint directly:

```js
import { createRoot } from 'seniman';
import { createEntrypoint } from 'seniman-cloudflare';

export default createEntrypoint(createRoot(App));
```

The returned `fetch(request, env, ctx)` method receives the native Worker arguments. `useEnv()` exposes the current Worker's bindings within a component:

```js
import { useEnv } from 'seniman-cloudflare';

function App() {
  let env = useEnv();
  return <div>{env.DEPLOYMENT_NAME}</div>;
}
```

### Hono on Workers

Hono owns routing. Place the Seniman handler last so custom routes take precedence.

```js
import { Hono } from 'hono';
import { createRoot } from 'seniman';
import { createEntrypoint } from 'seniman-cloudflare';

let app = new Hono();
let entrypoint = createEntrypoint(createRoot(App));

app.get('/api/health', c => c.text('ok'));
app.all('*', c =>
  entrypoint.fetch(c.req.raw, c.env, c.executionCtx)
);

export default app;
```

For a static folder, configure Cloudflare static assets. For a custom response such as `robots.txt`, add another Hono route before `app.all('*', ...)`.

## Bun

Install `seniman-bun` and pass its Fetch and WebSocket handlers to `Bun.serve()`:

```js
import { createRoot } from 'seniman';
import { createEntrypoint } from 'seniman-bun';

let entrypoint = createEntrypoint(createRoot(App));

Bun.serve({
  port: 3002,
  fetch: entrypoint.fetch,
  websocket: entrypoint.websocket,
});
```

## Runtime adapter API

Runtime integrations can build an entrypoint on Seniman's shared host-facing operations:

```js
import { createCoreEntrypoint } from 'seniman/entrypoint';

let core = createCoreEntrypoint(root, options);
```

The returned object provides `render()` for a neutral HTTP response, `fetch()` for a standard Fetch response, `accepts()` for WebSocket origin validation, and `connect()` for handing an upgraded socket to the root. Applications normally use `seniman/node`, `seniman-cloudflare`, or `seniman-bun` instead.
