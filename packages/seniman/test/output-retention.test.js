import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot } from '../dist/window_manager.js';
import { Window } from '../dist/window.js';

const windowId = '123456789012345678901';
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function createConfiguredRoot(env) {
  let root = createRoot(() => null);
  root.configure(env);
  return root;
}

function createTrackedWindow(root, id = windowId) {
  let output = [];
  let window = new Window(
    root,
    { windowId: id },
    null,
    null,
    buffer => output.push(Buffer.from(buffer))
  );

  root._trackWindow(window);
  window.onDestroy(() => root._untrackWindow(window));
  window.enableOutputRetentionTracking();
  return { output, window };
}

test('soft output bytes request progress and the hard limit pauses instead of closing', () => {
  let root = createConfiguredRoot({
    SENIMAN_MAX_UNACKNOWLEDGED_OUTPUT_BYTES: '30',
    SENIMAN_MAX_UNACKNOWLEDGED_PUBLICATIONS: '1000',
    SENIMAN_MAX_RETAINED_OUTPUT_BYTES: '1000'
  });
  let { output, window } = createTrackedWindow(root);

  window.flushCommandBuffer();

  assert.deepEqual(output.map(buffer => buffer.length), [22, 1]);
  assert.equal(window.outputProgressProbeOutstanding, true);
  assert.equal(window.outputBackpressurePaused, false);

  window._allocCommandBuffer(7).fill(1);
  window.flushCommandBuffer();

  assert.equal(window.destroyed, false);
  assert.equal(window.outputBackpressurePaused, true);
  assert.equal(window.schedulerOutputPaused, true);

  window.registerReadOffset(window.global_publishOffset);

  assert.equal(window.outputBackpressurePaused, false);
  assert.equal(window.schedulerOutputPaused, false);
  assert.equal(window.outputProgressProbeOutstanding, false);
  window.destroy();
});

test('publication ceiling applies backpressure without repeatedly probing', () => {
  let root = createConfiguredRoot({
    SENIMAN_MAX_UNACKNOWLEDGED_OUTPUT_BYTES: '1000',
    SENIMAN_MAX_UNACKNOWLEDGED_PUBLICATIONS: '4',
    SENIMAN_MAX_RETAINED_OUTPUT_BYTES: '1000'
  });
  let { output, window } = createTrackedWindow(root);

  window.flushCommandBuffer();
  window.sendPing();
  window.sendPing();

  assert.deepEqual(output.map(buffer => buffer.length), [22, 1, 1, 1]);
  assert.equal(window.destroyed, false);
  assert.equal(window.outputBackpressurePaused, true);
  assert.equal(window.outputProgressProbeOutstanding, true);

  window.registerReadOffset(window.global_publishOffset);
  assert.equal(window.outputBackpressurePaused, false);
  window.destroy();
});

test('a paused window is expired only after making no progress for the stall timeout', async () => {
  let root = createConfiguredRoot({
    SENIMAN_MAX_UNACKNOWLEDGED_OUTPUT_BYTES: '30',
    SENIMAN_MAX_UNACKNOWLEDGED_PUBLICATIONS: '1000',
    SENIMAN_MAX_RETAINED_OUTPUT_BYTES: '1000',
    SENIMAN_OUTPUT_STALL_TIMEOUT_MS: '10'
  });
  let { window } = createTrackedWindow(root);

  window.flushCommandBuffer();
  window._allocCommandBuffer(7).fill(1);
  window.flushCommandBuffer();

  assert.equal(window.outputBackpressurePaused, true);
  assert.equal(window.destroyed, false);

  await wait(25);

  assert.equal(window.destroyed, true);
  assert.equal(window.outputBacklogCloseReason, 'window-stalled');
  assert.equal(root.retainedOutputBytes, 0);
});

