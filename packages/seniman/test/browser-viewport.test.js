import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserRuntime } from './helpers/browser-runtime.js';

test('browser handshake reports the layout viewport', async () => {
  let { urls } = await createBrowserRuntime({
    window: {
      innerWidth: 500,
      innerHeight: 800,
      visualViewport: { width: 488, height: 400 }
    },
    location: {
      pathname: '/terminal',
      search: '?session=1'
    }
  });

  assert.equal(urls.length, 1);
  let url = new URL(urls[0]);
  assert.equal(url.searchParams.get('vs'), '500x800');
  assert.equal(url.searchParams.has('vv'), false);
});
