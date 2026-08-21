import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot, createSequence } from '../dist/index.js';

test('the server and crawler render nested sequences', async () => {
  function App() {
    let grandchild = createSequence();
    let child = createSequence();
    let parent = createSequence();

    child.push(grandchild, 'c');
    parent.push('a', child, 'b');
    grandchild.push('g');

    parent.remove(1, 1);
    parent.insert(1, child);

    return parent;
  }

  let root = createRoot(App);
  root.configure({ SENIMAN_ENABLE_CRAWLER_RENDERER: '1' });

  let response = await root.getHtmlResponse({
    url: '/',
    headers: new Headers({ 'user-agent': 'Googlebot' }),
    ipAddress: '127.0.0.1',
    isSecure: false,
  });

  assert.match(response.body, /<body>agcb\s*<\/body>/);
});

test('arrays inserted into a sequence render as owned child sequences', async () => {
  function App() {
    let parent = createSequence();
    parent.push('a', ['x', 'y'], 'b');
    return parent;
  }

  let root = createRoot(App);
  root.configure({ SENIMAN_ENABLE_CRAWLER_RENDERER: '1' });

  let response = await root.getHtmlResponse({
    url: '/',
    headers: new Headers({ 'user-agent': 'Googlebot' }),
    ipAddress: '127.0.0.1',
    isSecure: false,
  });

  assert.match(response.body, /<body>axyb\s*<\/body>/);
});
