import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';
import { wrapExpress } from '../dist/express/index.js';
import { createServer } from '../dist/server/index.js';

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

function createExpressStub() {
  return {
    get() {},
    listen(port, host, backlog, callback) {
      return createHttpServer().listen(port, host, backlog, callback);
    },
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
  const server = createServer(createRootStub(), options);
  server.listen(0, '127.0.0.1');

  return server;
}

function createExpressAdapter(options) {
  const app = createExpressStub();
  wrapExpress(app, createRootStub(), options);

  return app.listen(0, '127.0.0.1');
}

for (const [adapterName, createAdapter] of [
  ['Node server', createStandaloneAdapter],
  ['Express', createExpressAdapter],
]) {
  test(`${adapterName} negotiates permessage-deflate when enabled`, async () => {
    const server = createAdapter({ perMessageDeflate: true });
    await waitForListening(server);

    try {
      assert.match(await getNegotiatedExtensions(server), /permessage-deflate/);
    } finally {
      await close(server);
    }
  });

  test(`${adapterName} does not negotiate extensions by default`, async () => {
    const server = createAdapter();
    await waitForListening(server);

    try {
      assert.equal(await getNegotiatedExtensions(server), '');
    } finally {
      await close(server);
    }
  });
}
