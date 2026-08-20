import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoreEntrypoint } from '../dist/entrypoint.js';

function createRootStub() {
  return {
    env: null,
    setDisableHtmlCompression() {},
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

  await createCoreEntrypoint(root).fetch(
    new Request('https://example.test/docs/install'),
    { env }
  );

  assert.equal(root.env, env);
});
