import fs from 'node:fs';
import { createServer as httpCreateServer } from 'http';
import { WebSocketServer } from 'ws';

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

export function createServer(options) {

  windowManager.prepareBuild(options);

  // read config
  let buildPath = process.cwd() + '/dist';

  let htmlBuffers = {
    br: fs.readFileSync(buildPath + "/index.html.brotli"),
    gzip: fs.readFileSync(buildPath + "/index.html.gz"),
    uncompressed: fs.readFileSync(buildPath + "/index.html"),
  };

  const server = httpCreateServer(function (req, res) {

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

    let headers = {
      'Content-Type': 'text/html',
      'Vary': 'Accept',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(html)
    }

    if (algo) {
      headers['Content-Encoding'] = algo;
    }
    res.writeHead(200, headers);
    res.end(html);
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', function connection(socket, req) {
    wsHandler(options, socket, req);
  });

  server.on('upgrade', function upgrade(request, socket, head) {
    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit('connection', ws, request);
    });
  });

  return server;
}