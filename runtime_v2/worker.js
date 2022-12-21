import { parentPort, workerData } from 'node:worker_threads';
import { Window } from './window.js';
import fs from 'node:fs';

let windowMap = new Map();
let buildPath = workerData.buildPath;


let importStartTime = performance.now();

// TODO: set rootComponent path from config value instead of hardcoding
let platformComponent = await import(buildPath + '/_platform.js');

let build = {
    HeadTag: platformComponent.HeadTag,
    BodyTag: platformComponent.BodyTag,

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

parentPort.on('message', async (msg) => {

    if (msg.type == 'new_window') {
        console.log('new window');
        let { windowId, initialPath, clientIdentifier, port2 } = msg;

        let window = new Window(windowId, initialPath, clientIdentifier, build, port2);
        windowMap.set(windowId, window);

        window.onDestroy(() => {
            windowMap.delete(windowId);

            parentPort.postMessage({ type: 'window_destroyed', windowId });
        });

    } else if (msg.type == 'reconnect_window') {
        let { windowId, clientIdentifier, readOffset } = msg;

        windowMap.get(windowId).reconnect(clientIdentifier, readOffset);

    } else if (msg.type == 'disconnect_window') {
        let { windowId } = msg;

        if (windowMap.has(windowId)) {
            windowMap.get(windowId).disconnect();
        }
    }
});
