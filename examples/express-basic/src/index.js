import express from 'express';
import { createRoot } from 'seniman';
import { createEntrypoint } from 'seniman/node';

let app = express();

function App() {
  return <div>Hello World</div>;
}

let root = createRoot(App);
let entrypoint = createEntrypoint(root);
app.use(entrypoint.request);

let port = process.env.PORT || 3002;
let server = app.listen(port);
server.on('upgrade', entrypoint.upgrade);

console.log('Listening on port', port);
