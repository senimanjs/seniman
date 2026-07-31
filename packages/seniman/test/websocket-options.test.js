import assert from 'node:assert/strict';
import test from 'node:test';
import { createWebSocketServerOptions } from '../src/websocket-options.js';

test('disables permessage-deflate by default', () => {
  assert.deepEqual(createWebSocketServerOptions({}), {
    noServer: true,
    perMessageDeflate: false,
  });
});

test('keeps permessage-deflate disabled when explicitly false', () => {
  assert.deepEqual(createWebSocketServerOptions({
    perMessageDeflate: false,
  }), {
    noServer: true,
    perMessageDeflate: false,
  });
});

test('does not pass raw permessage-deflate settings through', () => {
  assert.deepEqual(createWebSocketServerOptions({
    perMessageDeflate: {
      threshold: 0,
    },
  }), {
    noServer: true,
    perMessageDeflate: false,
  });
});

test('enables permessage-deflate with Seniman defaults when true', () => {
  assert.deepEqual(createWebSocketServerOptions({
    perMessageDeflate: true,
  }), {
    noServer: true,
    perMessageDeflate: {
      serverNoContextTakeover: true,
      clientNoContextTakeover: true,
      threshold: 1024,
      concurrencyLimit: 10,
      zlibDeflateOptions: {
        level: 3,
        memLevel: 7,
      },
    },
  });
});
