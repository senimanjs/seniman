import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import { buildOriginCheckerFunction } from '../helpers.js';
import { createRoot } from '../window_manager.js';

// TODO: apply new rendering code path to this vanilla server

let senimanLibraryPath = process.cwd() + '/node_modules/seniman/dist';
let frontendBundlePath = senimanLibraryPath + '/frontend-bundle';

let htmlBuffers = {
  br: fs.readFileSync(frontendBundlePath + "/index.html.brotli.bin"),
  gzip: fs.readFileSync(frontendBundlePath + "/index.html.gz.bin"),
  uncompressed: fs.readFileSync(frontendBundlePath + "/index.html"),
};

class HeaderWrapper {
  constructor(headers) {
    this.headers = headers;
  }

  get(name) {
    return this.headers[name.toLowerCase()];
  }
}

export function wrapExpress(app, root, options = {}) {

  // check if root is the old { Body } parameter
  // if yes, then ask to wrap it in createRoot before passing it in
  if (typeof root == "object" && root.Body) {
    console.warn(`
    Calling wrapExpress(app, { Body }) is deprecated in seniman@0.0.133. 
    Please wrap your root component in createRoot(Body) from the \`seniman\` package before passing it to wrapExpress(app, root).
    We've wrapped it internally for you in this version.
    `);

    root = createRoot(root.Body);
  }

  let allowedOriginChecker = buildOriginCheckerFunction(options.allowedOrigins);

  app.get('*', async function (req, res) {

    let headers = new HeaderWrapper(req.headers);
    let url = req.url;
    let ipAddress = headers.get('x-forwarded-for') || req.socket.remoteAddress;
    let isSecure = req.secure;

    let response = await root.getHtmlResponse({ url, headers, ipAddress, isSecure, htmlBuffers });

    if (response.statusCode) {
      res.status(response.statusCode);
    }

    res.set(response.headers);
    res.end(response.body);
  });

  // capture the existing app.listen function, and wrap it in a new function
  // that will also start the websocket server
  let oldListen = app.listen;

  app.listen = function (port, host, backlog, callback) {
    let server = oldListen.call(app, port, host, backlog, callback);

    const wsServer = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      if (!allowedOriginChecker(req.headers.origin)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wsServer.handleUpgrade(req, socket, head, ws => {
        let headers = new HeaderWrapper(req.headers);
        let url = req.url;
        let ipAddress = headers.get('x-forwarded-for') || req.socket.remoteAddress;

        root.applyNewConnection(ws, { url, headers, ipAddress, htmlBuffers });
      });
    });

    return server;
  }
}