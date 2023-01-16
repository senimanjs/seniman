import { parentPort, workerData } from 'node:worker_threads';
import { initWindow, loadBuild } from './window.js';

console.log('Starting worker');

let windowMap = new Map();
let buildPath = workerData.buildPath;

parentPort.on('message', async (msg) => {
    if (msg.type == 'new_window') {
        console.log('new window');
        let { windowId, initialPath, cookieString, port2 } = msg;

        let window = await initWindow(windowId, initialPath, cookieString, buildPath, port2);
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

loadBuild(workerData.buildPath);