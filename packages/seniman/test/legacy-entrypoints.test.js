import assert from 'node:assert/strict';
import test from 'node:test';

const docsUrl = 'https://seniman.dev/docs/references/server';

const entrypoints = [
  ['server', ['createServer', 'serve'], 'seniman/node'],
  ['express', ['wrapExpress'], 'seniman/node'],
  ['workers', ['useEnv', 'runFetch', 'serve', 'createServer'], 'seniman-cloudflare'],
  ['hono/workers', ['wrapHono'], 'seniman-cloudflare'],
];

for (let [path, exports, replacement] of entrypoints) {
  test(`legacy ${path} exports throw a migration error`, async () => {
    let module = await import(`../dist/${path}/index.js`);

    for (let name of exports) {
      assert.throws(
        () => module[name](),
        error => error.message.includes(replacement) && error.message.includes(docsUrl)
      );
    }
  });
}
