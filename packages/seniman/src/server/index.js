import { createServer as httpCreateServer } from 'http';
import { WebSocketServer } from 'ws';
import { createRoot } from '../window_manager.js';
import { buildOriginCheckerFunction } from '../helpers.js';


class HeaderWrapper {
  constructor(headers) {
    this.headers = headers;
  }

  get(name) {
    return this.headers[name.toLowerCase()];
  }
}

export function createServer(root, options = {}) {

  // check if root is the old { Body } parameter
  // if yes, then ask to wrap it in createRoot before passing it in
  if (typeof root == "object" && root.Body) {
    console.warn(`
    Calling createServer({ Body }) is deprecated in seniman@0.0.133. 
    Please wrap your Body component in createRoot(Body) from the \`seniman\` package before passing it to createServer(root).
    We've wrapped it internally for you in this version.
    `);

    root = createRoot(root.Body);
  }

  let allowedOriginChecker = buildOriginCheckerFunction(options.allowedOrigins);

  const server = httpCreateServer(async function (req, res) {

    // handle favicon.ico request specially
    // TODO: add option to load custom favicon
    if (req.url === '/favicon.ico') {
      res.writeHead(204, { 'Content-Type': 'image/x-icon' });
      res.end();
      return;
    }

    let headers = new HeaderWrapper(req.headers);
    let url = req.url;
    let ipAddress = headers.get('x-forwarded-for') || req.socket.remoteAddress;

    // TODO: have the logic be configurable?
    let isSecure = req.headers['x-forwarded-proto'] == 'https';

    let response = await root.getHtmlResponse({ url, headers, ipAddress, isSecure });

    res.writeHead(response.statusCode, response.headers);
    res.end(response.body);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', function upgrade(req, socket, head) {

    if (!allowedOriginChecker(req.headers.origin)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, ws => {
      let headers = new HeaderWrapper(req.headers);
      let url = req.url;
      let ipAddress = headers.get('x-forwarded-for') || req.socket.remoteAddress;
      root.applyNewConnection(ws, { url, headers, ipAddress });
    });
  });

  return server;
}

export function serve(root, port) {
  let server = createServer(root);
  server.listen(port);

  console.log("[START] Server started at port", port);
}