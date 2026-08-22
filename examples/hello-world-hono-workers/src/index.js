import { Hono } from 'hono';
import { createRoot, useState } from 'seniman';
import { createEntrypoint } from 'seniman-cloudflare';

function App() {
  let [getCount, setCount] = useState(0);

  return (
    <div>
      <h1>Hello World</h1>
      <p>Count: {getCount()}</p>
      <button onClick={() => setCount(count => count + 1)}>
        Increment
      </button>
    </div>
  );
}

let app = new Hono();
let entrypoint = createEntrypoint(createRoot(App));

app.get('/api/health', c => c.text('ok'));
app.all('*', c =>
  entrypoint.fetch(c.req.raw, c.env, c.executionCtx)
);

export default app;
