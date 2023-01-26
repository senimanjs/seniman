import fs from 'node:fs';
import process from 'node:process';

import { nanoid } from 'nanoid';
import express from 'express';
import expressWs from 'express-ws';

import { windowManager, loadBuild } from './window_manager.js';

function getMemoryUsage() {
    const used = process.memoryUsage();
    return {
        rss: (used.rss / 1024 / 1024).toFixed(2),
        heapUsed: (used.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (used.heapTotal / 1024 / 1024).toFixed(2)
    };
}

function wsHandler(ws, req) {
    let splitUrl = req.url.split('?')[1].split(':');
    let windowId = splitUrl[0];
    let currentPath = splitUrl[1];
    let readOffset = parseInt(splitUrl[2]);

    // TODO: get ip address of request and pass it to the window manager
    // let ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    let cookieHeaderString = req.headers.cookie || '';

    if (windowId) {
        if (windowManager.hasWindow(windowId)) {
            windowManager.reconnectWindow(windowId, currentPath, cookieHeaderString, ws, readOffset);
        } else {
            ws.close(3001);
            return;
        }
    } else {
        windowId = nanoid();
        console.log('creating window', windowId);

        windowManager.initWindow(windowId, currentPath, cookieHeaderString, ws);
    }

    ws.on('close', (code) => {
        console.log('closed WS', code, getMemoryUsage());
    });
}


//////////////

const favicon = Buffer.from('AAABAAEAEBAQAAAAAAAoAQAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAgAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAA/4QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEREQAAAAAAEAAAEAAAAAEAAAABAAAAEAAAAAAQAAAQAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAEAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//wAA//8AAP//AAD8HwAA++8AAPf3AADv+wAA7/sAAP//AAD//wAA+98AAP//AAD//wAA//8AAP//AAD//wAA', 'base64');

export async function createServer({ port, buildPath }) {

    let htmlBuffers = {
        br: await fs.promises.readFile(buildPath + "/index.html.brotli"),
        gzip: await fs.promises.readFile(buildPath + "/index.html.gz"),
        uncompressed: await fs.promises.readFile(buildPath + "/index.html"),
    };

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
        res.setHeader("Cache-Control", "public, max-age=2592000");
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

    loadBuild(buildPath);
}