import fs from 'node:fs';
import process from 'node:process';
import { Window } from './window.js';

// get ram limit from env var
let RSS_LOW_MEMORY_THRESHOLD = process.env.RSS_LOW_MEMORY_THRESHOLD ? parseInt(process.env.RSS_LOW_MEMORY_THRESHOLD) : 180;

class WindowManager {

    constructor() {
        this.windowMap = new Map();

        this._runWindowsLifecycleManagement();
    }

    _runWindowsLifecycleManagement() {

        this.pingInterval = setInterval(() => {
            let now = Date.now();

            // get RSS memory usage
            let rss = process.memoryUsage().rss / 1024 / 1024;

            let isLowMemory = rss > RSS_LOW_MEMORY_THRESHOLD;

            if (isLowMemory) {
                console.log('Low memory detected, RSS:', rss);
            }

            for (let window of this.windowMap.values()) {
                let pongDiff = now - window.lastPongTime;

                if (pongDiff >= 4000) {
                    window.connected = false;
                }

                if (!window.connected) {
                    let destroyTimeout = 25000;

                    if (isLowMemory || pongDiff >= destroyTimeout) {
                        window.destroy();
                        continue;
                    }
                }

                window.sendPing();
                window.flushBlockDeleteQueue();
            }
        }, 2500);
    }

    async initWindow(windowId, initialPath, cookieString, port2) {

        let build = await loadBuild();

        let window = new Window(windowId, initialPath, cookieString, build, port2);

        this.windowMap.set(windowId, window);

        window.onDestroy(() => {
            this.windowMap.delete(windowId);

            if (this.windowDestroyCallback) {
                this.windowDestroyCallback(windowId);
            }
        });
    }

    onWindowDestroy(callback) {
        this.windowDestroyCallback = callback;
    }

    reconnectWindow(msg) {
        let { windowId, cookieString, readOffset } = msg;

        this.windowMap.get(windowId).reconnect(cookieString, readOffset);
    }

    disconnectWindow(windowId) {
        if (this.windowMap.has(windowId)) {
            this.windowMap.get(windowId).disconnect();
        }
    }

    loadBuild(path) {
        loadBuild(path);
    }
}


export const windowManager = new WindowManager();

let cachedBuild = null;
let buildLoadStartedPromise = null;

export const loadBuild = async (buildPath) => {

    if (buildLoadStartedPromise) {

        if (cachedBuild) {
            return cachedBuild;
        }

        return buildLoadStartedPromise;
    } else {

        buildLoadStartedPromise = new Promise(async (resolve, reject) => {

            // track function time
            let startTime = performance.now();

            let [PlatformModule, IndexModule, compressionCommandBuffer, reverseIndexMap, globalCssBuffer] = await Promise.all([
                import(buildPath + '/_platform.js'),

                // TODO: set rootComponent path from config value instead of hardcoding
                import(buildPath + '/index.js'),
                fs.promises.readFile(buildPath + '/compression-command.bin'),
                fs.promises.readFile(buildPath + '/reverse-index-map.json'),
                fs.promises.readFile(buildPath + '/global.css')
            ]);

            let build = {
                PlatformModule,
                IndexModule,
                reverseIndexMap: JSON.parse(reverseIndexMap),
                compressionCommandBuffer: compressionCommandBuffer,
                globalCss: globalCssBuffer.toString()
            };

            try {
                build.syntaxErrors = JSON.parse(await fs.promises.readFile(buildPath + '/SyntaxErrors.json'));
            } catch (e) {
                console.log('No syntax errors.');
                //build.rootComponent = (await import(buildPath + '/RootComponent.js')).default;
            }

            console.log('load time:', performance.now() - startTime);
            console.log('build loaded.');
            cachedBuild = build;
            resolve(build);
        });

        return buildLoadStartedPromise;
    }
}
