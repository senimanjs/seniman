import { WebSocketServer } from 'ws';
import { build } from '../build.js';
import { windowManager } from '../v2/window_manager.js';

export function wrapExpress(app, options) {

  windowManager.registerEntrypoint(options);

  let htmlBuffers = build.htmlBuffers;

  let prebuiltHeaders = {
    'Content-Type': 'text/html',
    'Vary': 'Accept',
    'Cache-Control': 'no-store'
  };

  app.get('*', async function (req, res) {

    let acceptEncoding = req.headers['accept-encoding'] || '';
    let algo;
    let html;

    if (acceptEncoding.indexOf('br') > -1) {
      algo = 'br';
      html = htmlBuffers.br;
    } else if (acceptEncoding.indexOf('gzip') > -1) {
      algo = 'gzip';
      html = htmlBuffers.gzip;
    } else {
      html = htmlBuffers.uncompressed;
    }

    res.set(prebuiltHeaders);

    if (algo) {
      res.set('Content-Encoding', algo);
    }

    res.end(html);
  });

  // capture the existing app.listen function, and wrap it in a new function
  // that will also start the websocket server
  let oldListen = app.listen;

  app.listen = function (port, host, backlog, callback) {

    const wsServer = new WebSocketServer({ noServer: true });

    let server = oldListen.call(app, port, host, backlog, callback);

    server.on('upgrade', (request, socket, head) => {
      wsServer.handleUpgrade(request, socket, head, ws => {
        windowManager.applyNewConnection(ws, request);
      });
    });

    return server;
  }
}