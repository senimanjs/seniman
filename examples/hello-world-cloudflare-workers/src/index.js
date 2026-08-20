import { createRoot } from 'seniman';
import { createEntrypoint } from 'seniman-cloudflare';

function App() {
  return <div>Hello World</div>;
}

export default createEntrypoint(createRoot(App));
