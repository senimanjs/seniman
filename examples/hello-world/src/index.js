import { createRoot, useState } from "seniman";
import { createServer } from "seniman/server";

function App() {
  return <div>Hello World</div>;
}

let root = createRoot(App);

let server = createServer(root);
server.listen(3002);