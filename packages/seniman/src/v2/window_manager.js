import process from 'node:process';
import { FastRateLimit } from 'fast-ratelimit';
import { nanoid } from 'nanoid';

import { Window } from './window.js';

// get ram limit from env var
const RSS_LOW_MEMORY_THRESHOLD = process.env.RSS_LOW_MEMORY_THRESHOLD ? parseInt(process.env.RSS_LOW_MEMORY_THRESHOLD) : 0;
const RSS_LOW_MEMORY_THRESHOLD_ENABLED = RSS_LOW_MEMORY_THRESHOLD > 0;

if (RSS_LOW_MEMORY_THRESHOLD_ENABLED) {
  console.log('RSS_LOW_MEMORY_THRESHOLD enabled: ', RSS_LOW_MEMORY_THRESHOLD + 'MB');
}

// create RATELIMIT_WINDOW_INPUT_THRESHOLD from env var
const RATELIMIT_WINDOW_INPUT_THRESHOLD = process.env.RATELIMIT_WINDOW_INPUT_THRESHOLD ?
  parseInt(process.env.RATELIMIT_WINDOW_INPUT_THRESHOLD) : 16;
const RATELIMIT_WINDOW_INPUT_TTL_SECONDS = process.env.RATELIMIT_WINDOW_INPUT_TTL_SECONDS ?
  parseInt(process.env.RATELIMIT_WINDOW_INPUT_TTL_SECONDS) : 2;

// create RATELIMIT_WINDOW_CREATION_THRESHOLD from env var
const RATELIMIT_WINDOW_CREATION_THRESHOLD = process.env.RATELIMIT_WINDOW_CREATION_THRESHOLD ?
  parseInt(process.env.RATELIMIT_WINDOW_CREATION_THRESHOLD) : 3;
const RATELIMIT_WINDOW_CREATION_TTL_SECONDS = process.env.RATELIMIT_WINDOW_CREATION_TTL_SECONDS ?
  parseInt(process.env.RATELIMIT_WINDOW_CREATION_TTL_SECONDS) : 1;

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

let PONG_COMMAND = 0;

class WindowManager {

  constructor() {
    this.windowMap = new Map();

    this._runWindowsLifecycleManagement();

    this.loopAwaiting = true;
    this.loopWaitPromise = new ExternalPromise();

    this.pendingWorkWindowList = [];
    this.pendingInputWindowList = [];

    // TODO: we'll want to make this configurable & broadcast
    // this to the client so that they can adjust their message
    // sending rate accordingly -- i.e. we'll catch mostly the bad actors
    // here and not good actors sending too many messages in some chatty part
    // of the app
    this.messageLimiter = new FastRateLimit({
      threshold: RATELIMIT_WINDOW_INPUT_THRESHOLD,
      ttl: RATELIMIT_WINDOW_INPUT_TTL_SECONDS
    });

    this.windowCreationLimiter = new FastRateLimit({
      threshold: RATELIMIT_WINDOW_CREATION_THRESHOLD,
      ttl: RATELIMIT_WINDOW_CREATION_TTL_SECONDS
    });

    this._runLoop();
  }

  hasWindow(windowId) {
    return this.windowMap.has(windowId);
  }

  async _runLoop() {
    await this.loopWaitPromise;

    while (true) {
      // prioritize windows that need input, and allocate (maybe a small) amount of work to them rightaway
      // so the user at least can see some updates quickly
      let allocWindow = this._getNextWindowPendingInputAllocation();

      if (allocWindow) {
        allocWindow.scheduleInput();
        allocWindow.scheduleWork();
        continue;
      }

      // if there is no window that needs input processing, run the regular work scheduling
      allocWindow = this._getNextWindowPendingWorkAllocation();

      if (allocWindow) {
        // TODO: pass amount of allowed work to do in this window
        allocWindow.scheduleWork();
        continue;
      }

      //console.log('waiting for work...');
      this.loopAwaiting = true;
      this.loopWaitPromise = new ExternalPromise();
      await this.loopWaitPromise;
    }
  }

  _getNextWindowPendingInputAllocation() {

    if (this.pendingInputWindowList.length === 0) {
      return null;
    }

    return this.pendingInputWindowList.shift();
  }

  _getNextWindowPendingWorkAllocation() {

    let nextWindow = this.pendingWorkWindowList.shift();

    if (!nextWindow) {
      return null;
    }

    return nextWindow;
  }

  _enqueueMessage(window, message) {

    let isUnderLimit = this.messageLimiter.consumeSync(window.id);

    if (!isUnderLimit) {
      return;
    }

    let buffer = Buffer.from(message);

    if (buffer.readUint8(0) == PONG_COMMAND) {
      window.registerPong(buffer);
      return;
    }

    window.enqueueInputMessage(message);

    if (!window.hasPendingInput) {
      this.pendingInputWindowList.push(window);
      window.hasPendingInput = true;
    }

    if (this.loopAwaiting) {
      this.loopAwaiting = false;
      this.loopWaitPromise.resolve();
    }
  }

  requestExecution(window) {

    this.pendingWorkWindowList.push(window);

    /*
    if (!window.isPending) {
      this.pendingWindowList.push(window);
      window.isPending = true;
    }
    */

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
    let ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    let isUnderRateLimit = this.windowCreationLimiter.consumeSync(ipAddress);

    if (!isUnderRateLimit) {
      // 3010 is code for "excessive window creation" -- the client will close and not reconnect.
      ws.close(3010);
      return;
    }

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
        // 3001 is the code for "no such window" -- the client will reload and re-initialize for a new window
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

    console.log('init window', windowId, getMemoryUsage());

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