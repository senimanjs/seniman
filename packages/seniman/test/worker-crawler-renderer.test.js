import assert from 'node:assert/strict';
import test from 'node:test';
import { runFetch } from '../dist/workers/index.js';

function createRootStub() {
  return {
    env: null,
    configure(env) {
      this.env = env;
    },
    getHtmlResponse() {
      return {
        statusCode: 200,
        headers: {},
        body: '',
      };
    },
  };
}

test('module worker env is passed to root configuration', async () => {
  let root = createRootStub();
  let env = { SENIMAN_ENABLE_CRAWLER_RENDERER: '1' };

  await runFetch(
    new Request('https://example.test/docs/install'),
    env,
    root,
    () => true
  );

  assert.equal(root.env, env);
});
