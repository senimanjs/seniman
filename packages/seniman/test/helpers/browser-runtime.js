import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const browserSource = readFile(
  new URL('../../frontend/browser.js', import.meta.url),
  'utf8'
);

export class FakeNode {
  constructor() {
    this.parentNode = null;
  }

  get parentElement() {
    return this.parentNode instanceof FakeElement ? this.parentNode : null;
  }

  get nextSibling() {
    if (!this.parentNode) {
      return null;
    }

    let index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] || null;
  }

  remove() {
    if (!this.parentNode) {
      return;
    }

    let index = this.parentNode.childNodes.indexOf(this);
    if (index >= 0) {
      this.parentNode.childNodes.splice(index, 1);
    }
    this.parentNode = null;
  }
}

export class FakeText extends FakeNode {
  constructor(data) {
    super();
    this.data = data;
    this.nodeName = '#text';
  }

  cloneNode() {
    return new FakeText(this.data);
  }

  get textContent() {
    return this.data;
  }
}

export class FakeElement extends FakeNode {
  constructor(tagName) {
    super();
    this.tagName = tagName.toLowerCase();
    this.nodeName = tagName.toUpperCase();
    this.childNodes = [];
    this.listeners = new Map();
    this.attributeMap = new Map();
    this.style = {
      cssText: '',
      setProperty: (name, value) => {
        this.style[name] = value;
      }
    };
  }

  appendChild(node) {
    this.insertBefore(node, null);
    return node;
  }

  insertBefore(node, marker) {
    if (node.parentNode) {
      node.remove();
    }

    let index = marker == null
      ? this.childNodes.length
      : this.childNodes.indexOf(marker);

    if (index < 0) {
      throw new Error('Insertion marker is not a child of this element');
    }

    this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }

  cloneNode(deep = false) {
    let clone = new FakeElement(this.tagName);
    for (let [name, value] of this.attributeMap) {
      clone.setAttribute(name, value);
    }

    if (deep) {
      for (let child of this.childNodes) {
        clone.appendChild(child.cloneNode(true));
      }
    }
    return clone;
  }

  setAttribute(name, value) {
    this.attributeMap.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributeMap.delete(name);
  }

  addEventListener(type, fn) {
    let listeners = this.listeners.get(type);
    if (listeners) {
      listeners.push(fn);
    } else {
      this.listeners.set(type, [fn]);
    }
  }

  get attributes() {
    return Array.from(this.attributeMap, ([name, value]) => ({ name, value }));
  }

  get children() {
    return this.childNodes.filter(node => node instanceof FakeElement);
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get textContent() {
    return this.childNodes.map(node => node.textContent).join('');
  }
}

export class FakeDocument {
  constructor() {
    this.head = new FakeElement('head');
    this.body = new FakeElement('body');
    this.listeners = new Map();
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  createTextNode(data) {
    return new FakeText(data);
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
    Text: FakeText,
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
