import { createRoot, useState } from "seniman";
import { serve } from "seniman/server";

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
serve(root, 3002);