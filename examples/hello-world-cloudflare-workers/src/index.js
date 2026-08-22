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

export default createEntrypoint(createRoot(App));
