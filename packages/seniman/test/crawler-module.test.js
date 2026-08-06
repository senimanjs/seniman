import assert from 'node:assert/strict';
import test from 'node:test';
import { createModule, createRoot, useClient } from '../dist/index.js';
import { _declareClientFunction } from '../dist/declare.js';

test('crawler rendering ignores client-only module bindings', async () => {
  let clientFnId = _declareClientFunction({ argNames: [], body: '' });
  let module = createModule({ clientFnId, serverBindFns: [] });

  function App() {
    let client = useClient();

    client.exec({
      clientFnId,
      serverBindFns: [module],
    });

    return null;
  }

  let root = createRoot(App);
  root.configure({ SENIMAN_ENABLE_CRAWLER_RENDERER: '1' });

  let response = await root.getHtmlResponse({
    url: '/',
    headers: new Headers({ 'user-agent': 'Googlebot' }),
    ipAddress: '127.0.0.1',
    isSecure: false,
  });

  assert.equal(response.statusCode, 200);
});
