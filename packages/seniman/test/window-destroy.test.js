import assert from 'node:assert/strict';
import test from 'node:test';
import { onDispose, useCallback, useEffect, useState } from '../dist/index.js';
import { deregisterWindow, getWindow, registerWindow } from '../dist/state.js';
import { Window } from '../dist/window.js';

const pageParams = {
  windowId: '123456789012345678901',
  href: 'http://localhost/',
  viewportSize: [1280, 720],
  cookieString: ''
};

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

test('destroy cancels a queued publication before releasing its pages', async () => {
  let output = [];
  let window = new Window(
    { lowMemoryMode: false },
    pageParams,
    null,
    null,
    buffer => output.push(Buffer.from(buffer))
  );
  let pendingBuffer = window.pages[0].buffer;

  window.rootDisposer = () => {};
  window.onDestroy(() => {});
  window.destroy();
  window.flushCommandBuffer();
  window.sendPing();

  await Promise.resolve();

  assert.deepEqual(output, []);
  assert.equal(window.pages.length, 0);
  assert.equal(window.mutationGroup, null);
  assert.throws(
    () => window._allocCommandBuffer(1),
    /window has been destroyed/
  );

  let nextWindow = new Window(
    { lowMemoryMode: false },
    pageParams,
    null,
    null,
    () => {}
  );
  assert.notEqual(nextWindow.pages[0].buffer, pendingBuffer);
});

test('destroy runs cleanup but ignores late state writes and callbacks', async () => {
  let output = [];
  let setValue;
  let callback;
  let cleanupCount = 0;
  let effectRunCount = 0;

  function App() {
    let [value, setState] = useState(0);
    setValue = setState;
    callback = useCallback(() => 'ran');
    useEffect(() => {
      value();
      effectRunCount++;
    });
    onDispose(() => cleanupCount++);
    return null;
  }

  let window = new Window(
    { lowMemoryMode: false },
    pageParams,
    null,
    App,
    buffer => output.push(Buffer.from(buffer))
  );

  registerWindow(window);
  window.onDestroy(() => deregisterWindow(window));
  window.start();
  await wait(20);

  let effectRunCountBeforeDestroy = effectRunCount;
  setValue(1);
  window.destroy();
  let outputCountAfterDestroy = output.length;

  assert.doesNotThrow(() => setValue(1));
  assert.equal(callback(), undefined);

  await wait(30);

  assert.equal(cleanupCount, 1);
  assert.equal(effectRunCount, effectRunCountBeforeDestroy);
  assert.equal(output.length, outputCountAfterDestroy);
  assert.equal(getWindow(window.id), undefined);
});

test('mass destroy waits for every root disposal before deregistration', { timeout: 10000 }, async () => {
  let windowCount = 300;
  let effectsPerWindow = 50;
  let cleanupCount = 0;
  let effectRunCount = 0;
  let windows = [];

  function App() {
    for (let i = 0; i < effectsPerWindow; i++) {
      useEffect(() => effectRunCount++);
    }

    onDispose(() => cleanupCount++);
    return null;
  }

  for (let i = 0; i < windowCount; i++) {
    let window = new Window(
      { lowMemoryMode: false },
      { ...pageParams, windowId: String(i).padStart(21, '0') },
      null,
      App,
      () => {}
    );

    registerWindow(window);
    window.onDestroy(() => deregisterWindow(window));
    window.start();
    windows.push(window);
  }

  while (effectRunCount < windowCount * effectsPerWindow) {
    await wait(0);
  }

  windows.forEach(window => window.destroy());

  while (windows.some(window => getWindow(window.id))) {
    await wait(0);
  }

  assert.equal(cleanupCount, windowCount);
});
