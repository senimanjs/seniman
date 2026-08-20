import { createRoot } from "seniman";
import { serve } from "seniman/node";

function App() {
  return <div>Hello World</div>;
}

serve(createRoot(App), 3002);
