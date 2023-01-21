import { parentPort, workerData } from 'node:worker_threads';

import { windowManager } from './window_manager.js';

console.log('Starting worker');

parentPort.on('message', async (msg) => {
    if (msg.type == 'new_window') {
        console.log('new window');
        let { windowId, initialPath, cookieString, port2 } = msg;

        windowManager.initWindow(windowId, initialPath, cookieString, port2);
    } else if (msg.type == 'reconnect_window') {
        windowManager.reconnectWindow(msg);
    } else if (msg.type == 'disconnect_window') {
        let { windowId } = msg;
        windowManager.disconnectWindow(windowId);
    }
});


windowManager.onWindowDestroy(windowId => {
    parentPort.postMessage({ type: 'window_destroyed', windowId });
})

windowManager.loadBuild(workerData.buildPath);