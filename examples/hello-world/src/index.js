import { createRoot, useState } from "seniman";
import { createServer } from "seniman/server";

function App() {
  let [getCount, setCount] = useState(0);
  let onClick = () => setCount((count) => count + 1);

  return (
    <div class="hello-world">
      Hello World! {getCount()}
      <button onClick={onClick}>Add +</button>
    </div>
  );
}

let root = createRoot(App);

let server = createServer(root);
server.listen(3002);

console.log("Server started on port 3002");