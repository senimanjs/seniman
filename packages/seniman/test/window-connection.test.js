import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRoot,
  WINDOW_MAINTENANCE_DISCONNECTED,
  WINDOW_MAINTENANCE_WAITING_FOR_ACK
} from '../dist/window_manager.js';
import { Window } from '../dist/window.js';
import { deregisterWindow, registerWindow } from '../dist/state.js';

class FakeWebSocket {
  constructor() {
    this.listeners = new Map();
    this.sent = [];
    this.closed = false;
    this.closeCode = null;
  }

  on(type, fn) {
    this.listeners.set(type, fn);
  }

  emit(type, value) {
    this.listeners.get(type)?.(value);
  }

  send(buffer) {
    this.sent.push(buffer);
  }

  close(code) {
    this.closed = true;
    this.closeCode = code;
    this.emit('close');
  }
}

test('only the newest websocket owns a window connection', () => {
  let root = createRoot(() => null);
  let first = new FakeWebSocket();
  let second = new FakeWebSocket();
  let messages = [];
  let disconnectCount = 0;

  root._enqueueMessage = (...args) => messages.push(args);
  root.disconnectWindow = () => disconnectCount++;

  let sendFirst = root._setupWsListeners(first, 7);
  let sendSecond = root._setupWsListeners(second, 7);

  assert.equal(first.closed, true);

  first.emit('message', 'stale');
  first.emit('close');
  sendFirst('stale');

  assert.deepEqual(messages, []);
  assert.equal(disconnectCount, 0);
  assert.deepEqual(first.sent, []);

  second.emit('message', 'current');
  sendSecond('out');

  assert.deepEqual(messages, [[7, 'current']]);
  assert.deepEqual(second.sent, ['out']);

  second.emit('close');
  assert.equal(disconnectCount, 1);
  sendSecond('late');
  assert.deepEqual(second.sent, ['out']);
});

test('closing a window connection clears ownership before close fires', () => {
  let root = createRoot(() => null);
  let ws = new FakeWebSocket();
  let disconnectCount = 0;

  root.disconnectWindow = () => disconnectCount++;
  root._setupWsListeners(ws, 9);
  root._closeWindowConnection(9);

  assert.equal(ws.closed, true);
  assert.equal(disconnectCount, 0);
  assert.equal(root.windowConnectionMap.has(9), false);
});

test('output pressure closes a window with the overload code', () => {
  let root = createRoot(() => null);
  let ws = new FakeWebSocket();
  let released = false;
  let window = {
    id: 10,
    destroyed: false,
    retainedOutputBytes: 8,
    outputProgressListed: false,
    destroy() {
      this.destroyed = true;
      released = true;
    }
  };

  root._setupWsListeners(ws, window.id);
  root._expireWindowForOutputBacklog(window);

  assert.equal(ws.closed, true);
  assert.equal(ws.closeCode, 3002);
  assert.equal(root.windowConnectionMap.has(window.id), false);
  assert.equal(released, true);
});

test('progress acknowledgements bypass application input rate limiting', () => {
  let root = createRoot(() => null);
  let limiterCalls = 0;
  let window = new Window(
    root,
    { windowId: '123456789012345678901' },
    null,
    null,
    () => {}
  );
  registerWindow(window);
  window.flushCommandBuffer();

  root.messageLimiter = {
    consumeSync() {
      limiterCalls++;
      return false;
    }
  };

  let acknowledgement = Buffer.alloc(6);
  acknowledgement.writeUInt32LE(window.global_publishOffset, 2);
  root._enqueueMessage(window.id, acknowledgement);

  let applicationEvent = Buffer.alloc(10);
  applicationEvent.writeUInt16LE(1, 0);
  applicationEvent.writeUInt32LE(window.global_publishOffset, 2);
  applicationEvent.writeUInt8(8, 8);
  root._enqueueMessage(window.id, applicationEvent);

  assert.equal(limiterCalls, 1);
  assert.equal(root.droppedMessagesCount, 1);
  assert.equal(window.global_readOffset, window.global_publishOffset);
  deregisterWindow(window);
});

test('one global maintenance wheel probes only windows whose deadline is due', () => {
  let root = createRoot(() => null);
  let output = [];
  let window = new Window(
    root,
    { windowId: '123456789012345678901' },
    null,
    null,
    buffer => output.push(buffer)
  );

  root._trackWindow(window);
  let now = Date.now();
  root._scheduleWindowMaintenance(
    window,
    now - root.config.windowMaintenanceTickMs
  );
  root.windowMaintenanceLastTick = Math.floor(
    now / root.config.windowMaintenanceTickMs
  ) - 1;
  root._runWindowMaintenance(now);

  assert.equal(output.length, 1);
  assert.deepEqual(output[0], Buffer.from([0]));
  assert.equal(
    window.maintenanceState,
    WINDOW_MAINTENANCE_WAITING_FOR_ACK
  );
  assert.equal(root.windowMaintenanceTimer != null, true);

  window.destroy();
  root._untrackWindow(window);
  assert.equal(root.windowMaintenanceTimer, null);
});

test('idle windows wait 60 seconds while stale output requests an ACK at 30 seconds', () => {
  let root = createRoot(() => null);
  root.configure({
    SENIMAN_IDLE_PROBE_INTERVAL_MS: '60000',
    SENIMAN_IDLE_PROBE_JITTER_MS: '0',
    SENIMAN_STALE_OUTPUT_ACKNOWLEDGEMENT_MS: '30000'
  });
  let output = [];
  let window = new Window(
    root,
    { windowId: '123456789012345678901' },
    null,
    null,
    buffer => output.push(buffer)
  );

  let trackedAt = Date.now();
  root._trackWindow(window);
  let idleDeadline =
    window.maintenanceDueTick * root.config.windowMaintenanceTickMs;
  assert.equal(idleDeadline >= trackedAt + 60000, true);
  assert.equal(idleDeadline <= Date.now() + 60000, true);
  assert.equal(output.length, 0);

  window.enableOutputRetentionTracking();
  let publishedAt = Date.now();
  window.flushCommandBuffer();
  let acknowledgementDeadline =
    window.maintenanceDueTick * root.config.windowMaintenanceTickMs;
  assert.equal(acknowledgementDeadline >= publishedAt + 30000, true);
  assert.equal(acknowledgementDeadline <= Date.now() + 30000, true);
  assert.equal(output.length, 1);

  window.destroy();
  root._untrackWindow(window);
});

test('an unanswered probe closes the socket and retains a disconnected window', () => {
  let root = createRoot(() => null);
  let socket = new FakeWebSocket();
  let window = new Window(
    root,
    { windowId: '123456789012345678901' },
    null,
    null,
    () => {}
  );

  root._trackWindow(window);
  root._setupWsListeners(socket, window.id);
  root._sendWindowProbe(window, 1000);
  root._maintainWindow(window, 11000);

  assert.equal(socket.closed, true);
  assert.equal(window.connected, false);
  assert.equal(window.destroyed, false);
  assert.equal(window.maintenanceState, WINDOW_MAINTENANCE_DISCONNECTED);
  assert.equal(
    window.maintenanceDueTick * root.config.windowMaintenanceTickMs,
    11000 + root.config.disconnectedWindowDestroyMs
  );

  window.destroy();
  root._untrackWindow(window);
});
