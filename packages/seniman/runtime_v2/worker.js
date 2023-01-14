import { parentPort, workerData } from 'node:worker_threads';
import { Window } from './window.js';
import fs from 'node:fs';

console.log('Starting worker');

parentPort.on('message', async (msg) => {
    if (msg.type == 'new_window') {
        console.log('new window');
        let { windowId, initialPath, cookieString, port2 } = msg;

        let window = new Window(windowId, initialPath, cookieString, build, port2);
        windowMap.set(windowId, window);

        window.onDestroy(() => {
            windowMap.delete(windowId);

            parentPort.postMessage({ type: 'window_destroyed', windowId });
        });
    } else if (msg.type == 'reconnect_window') {
        let { windowId, cookieString, readOffset } = msg;
        windowMap.get(windowId).reconnect(cookieString, readOffset);
    } else if (msg.type == 'disconnect_window') {
        let { windowId } = msg;

        if (windowMap.has(windowId)) {
            windowMap.get(windowId).disconnect();
        }
    }
});

let windowMap = new Map();
let buildPath = workerData.buildPath;

let importStartTime = performance.now();

let platformComponent = await import(buildPath + '/_platform.js');

// TODO: set rootComponent path from config value instead of hardcoding
let RootComponent = (await import(buildPath + '/RootComponent.js')).default;

let build = {
    HeadTag: platformComponent.HeadTag,
    BodyTag: platformComponent.BodyTag,
    RootComponent: RootComponent,

    compressionCommandBuffer: await (fs.promises.readFile(buildPath + '/compression-command.bin')),
    globalCss: (await (fs.promises.readFile(buildPath + '/global.css'))).toString()
};

try {
    build.syntaxErrors = JSON.parse(await fs.promises.readFile(buildPath + '/SyntaxErrors.json'));
} catch (e) {
    console.log('No syntax errors.');
    //build.rootComponent = (await import(buildPath + '/RootComponent.js')).default;
}

console.log('import time', performance.now() - importStartTime);

