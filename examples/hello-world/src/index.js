import { createRoot, useState } from "seniman";
import { serve } from "seniman/node";

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

serve(createRoot(App), 3002);
