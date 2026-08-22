import { createRoot, useState } from 'seniman';
import { createEntrypoint } from 'seniman-bun';

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

let entrypoint = createEntrypoint(createRoot(App));

Bun.serve({
  port: Number(process.env.PORT) || 3002,
  fetch: entrypoint.fetch,
  websocket: entrypoint.websocket,
});