test('global pressure pauses publication and culls only windows without probe progress', async () => {
  let root = createConfiguredRoot({
    SENIMAN_MAX_UNACKNOWLEDGED_OUTPUT_BYTES: '1000',
    SENIMAN_MAX_UNACKNOWLEDGED_PUBLICATIONS: '1000',
    SENIMAN_MAX_RETAINED_OUTPUT_BYTES: '50',
    SENIMAN_OUTPUT_STALL_TIMEOUT_MS: '1000',
    SENIMAN_OUTPUT_PRESSURE_GRACE_MS: '10'
  });
  let first = createTrackedWindow(root, '111111111111111111111').window;
  let second = createTrackedWindow(root, '222222222222222222222').window;

  first.flushCommandBuffer();
  second.flushCommandBuffer();
  first._allocCommandBuffer(5).fill(1);
  first.flushCommandBuffer();

  assert.equal(root.globalOutputBackpressurePaused, true);
  assert.equal(first.globalOutputBackpressurePaused, true);
  assert.equal(second.globalOutputBackpressurePaused, true);
  assert.equal(first.destroyed, false);
  assert.equal(second.destroyed, false);

  await wait(25);

  assert.equal(first.destroyed, true);
  assert.equal(first.outputBacklogCloseReason, 'global-output-pressure');
  assert.equal(second.destroyed, false);
  assert.equal(root.globalOutputBackpressurePaused, false);
  second.destroy();
});

test('global pressure resumes without culling windows that acknowledge output', async () => {
  let root = createConfiguredRoot({
    SENIMAN_MAX_UNACKNOWLEDGED_OUTPUT_BYTES: '1000',
    SENIMAN_MAX_UNACKNOWLEDGED_PUBLICATIONS: '1000',
    SENIMAN_MAX_RETAINED_OUTPUT_BYTES: '50',
    SENIMAN_OUTPUT_STALL_TIMEOUT_MS: '1000',
    SENIMAN_OUTPUT_PRESSURE_GRACE_MS: '10'
  });
  let first = createTrackedWindow(root, '333333333333333333333').window;
  let second = createTrackedWindow(root, '444444444444444444444').window;

  first.flushCommandBuffer();
  second.flushCommandBuffer();
  first._allocCommandBuffer(5).fill(1);
  first.flushCommandBuffer();

  first.registerReadOffset(first.global_publishOffset);
  second.registerReadOffset(second.global_publishOffset);

  assert.equal(root.retainedOutputBytes, 0);
  assert.equal(root.globalOutputBackpressurePaused, false);

  await wait(25);

  assert.equal(first.destroyed, false);
  assert.equal(second.destroyed, false);
  first.destroy();
  second.destroy();
});

test('the emergency ceiling protects the process without waiting for progress', () => {
  let root = createConfiguredRoot({
    SENIMAN_MAX_UNACKNOWLEDGED_OUTPUT_BYTES: '1000',
    SENIMAN_MAX_UNACKNOWLEDGED_PUBLICATIONS: '1000',
    SENIMAN_MAX_RETAINED_OUTPUT_BYTES: '50',
    SENIMAN_OUTPUT_PRESSURE_GRACE_MS: '1000'
  });
  let window = createTrackedWindow(root).window;

  window._allocCommandBuffer(101).fill(1);
  window.flushCommandBuffer();

  assert.equal(window.destroyed, true);
  assert.equal(window.outputBacklogCloseReason, 'global-output-emergency');
  assert.equal(root.retainedOutputBytes, 0);
});

test('acknowledging all output removes a window from progress ordering', () => {
  let root = createConfiguredRoot({
    SENIMAN_MAX_RETAINED_OUTPUT_BYTES: '1000'
  });
  let window = createTrackedWindow(root).window;

  window.flushCommandBuffer();
  assert.equal(root.outputProgressHead, window);

  window.registerReadOffset(window.global_publishOffset);

  assert.equal(root.retainedOutputBytes, 0);
  assert.equal(root.outputProgressHead, null);
  assert.equal(root.outputProgressTail, null);
  window.destroy();
});
