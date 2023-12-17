import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import { windowManager } from '../window_manager.js';
import { buildOriginCheckerFunction } from '../helpers.js';

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

export function wrapExpress(app, options) {

  windowManager.registerEntrypoint(options);

  let allowedOriginChecker = buildOriginCheckerFunction(options.allowedOrigins);

  app.get('*', async function (req, res) {

    if (!allowedOriginChecker(req.headers.host)) {
      res.status(401).end();
      return;
    }

    let headers = new HeaderWrapper(req.headers);
    let url = req.url;
    let ipAddress = headers.get('x-forwarded-for') || req.socket.remoteAddress;

    let response = await windowManager.getResponse({ url, headers, ipAddress, htmlBuffers });

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

        windowManager.applyNewConnection(ws, { url, headers, ipAddress, htmlBuffers });
      });
    });

    return server;
  }
}