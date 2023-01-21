import fs from 'node:fs';
import process from 'node:process';

import { nanoid } from 'nanoid';
import express from 'express';
import expressWs from 'express-ws';
import { Worker, SHARE_ENV, MessageChannel } from 'node:worker_threads';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(new URL(import.meta.url)));

let windowPortMap = new Map();
let wsSet = new Set();

let _buildPath;
let _worker;

function getMemoryUsage() {
    const used = process.memoryUsage();
    return {
        rss: (used.rss / 1024 / 1024).toFixed(2),
        heapUsed: (used.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (used.heapTotal / 1024 / 1024).toFixed(2)
    };
}

let clearSockets = () => {
    wsSet.forEach(ws => {
        // 3001 WS exit code is reconnect (without page reload), 3002 is full page reload.
        ws.close(3001);
    });
}

//console.log("IN SERVER");

export function updateBuildDev() {
    windowPortMap = new Map();

    clearSockets();

    _reloadWorker();
}

let windowWsMap = new Map();

function wsHandler(ws, req) {
    let splitUrl = req.url.split('?')[1].split(':');
    let windowId = splitUrl[0];
    let currentPath = splitUrl[1];
    let readOffset = parseInt(splitUrl[2]);

    let cookieHeaderString = req.headers.cookie || '';
    let windowPort1;

    if (windowId) {

        if (windowPortMap.has(windowId)) {
            windowPort1 = windowPortMap.get(windowId);
            _reconnectWindowInWorker(windowId, readOffset, cookieHeaderString);
        } else {
            ws.close(3001);
            return;
        }
    } else {
        windowId = nanoid();

        console.log('creating window', windowId);
        windowPort1 = _createWindowInWorker(windowId, currentPath, cookieHeaderString);
        windowPortMap.set(windowId, windowPort1);
    }

    let portToWsForwarderFn = msg => {
        ws.send(Buffer.from(msg.arrayBuffer, msg.offset, msg.size));
    }

    // forward the message from the window within the worker to the websocket connection
    windowPort1.on('message', portToWsForwarderFn);

    ws.on('message', (message) => {
        windowPort1.postMessage(message);
    });

    if (windowWsMap.has(windowId)) {
        let oldWs = windowWsMap.get(windowId);
        oldWs.close();
    }

    windowWsMap.set(windowId, ws);
    wsSet.add(ws);

    ws.on('close', (code) => {
        console.log('closed WS', code, getMemoryUsage());

        // sometimes the ws is closed by force with a newer ws
        if (windowWsMap.get(windowId) == ws) {

            // if this is WS closing because of development worker reloading,
            // no need to disconnect the window-in-worker.
            if (code != 3001) {
                _disconnectWindowInWorker(windowId);
            }

            windowWsMap.delete(windowId);
        }

        windowPort1.removeListener('message', portToWsForwarderFn);
        wsSet.delete(ws);
    });
}

/*
setInterval(() => {
    console.log(getMemoryUsage());
}, 3000);
*/

function _createWorkerThread() {

    console.log('init worker');
    _worker = new Worker(__dirname + '/worker.js', { env: SHARE_ENV, workerData: { buildPath: _buildPath } });

    _worker.on('message', (msg) => {
        //console.log('msg', msg);

        if (msg.type == 'window_destroyed') {
            console.log('window_destroyed', msg.windowId, getMemoryUsage());

            // TODO: close port? (port.close())
            windowPortMap.delete(msg.windowId);
        }
    });
}

function _createWindowInWorker(windowId, initialPath, cookieString) {
    let { port1, port2 } = new MessageChannel();

    _worker.postMessage({ type: 'new_window', windowId, initialPath, cookieString, port2 }, [port2]);

    return port1;
}

function _reconnectWindowInWorker(windowId, cookieString, readOffset) {
    _worker.postMessage({ type: 'reconnect_window', windowId, cookieString, readOffset });
}

function _disconnectWindowInWorker(windowId) {
    _worker.postMessage({ type: 'disconnect_window', windowId });
}

function _reloadWorker() {
    _worker.terminate();
    _createWorkerThread();
}


//////////////

const favicon = Buffer.from('AAABAAEAEBAQAAAAAAAoAQAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAgAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAA/4QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEREQAAAAAAEAAAEAAAAAEAAAABAAAAEAAAAAAQAAAQAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAEAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//wAA//8AAP//AAD8HwAA++8AAPf3AADv+wAA7/sAAP//AAD//wAA+98AAP//AAD//wAA//8AAP//AAD//wAA', 'base64');

export async function createServer({ port, buildPath }) {

    let htmlBuffers = {
        br: await fs.promises.readFile(buildPath + "/index.html.brotli"),
        gzip: await fs.promises.readFile(buildPath + "/index.html.gz"),
        uncompressed: await fs.promises.readFile(buildPath + "/index.html"),
    };

    _buildPath = buildPath;

    _createWorkerThread();

    let app = express();
    expressWs(app);

    app.ws('/', (ws, req) => {

        try {
            wsHandler(ws, req);
        } catch (e) {
            console.error(e);
        }
    });

    app.use('/static', express.static(buildPath + '/public', { maxAge: 3600000 }));

    app.get('/favicon.ico', function (req, res) {
        res.statusCode = 200;
        res.setHeader('Content-Length', favicon.length);
        res.setHeader('Content-Type', 'image/x-icon');
        res.setHeader("Cache-Control", "public, max-age=2592000");                // expiers after a month
        res.setHeader("Expires", new Date(Date.now() + 2592000000).toUTCString());
        res.end(favicon);
    });

    let prebuiltHeaders = {
        'Content-Type': 'text/html',
        'Vary': 'Accept',
        'Cache-Control': 'no-store'
    };
    app.disable('x-powered-by');

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
        res.removeHeader("Date");

        if (algo) {
            res.set('Content-Encoding', algo);
        }

        res.end(html);
    });

    app.listen(port);

    console.log('Listening on port', port);
}