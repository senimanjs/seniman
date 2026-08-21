import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  Element,
  Node,
  Text
} from '../../src/crawler/dom.js';

export { Element, Node, Text };

const browserSource = readFile(
  new URL('../../frontend/browser.js', import.meta.url),
  'utf8'
);

export class FakeDocument {
  constructor() {
    this.head = new Element('head');
    this.body = new Element('body');
    this.listeners = new Map();
  }

  createElement(tagName) {
    return new Element(tagName);
  }

  createTextNode(data) {
    return new Text(data);
  }

  addEventListener(type, fn) {
    let listeners = this.listeners.get(type);
    if (listeners) {
      listeners.push(fn);
    } else {
      this.listeners.set(type, [fn]);
    }
  }
}

export class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
  }

  send(message) {
    this.sent.push(message);
  }

  close() {}
}

export async function createBrowserRuntime(options = {}) {
  let sockets = [];
  let document = options.document || new FakeDocument();
  let browserLocation = {
    pathname: '/',
    search: '',
    reload() {},
    ...options.location
  };
  let browserWindow = {
    origin: 'https://example.test',
    innerWidth: 800,
    innerHeight: 600,
    addEventListener() {},
    ...options.window
  };

  class RuntimeWebSocket extends FakeWebSocket {
    constructor(url) {
      super(url);
      sockets.push(this);
    }
  }

  vm.runInNewContext(await browserSource, {
    ArrayBuffer,
    DataView,
    Map,
    Set,
    Text,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL,
    WeakMap,
    WebSocket: RuntimeWebSocket,
    clearTimeout,
    console,
    document,
    location: browserLocation,
    setTimeout,
    window: browserWindow,
  });

  let socket = sockets[0];
  let send = (...commands) => {
    let buffer = Buffer.concat(commands);
    let arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
    socket.onmessage({ data: arrayBuffer });
  };

  return {
    document,
    location: browserLocation,
    send,
    socket,
    sockets,
    urls: sockets.map(item => item.url),
    window: browserWindow
  };
}

export async function waitForText(document, expected, timeout = 1000) {
  let deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (document.body.textContent === expected) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  assert.equal(document.body.textContent, expected);
}
