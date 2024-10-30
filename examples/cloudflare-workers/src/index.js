import { createRoot, useState } from 'seniman';
import { createServer, useEnv } from 'seniman/workers';


function App(props) {
  let [getCount, setCount] = useState(0);
  let onClick = () => setCount((count) => count + 1);

  // In service worker mode, environment variables / bindings are exposed in the global scope.
  // In ES module mode, use the useEnv function instead to fetch environment variables.
  // 
  // let env = useEnv(); 
  // 
  // fetch(env.API_URL, ...); 
  
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