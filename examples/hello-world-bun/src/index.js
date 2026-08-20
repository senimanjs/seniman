import { createRoot } from 'seniman';
import { createEntrypoint } from 'seniman-bun';

function App() {
  return <div>Hello World</div>;
}

let entrypoint = createEntrypoint(createRoot(App));

Bun.serve({
  port: 3002,
  fetch: entrypoint.fetch,
  websocket: entrypoint.websocket,
});
