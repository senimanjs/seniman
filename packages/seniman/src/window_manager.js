import process from 'node:process';
import { FastRateLimit } from 'fast-ratelimit';
import { nanoid } from 'nanoid';
import { Window } from './window.js';
import { CrawlerRenderer } from './crawler/index.js';

import {
  RSS_LOW_MEMORY_THRESHOLD,
  RSS_LOW_MEMORY_THRESHOLD_ENABLED,
  RATELIMIT_WINDOW_INPUT_THRESHOLD,
  RATELIMIT_WINDOW_INPUT_TTL_SECONDS,
  RATELIMIT_WINDOW_CREATION_THRESHOLD,
  RATELIMIT_WINDOW_CREATION_TTL_SECONDS,
  ENABLE_CRAWLER_RENDERER,
  MAX_INPUT_EVENT_BUFFER_SIZE
} from './config.js';

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

export function createRoot(rootFn) {
  return new Root(rootFn);
}

class Root {

  constructor(rootFn) {
    this.rootFn = rootFn;
    this.windowMap = new Map();

    this.crawlerRenderingEnabled = ENABLE_CRAWLER_RENDERER;
    this.crawlerRenderer = ENABLE_CRAWLER_RENDERER ? new CrawlerRenderer() : null;

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

    this.droppedMessagesCount = 0;

    /*
    setInterval(() => {
      if (this.droppedMessagesCount > 0) {
        console.log('Dropped messages: ' + this.droppedMessagesCount);
        this.droppedMessagesCount = 0;
      }
    }, 2000);
    */

    this.lowMemoryMode = false;

    if (RSS_LOW_MEMORY_THRESHOLD_ENABLED) {
      // low memory checker loop
      setInterval(() => {
        // get RSS memory usage
        let rss = process.memoryUsage().rss / 1024 / 1024;

        let isLowMemory = rss > RSS_LOW_MEMORY_THRESHOLD;

        if (isLowMemory) {
          console.log('Low memory detected, RSS:', rss);
          this.lowMemoryMode = true;
        } else {
          this.lowMemoryMode = false;
        }

      }, 5000);
    }

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

  setRateLimit({ disabled }) {
    if (disabled) {
      // assign no-op rate limiters 
      this.messageLimiter = {
        consumeSync: () => true
      };

      this.windowCreationLimiter = {
        consumeSync: () => true
      };
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

    // apply global limit
    // TODO: move the length check to the websocket server's max message size
    // do this once we set up client-side rate limiting
    let isUnderLimit =
      this.messageLimiter.consumeSync(window.id) &&
      message.byteLength < MAX_INPUT_EVENT_BUFFER_SIZE;

    // TODO: print on a regular interval the amount of messages that are being dropped
    if (!isUnderLimit) {
      this.droppedMessagesCount++;
      return;
    }

    // TODO: apply window & handler specific limits

    let buffer = Buffer.from(message);
    let txPortId = buffer.readUInt16LE(0);

    // portId of 0 is reserved for the pong command
    if (txPortId == 0) {
      window.registerPong(buffer);
      return;
    }

    window.enqueueInputMessage(buffer);

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

  applyNewConnection(ws, { url, headers, ipAddress }) {

    let params = new URLSearchParams(url.split('?')[1]);

    // then, get the values from the params object
    let windowId = params.get('wi') || '';
    let readOffset = parseInt(params.get('ro'));
    let viewportSize = params.get('vs').split('x').map((num) => parseInt(num));
    let locationString = params.get('lo');

    let isUnderRateLimit = this.windowCreationLimiter.consumeSync(ipAddress);

    if (!isUnderRateLimit) {
      // 3010 is code for "excessive window creation" -- the client will close and not reconnect.
      ws.close(3010);
      return;
    }

    let cookieString = headers.get('cookie') || '';

    // href is the combination of:
    // - the protocol+hostname+port (take it from the Origin header for security)
    // - pathname
    // - searchParams
    let origin = headers.get('origin') || '';
    let href = origin + locationString;

    let pageParams = {
      windowId,
      href,
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

    // TODO: pass request's ip address here, and rate limit window creation based on ip address
    let window = new Window(this, pageParams, this.rootFn);
    this.windowMap.set(windowId, window);

    window.onDestroy(() => {
      this.windowMap.delete(windowId);

      if (this.windowDestroyCallback) {
        this.windowDestroyCallback(windowId);
      }
    });

    // update the window's buffer push function to refer to the new websocket
    window.onBuffer(buf => {
      ws.send(buf);
    });

    window.resetLifecycleInterval();

    this._setupWsListeners(ws, window);
  }

  setServer(server) {
    const wsServer = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      wsServer.handleUpgrade(request, socket, head, ws => {
        this.applyNewConnection(ws, request);
      });
    });
  }

  async getHtmlResponse({ url, headers, ipAddress, isSecure, htmlBuffers }) {
    let isUnderRateLimit = this.windowCreationLimiter.consumeSync(ipAddress);

    if (!isUnderRateLimit) {
      return {
        statusCode: 429,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store',
        },
        body: 'Too many requests'
      }
    }

    let responseHeaders = {
      'Content-Type': 'text/html',
      'Vary': 'Accept',
      'Cache-Control': 'no-store',
    };

    if (this.crawlerRenderingEnabled && this.crawlerRenderer.shouldUseRenderer(headers)) {

      // href is combination of:
      // - the protocol+hostname+port 
      // - pathname
      // - searchParams
      let href = (isSecure ? 'https://' : 'http://') + headers.get('host') + url;

      // TODO: check if we have a cached response for this request
      let html = await this.renderHtml({ headers, href });
      responseHeaders['Content-Length'] = Buffer.byteLength(html);

      return {
        statusCode: 200,
        headers: responseHeaders,
        body: html
      };
    }

    let acceptEncoding = headers.get('accept-encoding') || '';
    let algo;
    let html;

    // in cloudflare workers, we need to be sending uncompressed HTML
    // seemingly CF doesn't support pre-compressed HTML
    if (htmlBuffers.br) {
      if (acceptEncoding.indexOf('br') > -1) {
        algo = 'br';
        html = htmlBuffers.br;
      } else if (acceptEncoding.indexOf('gzip') > -1) {
        algo = 'gzip';
        html = htmlBuffers.gzip;
      } else {
        html = htmlBuffers.uncompressed;
      }
    } else {
      html = htmlBuffers.uncompressed;
    }

    responseHeaders['Content-Length'] = html.byteLength;

    if (algo) {
      responseHeaders['Content-Encoding'] = algo;
    }

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: html
    };
  }

