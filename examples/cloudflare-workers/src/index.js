import { createRoot, useState } from 'seniman';
import { createServer } from 'seniman/workers';

function App(props) {
  let [getCount, setCount] = useState(0);
  let onClick = () => setCount((count) => count + 1);

  return (
    <div class="hello-world">
      {props.name} counted: {getCount()}
      <button onClick={onClick}>Add +</button>
    </div>
  );
}

let root = createRoot(() => <App name={"Eka"} />);

// Runs the root on Cloudflare Workers (in ES modules mode)
export default createServer(root);

// use import { serve } from 'seniman/workers' to run on service worker mode
// serve(root);