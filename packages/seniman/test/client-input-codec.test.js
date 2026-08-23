import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { Window } from '../dist/window.js';

const ARGTYPE_STRING = 1;
const ARGTYPE_HANDLER = 7;

async function createBrowserRuntime() {
  let sockets = [];

  class MockWebSocket {
    constructor() {
      this.sent = [];
      sockets.push(this);
    }

    close() {}

    send(message) {
      this.sent.push(message);
    }
  }

  let source = await readFile(
    new URL('../frontend/browser.js', import.meta.url),
    'utf8'
  );

  vm.runInNewContext(source, {
    ArrayBuffer,
    DataView,
    Map,
    Set,
    Text: class {},
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL,
    WeakMap,
    WebSocket: MockWebSocket,
    clearTimeout,
    console,
    document: {
      addEventListener() {},
      createElement() { return {}; }
    },
    location: {
      pathname: '/',
      search: '',
      reload() {}
    },
    setTimeout,
    window: {
      origin: 'https://example.test',
      innerWidth: 800,
      innerHeight: 600,
      addEventListener() {}
    }
  });

  let socket = sockets[0];
  return {
    socket,
    send(...commands) {
      let buffer = Buffer.concat(commands);
      let data = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      );
      socket.onmessage({ data });
    }
  };
}

function uint16(value) {
  let buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}

function stringValue(value) {
  let encoded = Buffer.from(value);
  return Buffer.concat([
    Buffer.from([ARGTYPE_STRING]),
    uint16(encoded.length),
    encoded
  ]);
}

function installClientFunction(id, body) {
  return Buffer.concat([
    Buffer.from([10]),
    uint16(id),
    Buffer.from([2]),
    stringValue(''),
    stringValue(body)
  ]);
}

function runClientFunction(id, handlerId) {
  return Buffer.concat([
    Buffer.from([11]),
    uint16(id),
    Buffer.from([1, ARGTYPE_HANDLER]),
    uint16(handlerId)
  ]);
}

test('client input codec preserves wide collections, large integers, and null', async () => {
  let { send, socket } = await createBrowserRuntime();
  let body = `
    let array = Array.from({ length: 300 }, (_, index) => index);
    array[42] = null;
    let object = {};
    for (let index = 0; index < 300; index++) object['key' + index] = index;
    object.key42 = null;
    this.serverFunctions[0](
      array,
      object,
      2147483648,
      -2147483649,
      Number.MAX_SAFE_INTEGER,
      null,
      undefined
    );
    this.serverFunctions[0]();
  `;

  send(
    installClientFunction(1, body),
    runClientFunction(1, 42)
  );

  let calls = [];
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
    () => {}
  );
  window.rootDisposer = () => {};
  window.onDestroy(() => {});
  window.eventHandlers.set(42, (...args) => calls.push(args));

  for (let message of socket.sent) {
    window.processInput(Buffer.from(message));
  }
  window.destroy();

  assert.equal(calls.length, 2);
  assert.equal(calls[0][0].length, 300);
  assert.equal(calls[0][0][42], null);
  assert.equal(Object.keys(calls[0][1]).length, 300);
  assert.equal(calls[0][1].key299, 299);
  assert.equal(calls[0][1].key42, null);
  assert.deepEqual(calls[0].slice(2), [
    2147483648,
    -2147483649,
    Number.MAX_SAFE_INTEGER,
    null,
    null
  ]);
  assert.deepEqual(calls[1], []);
});