  async renderHtml({ headers, href }) {
    let windowId = nanoid();
    let cookieString = headers.get('cookie') || '';

    let pageParams = {
      windowId,
      href,

      // TODO: get viewport size from request
      viewportSize: [1920, 1080],

      readOffset: 0,
      cookieString
    };

    let htmlRenderContext = this.crawlerRenderer.createHtmlRenderingContext();

    let window = new Window(this, pageParams, this.Body);

    window.onBuffer(buf => {
      htmlRenderContext.feedBuffer(buf);
    });

    window.onDestroy(() => {
      if (this.windowDestroyCallback) {
        this.windowDestroyCallback(windowId);
      }
    });

    return new Promise((resolve, reject) => {
      htmlRenderContext.onRenderComplete((html) => {
        window.destroy();
        resolve(html);
      });

      htmlRenderContext.onRenderError((err) => {
        window.destroy();
        reject(err);
      });
    });
  }

  reconnectWindow(ws, pageParams) {
    let window = this.windowMap.get(pageParams.windowId);

    // update the window's buffer push function to refer to the new websocket
    window.onBuffer(buf => {
      ws.send(buf);
    });

    window.resetLifecycleInterval();

    window.reconnect(pageParams);

    this._setupWsListeners(ws, window);
  }

  _setupWsListeners(ws, window) {
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
}