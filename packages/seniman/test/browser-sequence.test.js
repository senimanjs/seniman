import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {
  _createComponent,
  createSequence,
  useCallback,
  useDisposableEffect
} from '../dist/index.js';
import {
  deregisterWindow,
  registerWindow,
  runInWindow
} from '../dist/state.js';
import { Window } from '../dist/window.js';

const browserSource = readFile(
  new URL('../frontend/browser.js', import.meta.url),
  'utf8'
);

class FakeNode {
  constructor() {
    this.parentNode = null;
  }

  get parentElement() {
    return this.parentNode instanceof FakeElement ? this.parentNode : null;
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

class FakeText extends FakeNode {
  constructor(data) {
    super();
    this.data = data;
  }

  get textContent() {
    return this.data;
  }
}

class FakeElement extends FakeNode {
  constructor(tagName) {
    super();
    this.tagName = tagName;
    this.childNodes = [];
    this.listeners = new Map();
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
  }

  addEventListener(type, fn) {
    this.listeners.set(type, fn);
  }

  get textContent() {
    return this.childNodes.map(node => node.textContent).join('');
  }
}

class FakeDocument {
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
    this.listeners.set(type, fn);
  }
}

function uint16(value) {
  let buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}

function initWindow() {
  return Buffer.concat([
    Buffer.from([2]),
    Buffer.from('123456789012345678901')
  ]);
}

function initSequence(id) {
  return Buffer.concat([Buffer.from([13]), uint16(id)]);
}

function sequenceRef(id) {
  return { id };
}

function encodeItem(item) {
  if (typeof item === 'string') {
    let value = Buffer.from(item);
    return Buffer.concat([uint16(value.length), value]);
  }

  return uint16(item.id | (1 << 15));
}

function attach(parentId, itemId, item) {
  return Buffer.concat([
    Buffer.from([3]),
    uint16(parentId),
    uint16(itemId),
    encodeItem(item)
  ]);
}

function insert(sequenceId, index, ...items) {
  return Buffer.concat([
    Buffer.from([18]),
    uint16(sequenceId),
    uint16(index),
    uint16(items.length),
    ...items.map(encodeItem)
  ]);
}

function remove(sequenceId, index, count) {
  return Buffer.concat([
    Buffer.from([19]),
    uint16(sequenceId),
    uint16(index),
    uint16(count)
  ]);
}

async function createBrowserRuntime() {
  let sockets = [];
  let document = new FakeDocument();

  class MockWebSocket {
    constructor() {
      sockets.push(this);
    }

    send() {}
    close() {}
  }

  let browserWindow = {
    origin: 'https://example.test',
    innerWidth: 800,
    innerHeight: 600,
    addEventListener() {},
  };

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
    WebSocket: MockWebSocket,
    clearTimeout,
    console,
    document,
    location: {
      pathname: '/',
      search: '',
      reload() {},
    },
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

  return { document, send };
}

async function waitForText(document, expected) {
  let deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    if (document.body.textContent === expected) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  assert.equal(document.body.textContent, expected);
}

test('an empty nested sequence remains a valid insertion anchor as it grows', async () => {
  let { document, send } = await createBrowserRuntime();

  send(
    initWindow(),
    initSequence(11),
    initSequence(12),
    attach(2, 0, sequenceRef(11)),
    insert(11, 0, 'a', sequenceRef(12), 'b')
  );
  assert.equal(document.body.textContent, 'ab');

  send(insert(11, 1, 'x'));
  assert.equal(document.body.textContent, 'axb');

  send(insert(12, 0, 'c'));
  assert.equal(document.body.textContent, 'axcb');
});

test('a nested sequence can be deleted, remounted, and mutated again', async () => {
  let { document, send } = await createBrowserRuntime();

  send(
    initWindow(),
    initSequence(11),
    initSequence(12),
    attach(2, 0, sequenceRef(11)),
    insert(12, 0, 'c'),
    insert(11, 0, 'a', sequenceRef(12), 'b')
  );
  assert.equal(document.body.textContent, 'acb');

  send(remove(11, 1, 1));
  assert.equal(document.body.textContent, 'ab');

  send(insert(11, 1, sequenceRef(12)));
  assert.equal(document.body.textContent, 'acb');

  send(insert(12, 1, 'd'));
  assert.equal(document.body.textContent, 'acdb');
});

test('insertion anchors resolve through recursively nested sequences', async () => {
  let { document, send } = await createBrowserRuntime();

  send(
    initWindow(),
    initSequence(11),
    initSequence(12),
    initSequence(13),
    insert(12, 0, sequenceRef(13), 'c'),
    attach(2, 0, sequenceRef(11)),
    insert(11, 0, 'a', sequenceRef(12), 'b'),
    insert(11, 1, 'x')
  );
  assert.equal(document.body.textContent, 'axcb');

  send(insert(13, 0, 'g'));
  assert.equal(document.body.textContent, 'axgcb');
});

test('a sequence can replace a placeholder item through an anchor attachment', async () => {
  let { document, send } = await createBrowserRuntime();

  send(
    initWindow(),
    initSequence(11),
    initSequence(12),
    insert(12, 0, 'c'),
    attach(2, 0, sequenceRef(11)),
    insert(11, 0, 'a', '', 'b')
  );
  assert.equal(document.body.textContent, 'ab');

  // Sequence item IDs are insertion IDs, so the placeholder's ID is 2.
  send(attach(11, 2, sequenceRef(12)));
  assert.equal(document.body.textContent, 'acb');

  send(insert(11, 1, 'x'));
  assert.equal(document.body.textContent, 'axcb');
});

test('a component can reattach a closure-held sequence at changing depths', async () => {
  let { document, send } = await createBrowserRuntime();
  let heldSequence;
  let reattach;
  let detachHeld;
  let attachHeld;
  let appendHeld;

  function FunkyComponent() {
    heldSequence = createSequence();
    heldSequence.push('L');

    let level3 = createSequence();
    let level2 = createSequence();
    let level1 = createSequence();
    let root = createSequence();

    level3.push('C(', ')');
    level2.push('B(', level3, ')');
    level1.push('A(', level2, ')');
    root.push('R(', '|', heldSequence, level1, ')');

    let owner = root;
    let ownerIndex = 2;
    let targets = {
      root: [root, 2],
      level1: [level1, 1],
      level2: [level2, 1],
      level3: [level3, 1]
    };

    let detach = () => {
      owner.remove(ownerIndex, 1);
      owner = null;
    };
    let attach = targetName => {
      [owner, ownerIndex] = targets[targetName];
      owner.insert(ownerIndex, heldSequence);
    };

    reattach = useCallback(targetName => {
      detach();
      attach(targetName);
    });
    detachHeld = useCallback(detach);
    attachHeld = useCallback(attach);
    appendHeld = useCallback(value => heldSequence.push(value));

    return root;
  }

  let window = new Window(
    { lowMemoryMode: false },
    {
      windowId: '123456789012345678901',
      href: 'http://localhost/',
      viewportSize: [800, 600],
      cookieString: ''
    },
    null,
    null,
    buffer => send(Buffer.from(buffer))
  );

  registerWindow(window);
  window.onDestroy(() => deregisterWindow(window));
  runInWindow(window.id, () => {
    window.rootDisposer = useDisposableEffect(() => {
      window._attach(2, 0, _createComponent(FunkyComponent, {}));
    });
  });

  try {
    await waitForText(document, 'R(|LA(B(C())))');

    reattach('level3');
    await waitForText(document, 'R(|A(B(C(L))))');
    appendHeld('1');
    await waitForText(document, 'R(|A(B(C(L1))))');

    reattach('level1');
    await waitForText(document, 'R(|A(L1B(C())))');
    reattach('level2');
    await waitForText(document, 'R(|A(B(L1C())))');

    detachHeld();
    await waitForText(document, 'R(|A(B(C())))');
    appendHeld('2');
    await waitForText(document, 'R(|A(B(C())))');
    attachHeld('root');
    await waitForText(document, 'R(|L12A(B(C())))');

    reattach('level3');
    await waitForText(document, 'R(|A(B(C(L12))))');
    reattach('root');
    await waitForText(document, 'R(|L12A(B(C())))');
  } finally {
    window.destroy();
  }
});
