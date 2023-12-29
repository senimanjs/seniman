import express from 'express';
import { createRoot } from 'seniman';
import { wrapExpress } from 'seniman/express';

let app = express();

function App() {
  return <div>Hello World</div>;
}

let root = createRoot(App);
wrapExpress(app, root);

let port = process.env.PORT || 3002;
app.listen(port);

console.log('Listening on port', port);