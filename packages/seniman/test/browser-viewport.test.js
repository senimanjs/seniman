import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('browser handshake reports the layout viewport', async () => {
  const urls = [];
  class MockWebSocket {
    constructor(url) {
      urls.push(url);
    }

    close() {}
    send() {}
  }

  const browserWindow = {
    origin: 'https://example.test',
    innerWidth: 500,
    innerHeight: 800,
    visualViewport: { width: 488, height: 400 },
    addEventListener() {},
  };
  const browserLocation = {
    pathname: '/terminal',
    search: '?session=1',
    reload() {},
  };
  const browserDocument = {
    addEventListener() {},
    createElement() {
      return {};
    },
  };
  const source = await readFile(
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
    document: browserDocument,
    location: browserLocation,
    setTimeout,
    window: browserWindow,
  });

  assert.equal(urls.length, 1);
  const url = new URL(urls[0]);
  assert.equal(url.searchParams.get('vs'), '500x800');
  assert.equal(url.searchParams.has('vv'), false);
});
