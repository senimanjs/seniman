import { createServer as httpCreateServer } from 'http';
import { WebSocketServer } from 'ws';
import { build } from '../build.js';
import { windowManager } from '../window_manager.js';


// TODO: apply new rendering code path to this vanilla server

export function createServer(options) {

  windowManager.registerEntrypoint(options);

  let htmlBuffers = build.htmlBuffers;

  const server = httpCreateServer(function (req, res) {

    // handle favicon.ico request specially
    // TODO: add option to load custom favicon
    if (req.url === '/favicon.ico') {
      res.writeHead(204, { 'Content-Type': 'image/x-icon' });
      res.end();
      return;
    }

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

  server.on('upgrade', function upgrade(request, socket, head) {
    wss.handleUpgrade(request, socket, head, ws => {
      windowManager.applyNewConnection(ws, request);
    });
  });

  return server;
}