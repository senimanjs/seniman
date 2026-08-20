import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createWebSocketServerOptions } from './helpers.js';
import { createCoreEntrypoint } from './entrypoint.js';

class NodeHeaders {
  constructor(headers) {
    this.headers = headers;
  }

  get(name) {
    let value = this.headers[name.toLowerCase()];
    return Array.isArray(value) ? value.join(', ') : value ?? null;
  }
}

function getUrl(req) {
  let protocol = req.headers['x-forwarded-proto'] ||
    (req.socket.encrypted ? 'https' : 'http');
  return `${protocol}://${req.headers.host || 'localhost'}${req.url}`;
}

function getRequest(req) {
  return {
    url: getUrl(req),
    method: req.method,
    headers: new NodeHeaders(req.headers),
  };
}

export function createEntrypoint(root, options = {}) {
  let core = createCoreEntrypoint(root, options);
  let websocketServer = new WebSocketServer(
    createWebSocketServerOptions(options)
  );

  async function request(req, res) {
    try {
      let response = await core.render(getRequest(req), {
        ipAddress: req.socket.remoteAddress,
      });

      res.writeHead(response.statusCode, response.headers);
      res.end(response.body);
    } catch (error) {
      res.writeHead(500);
      res.end('Internal Server Error');
      console.error(error);
    }
  }

  function upgrade(req, socket, head) {
    let request = getRequest(req);

    if (!core.accepts(request)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(req, socket, head, ws => {
      core.connect(request, ws, {
        ipAddress: req.socket.remoteAddress,
      });
    });
  }

  return {
    fetch: core.fetch,
    request,
    upgrade,
  };
}

export function serve(root, port, options = {}) {
  let entrypoint = createEntrypoint(root, options);
  let server = createServer(entrypoint.request);

  server.on('upgrade', entrypoint.upgrade);
  server.listen(port);

  return server;
}
