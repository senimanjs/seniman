import { useState } from "seniman";
import { createServer } from "seniman/server";

function Body() {
  let [getCount, setCount] = useState(0);
  let onClick = () => setCount((count) => count + 1);

  return (
    <div class="hello-world">
      Hello World! {getCount()}
      <button onClick={onClick}>Add +</button>
    </div>
  );
}

let server = createServer({ Body });

server.listen(3002);
