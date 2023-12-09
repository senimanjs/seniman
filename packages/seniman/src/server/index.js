import fs from 'node:fs';
import { createServer as httpCreateServer } from 'http';
import { WebSocketServer } from 'ws';
import { windowManager } from '../window_manager.js';

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

export function createServer(options) {

  windowManager.registerEntrypoint(options);

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

    let response = await windowManager.getResponse({ url, headers, ipAddress, htmlBuffers });

    res.writeHead(response.statusCode, response.headers);
    res.end(response.body);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', function upgrade(req, socket, head) {
    wss.handleUpgrade(req, socket, head, ws => {
      let headers = new HeaderWrapper(req.headers);
      let url = req.url;
      let ipAddress = headers.get('x-forwarded-for') || req.socket.remoteAddress;
      windowManager.applyNewConnection(ws, { url, headers, ipAddress, htmlBuffers });
    });
  });

  return server;
}