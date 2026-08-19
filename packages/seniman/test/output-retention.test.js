import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot } from '../dist/window_manager.js';
import { Window } from '../dist/window.js';

const windowId = '123456789012345678901';

function createTrackedWindow(env) {
  let output = [];
  let root = createRoot(() => null);
  root.configure(env);
  let window = new Window(
    root,
    { windowId },
    null,
    null,
    buffer => output.push(Buffer.from(buffer))
  );

  window.enableOutputRetentionTracking();
  return { output, root, window };
}

test('unacknowledged output bytes expire a window before publication', () => {
  let { output, root, window } = createTrackedWindow({
    SENIMAN_MAX_UNACKNOWLEDGED_OUTPUT_BYTES: '30',
    SENIMAN_MAX_UNACKNOWLEDGED_PUBLICATIONS: '10',
    SENIMAN_MAX_RETAINED_OUTPUT_BYTES: '1000'
  });

  window.flushCommandBuffer();
  assert.equal(output.length, 1);
  assert.equal(root.retainedOutputBytes, 22);

  window._allocCommandBuffer(9).fill(1);
  window.flushCommandBuffer();

  assert.equal(output.length, 1);
  assert.equal(window.destroyed, true);
  assert.equal(window.publications, null);
  assert.equal(root.retainedOutputBytes, 0);
  assert.equal(root.outputProgressHead, null);
});

test('unacknowledged publication count expires tiny output streams', () => {
  let { output, root, window } = createTrackedWindow({
    SENIMAN_MAX_UNACKNOWLEDGED_OUTPUT_BYTES: '1000',
    SENIMAN_MAX_UNACKNOWLEDGED_PUBLICATIONS: '2',
    SENIMAN_MAX_RETAINED_OUTPUT_BYTES: '1000'
  });

  window.flushCommandBuffer();
  window.sendPing();
  window.sendPing();

  assert.deepEqual(output.map(buffer => buffer.length), [22, 1]);
  assert.equal(window.destroyed, true);
  assert.equal(root.retainedOutputBytes, 0);
});

test('global output pressure evicts the oldest progress first', () => {
  let root = createRoot(() => null);
  root.configure({
    SENIMAN_MAX_RETAINED_OUTPUT_BYTES: '10'
  });

  function createCandidate(id, retainedBytes) {
    return {
      id,
      destroyed: false,
      outputRetentionTracking: true,
      retainedOutputBytes: 0,
      outputProgressPrev: null,
      outputProgressNext: null,
      outputProgressListed: false,
      global_publishOffset: retainedBytes,
      global_readOffset: 0,
      destroy() {
        this.destroyed = true;
        root._releaseWindowRetainedOutput(this);
      }
    };
  }

  let first = createCandidate(1, 4);
  let second = createCandidate(2, 4);
  root._updateWindowRetainedOutput(first);
  root._updateWindowRetainedOutput(second);

  first.global_readOffset = 1;
  root._updateWindowRetainedOutput(first, true);

  let third = createCandidate(3, 4);
  root._updateWindowRetainedOutput(third);

  assert.equal(second.destroyed, true);
  assert.equal(first.destroyed, false);
  assert.equal(third.destroyed, false);
  assert.equal(root.retainedOutputBytes, 7);
  assert.equal(root.outputProgressHead, first);
  assert.equal(root.outputProgressTail, third);
});

test('acknowledging all output removes a window from progress ordering', () => {
  let { root, window } = createTrackedWindow({
    SENIMAN_MAX_RETAINED_OUTPUT_BYTES: '1000'
  });

  window.flushCommandBuffer();
  assert.equal(root.outputProgressHead, window);

  window.registerReadOffset(window.global_publishOffset);

  assert.equal(root.retainedOutputBytes, 0);
  assert.equal(root.outputProgressHead, null);
  assert.equal(root.outputProgressTail, null);
});
