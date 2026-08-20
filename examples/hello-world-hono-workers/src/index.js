import { Hono } from 'hono';
import { createRoot } from 'seniman';
import { createEntrypoint } from 'seniman-cloudflare';

function App() {
  return <div>Hello World</div>;
}

let app = new Hono();
let entrypoint = createEntrypoint(createRoot(App));

app.all('*', c =>
  entrypoint.fetch(c.req.raw, c.env, c.executionCtx)
);

export default app;
