import { createServer } from 'node:http';
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

const entrypoint = createEntrypoint(createRoot(App));
const server = createServer((request, response) => {
  if (request.url === '/api/health') {
    response.end('ok');
    return;
  }

  entrypoint.request(request, response);
});

server.on('upgrade', entrypoint.upgrade);
server.listen(3002);
