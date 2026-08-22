import express from 'express';
import { createRoot, useState } from 'seniman';
import { createEntrypoint } from 'seniman/node';

function App() {
  const [getCount, setCount] = useState(0);

  return (
    <div>
      <h1>Hello World</h1>
      <p>Count: {getCount()}</p>
      <button onClick={() => setCount(count => count + 1)}>
        Increment
      </button>
    </div>
  );
}

const app = express();
const entrypoint = createEntrypoint(createRoot(App));

app.get('/api/health', (_request, response) => response.send('ok'));
app.use(entrypoint.request);

const port = Number(process.env.PORT ?? 3002);
const server = app.listen(port);
server.on('upgrade', entrypoint.upgrade);

console.log('Listening on port', port);
