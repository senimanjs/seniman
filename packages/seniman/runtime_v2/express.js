import { WebSocketServer } from 'ws';
import { build } from './build.js';
import { windowManager } from './window_manager.js';

function wsHandler(options, ws, req) {

  let splitUrl = req.url.split('?')[1].split(':');
  let windowId = splitUrl[0];
  let readOffset = parseInt(splitUrl[1]);
  let viewportSize = splitUrl[2].split('x').map((num) => parseInt(num));
  let currentPath = splitUrl[3];

  // TODO: get ip address of request and pass it to the window manager
  // let ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  let cookieString = req.headers.cookie || '';

  let pageParams = {
    windowId,
    currentPath,
    viewportSize,
    readOffset,
    cookieString
  };

  windowManager.applyNewConnection(ws, pageParams);
}

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

    wsServer.on('connection', (socket, req) => {
      wsHandler(options, socket, req);
    });

    let server = oldListen.call(app, port, host, backlog, callback);

    server.on('upgrade', (request, socket, head) => {
      wsServer.handleUpgrade(request, socket, head, socket => {
        wsServer.emit('connection', socket, request);
      });
    });

    return server;
  }
}