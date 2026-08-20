import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoreEntrypoint } from '../dist/entrypoint.js';

function createRootStub() {
  return {
    configuredWith: null,
    requestContext: null,
    connection: null,

    configure(env) {
      this.configuredWith = env;
    },
    getHtmlResponse(requestContext) {
      this.requestContext = requestContext;
      return {
        statusCode: 201,
        headers: { 'x-seniman-test': 'yes' },
        body: 'Hello World',
      };
    },
    applyNewConnection(socket, requestContext, auxContext) {
      this.connection = { socket, requestContext, auxContext };
    },
  };
}

test('core entrypoint converts Fetch requests and responses', async () => {
  let root = createRootStub();
  let env = { API_URL: 'https://api.example.test' };
  let context = { requestId: 'request-1' };
  let entrypoint = createCoreEntrypoint(root);

  let response = await entrypoint.fetch(
    new Request('https://example.test/hello', {
      headers: { 'x-forwarded-for': '203.0.113.1' },
    }),
    { env, context }
  );

  assert.equal(root.configuredWith, env);
  assert.equal(root.requestContext.url, 'https://example.test/hello');
  assert.equal(root.requestContext.ipAddress, '203.0.113.1');
  assert.equal(root.requestContext.isSecure, true);
  assert.equal(root.requestContext.auxContext, context);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-seniman-test'), 'yes');
  assert.equal(await response.text(), 'Hello World');
});

test('core entrypoint applies allowed origins before connecting', () => {
  let root = createRootStub();
  let entrypoint = createCoreEntrypoint(root, {
    allowedOrigins: ['example.test'],
  });
  let accepted = new Request('https://example.test/', {
    headers: { Origin: 'https://example.test' },
  });
  let rejected = new Request('https://example.test/', {
    headers: { Origin: 'https://other.test' },
  });

  assert.equal(entrypoint.connect(accepted, {}), true);
  assert.equal(root.connection.requestContext.url, accepted.url);
  assert.equal(entrypoint.connect(rejected, {}), false);
});
