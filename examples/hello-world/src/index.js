import { createRoot } from "seniman";
import { serve } from "seniman/server";

function App() {
  return <div>Hello World</div>;
}

let root = createRoot(App);
serve(root, 3002);