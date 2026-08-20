import { createRoot } from 'seniman';
import { createEntrypoint } from 'seniman-bun';

function App() {
  return <div>Hello World</div>;
}

Bun.serve({
  port: 3002,
  ...createEntrypoint(createRoot(App)),
});
