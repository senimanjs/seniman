import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot } from '../dist/window_manager.js';

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
