import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import { windowManager, loadBuild } from './window_manager.js';

function wsHandler(options, ws, req) {

  let splitUrl = req.url.split('?')[1].split(':');
  let windowId = splitUrl[0];
  let currentPath = splitUrl[1];
  let readOffset = parseInt(splitUrl[2]);

  // TODO: get ip address of request and pass it to the window manager
  // let ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  let cookieHeaderString = req.headers.cookie || '';

  windowManager.applyNewConnection(ws, windowId, readOffset, currentPath, cookieHeaderString);
}

export async function wrapExpress(app, options) {

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

  // read config
  let buildPath = process.cwd() + '/dist';

  let htmlBuffers = {
    br: await fs.promises.readFile(buildPath + "/index.html.brotli"),
    gzip: await fs.promises.readFile(buildPath + "/index.html.gz"),
    uncompressed: await fs.promises.readFile(buildPath + "/index.html"),
  };

  windowManager.prepareBuild(options);

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
}