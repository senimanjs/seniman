import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';
import { createEntrypoint, serve } from '../dist/entrypoint.node.js';

function createRootStub() {
  return {
    getHtmlResponse() {
      return {
        statusCode: 200,
        headers: {},
        body: '',
      };
    },
    applyNewConnection() {},
  };
}

async function waitForListening(server) {
  if (server.listening) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

async function getNegotiatedExtensions(server) {
  const { port } = server.address();
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, {
    perMessageDeflate: true,
  });

  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  const extensions = socket.extensions;

  await new Promise(resolve => {
    socket.once('close', resolve);
    socket.close();
  });

  return extensions;
}

function createStandaloneAdapter(options) {
  const entrypoint = createEntrypoint(createRootStub(), options);
  const server = createHttpServer(entrypoint.request);
  server.on('upgrade', entrypoint.upgrade);
  server.listen(0, '127.0.0.1');

  return server;
}

test('Node entrypoint negotiates permessage-deflate when enabled', async () => {
    const server = createStandaloneAdapter({ perMessageDeflate: true });
    await waitForListening(server);

    try {
      assert.match(await getNegotiatedExtensions(server), /permessage-deflate/);
    } finally {
      await close(server);
    }
});

test('Node entrypoint does not negotiate extensions by default', async () => {
    const server = createStandaloneAdapter();
    await waitForListening(server);

    try {
      assert.equal(await getNegotiatedExtensions(server), '');
    } finally {
      await close(server);
    }
});

test('serve starts and returns a Node server', async () => {
  const server = serve(createRootStub(), 0);
  await waitForListening(server);

  try {
    assert.equal(server.listening, true);
    assert.equal(await getNegotiatedExtensions(server), '');
  } finally {
    await close(server);
  }
});
