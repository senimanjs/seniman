import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createRoot, useState } from 'seniman';
import { createEntrypoint } from 'seniman/node';

function App() {
  const [getCount, setCount] = useState(0);

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

const app = new Hono();
const entrypoint = createEntrypoint(createRoot(App));

app.get('/api/health', context => context.text('ok'));
app.all('*', context => entrypoint.fetch(context.req.raw));

const server = serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 3002)
});
server.on('upgrade', entrypoint.upgrade);
