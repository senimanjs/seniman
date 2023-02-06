import process from 'node:process';
import { FastRateLimit } from 'fast-ratelimit';
import { nanoid } from 'nanoid';

import { Window } from './window.js';

// get ram limit from env var
const RSS_LOW_MEMORY_THRESHOLD = process.env.RSS_LOW_MEMORY_THRESHOLD ? parseInt(process.env.RSS_LOW_MEMORY_THRESHOLD) : 0;
const RSS_LOW_MEMORY_THRESHOLD_ENABLED = RSS_LOW_MEMORY_THRESHOLD > 0;

console.log('RSS_LOW_MEMORY_THRESHOLD', RSS_LOW_MEMORY_THRESHOLD + 'MB');

function getMemoryUsage() {
    const used = process.memoryUsage();
    return {
        rss: (used.rss / 1024 / 1024).toFixed(2),
        heapUsed: (used.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (used.heapTotal / 1024 / 1024).toFixed(2)
    };
}

class ExternalPromise {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })
    }

    then(resolve, reject) {
        return this.promise.then(resolve, reject)
    }

    catch(reject) {
        return this.promise.catch(reject)
    }
}

class WindowManager {

    constructor() {
        this.windowMap = new Map();

        this._runWindowsLifecycleManagement();

        this.queue = [];
        this.emptyQueuePromise = new ExternalPromise();

        // TODO: we'll want to make this configurable & broadcast
        // this to the client so that they can adjust their message
        // sending rate accordingly -- i.e. we'll catch mostly the bad actors
        // here and not good actors sending too many messages in some chatty part
        // of the app
        this.messageLimiter = new FastRateLimit({
            /*
            threshold: 8,
            ttl: 2
            */
            threshold: 16,
            ttl: 2
        });

        this.loopAwaiting = true;
        this.loopWaitPromise = new ExternalPromise();
        this.pendingWindowList = [];

        this._runLoop();
    }

    hasWindow(windowId) {
        return this.windowMap.has(windowId);
    }

    async _runLoop() {
        await this.loopWaitPromise;

        while (true) {
            let allocWindow = this._getNextWindowAllocation();

            if (allocWindow) {
                // TODO: pass amount of allowed work to do in this window
                allocWindow.scheduleWork();
            } else {
                this.loopAwaiting = true;
                this.loopWaitPromise = new ExternalPromise();
                await this.loopWaitPromise;
            }
        }
    }

    _getNextWindowAllocation() {

        let nextWindow = this.pendingWindowList.shift();

        if (!nextWindow) {
            return null;
        }

        nextWindow.isPending = false;
        return nextWindow;
    }

    _enqueueMessage(window, message) {

        // TODO:
        // check rate of windowId messages in the last sliding window
        // 3 possible outputs:
        // LOW, HIGH, EXCEEDS_LIMIT

        let isUnderLimit = this.messageLimiter.consumeSync(window.id);

        // if EXCEEDS_LIMIT, we'll drop the message rather than enqueue it
        // for other cases, we'll enqueue the message
        if (!isUnderLimit) {
            // TODO: we probably want to also close the window's connection or even destroy the window
            return;
        }

        /*

        TODO:
        
        In here, we'll do stuff differently based on if the window has HIGH or LOW message rates.
        We want to prioritize windows with LOW message rates, so we'll do the following:
        - If the window has LOW message rates, we'll enqueue the message in the primary queue
        - If the window has HIGH message rates, we'll enqueue the message in the secondary queue

        The secondary queue will be processed after the primary queue is empty. If too much time has 
        elapsed since the last time the secondary queue was processed, we'll start processing the secondary
        until we see a message with a recent enough timestamp -- and we'll start switching back to the primary
        queue.

        A window is always either in the primary or secondary queue. We won't promote back a window
        to the primary queue if its message rate has not dropped to LOW.

        */

        window.enqueueMessage(message);

        if (!window.isPending) {
            this.pendingWindowList.push(window);
            window.isPending = true;
        }

        if (this.loopAwaiting) {
            this.loopAwaiting = false;
            this.loopWaitPromise.resolve();
        }

    }

    _runWindowsLifecycleManagement() {

        this.pingInterval = setInterval(() => {
            let now = Date.now();

            // get RSS memory usage
            let rss = process.memoryUsage().rss / 1024 / 1024;

            let isLowMemory = RSS_LOW_MEMORY_THRESHOLD_ENABLED && rss > RSS_LOW_MEMORY_THRESHOLD;

            if (isLowMemory) {
                console.log('Low memory detected, RSS:', rss);
            }

            for (let window of this.windowMap.values()) {
                let pongDiff = now - window.lastPongTime;

                if (pongDiff >= 6000) {
                    window.connected = false;
                }

                if (!window.connected) {
                    let destroyTimeout = 60000;

                    if (isLowMemory || pongDiff >= destroyTimeout) {
                        window.destroy();
                        continue;
                    }
                }

                window.sendPing();

                // TODO: move this inside the window class
                window.flushBlockDeleteQueue();
            }
        }, 2500);
    }

    applyNewConnection(ws, req) {

        let params = new URLSearchParams(req.url.split('?')[1]);

        // then, get the values from the params object
        let windowId = params.get('wi') || '';
        let readOffset = parseInt(params.get('ro'));
        let viewportSize = params.get('vs').split('x').map((num) => parseInt(num));
        let currentPath = params.get('lo');

        // TODO: get ip address of request and do rate limiting based on ip address
        // let ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        let cookieString = req.headers.cookie || '';

        let pageParams = {
            windowId,
            currentPath,
            viewportSize,
            readOffset,
            cookieString,
        };

        if (windowId) {
            if (this.hasWindow(windowId)) {
                this.reconnectWindow(ws, pageParams);
            } else {
                ws.close(3001);
                return;
            }
        } else {
            let newWindowId = nanoid();
            pageParams.windowId = newWindowId;
            this.initWindow(ws, pageParams);
        }
    }

    initWindow(ws, pageParams) {
        let { windowId } = pageParams;

        // TODO: pass request's ip address here, and rate limit window creation based on ip address
        let window = new Window(ws, pageParams, { Head: this.Head, Body: this.Body });

        this.windowMap.set(windowId, window);

        this._setupWs(ws, window);

        window.onDestroy(() => {
            console.log('destroyed', windowId, getMemoryUsage());

            this.windowMap.delete(windowId);

            if (this.windowDestroyCallback) {
                this.windowDestroyCallback(windowId);
            }
        });
    }

    reconnectWindow(ws, pageParams) {

        let window = this.windowMap.get(pageParams.windowId);
        window.reconnect(ws, pageParams);

        this._setupWs(ws, window);
    }

    _setupWs(ws, window) {
        ws.on('message', async (message) => {
            this._enqueueMessage(window, message);
        });

        ws.on('close', () => {
            this.disconnectWindow(window.id);
        });
    }

    onWindowDestroy(callback) {
        this.windowDestroyCallback = callback;
    }

    disconnectWindow(windowId) {
        if (this.windowMap.has(windowId)) {
            this.windowMap.get(windowId).disconnect();
        }
    }

    closeAllWindows() {
        for (let window of this.windowMap.values()) {
            window.destroy();
        }
    }

    registerEntrypoint(options) {
        this.Head = options.Head || EmptyHead;
        this.Body = options.Body;
    }
}

function EmptyHead() {
    return null;
}

export const windowManager = new WindowManager();