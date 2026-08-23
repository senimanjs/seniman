import { WebSocket } from '../../../packages/seniman/node_modules/ws/wrapper.mjs';
import { performance } from 'node:perf_hooks';

const CMD_PING = 0;
const CMD_CHANNEL_MESSAGE = 15;

const ARGTYPE_STRING = 1;
const ARGTYPE_INT16 = 2;
const ARGTYPE_INT32 = 3;
const ARGTYPE_FLOAT64 = 4;
const ARGTYPE_BOOLEAN = 5;
const ARGTYPE_NULL = 6;
const ARGTYPE_HANDLER = 7;
const ARGTYPE_ARRAY = 8;
const ARGTYPE_OBJECT = 9;

function decodeServerValues(buffer, initialOffset) {
  let offset = initialOffset;
  const count = buffer.readUInt8(offset++);

  function decodeValue() {
    const type = buffer.readUInt8(offset++);

    if (type === ARGTYPE_STRING) {
      const length = buffer.readUInt16BE(offset);
      offset += 2;
      const value = buffer.toString('utf8', offset, offset + length);
      offset += length;
      return value;
    }
    if (type === ARGTYPE_INT16) {
      const value = buffer.readInt16BE(offset);
      offset += 2;
      return value;
    }
    if (type === ARGTYPE_INT32) {
      const value = buffer.readInt32BE(offset);
      offset += 4;
      return value;
    }
    if (type === ARGTYPE_FLOAT64) {
      const value = buffer.readDoubleBE(offset);
      offset += 8;
      return value;
    }
    if (type === ARGTYPE_BOOLEAN) {
      return buffer.readUInt8(offset++) === 1;
    }
    if (type === ARGTYPE_NULL) {
      return null;
    }
    if (type === ARGTYPE_HANDLER) {
      const id = buffer.readUInt16BE(offset);
      offset += 2;
      return { type: 'handler', id };
    }
    if (type === ARGTYPE_ARRAY) {
      const length = buffer.readUInt16BE(offset);
      offset += 2;
      return Array.from({ length }, decodeValue);
    }
    if (type === ARGTYPE_OBJECT) {
      const length = buffer.readUInt16BE(offset);
      offset += 2;
      const value = {};
      for (let index = 0; index < length; index++) {
        const keyLength = buffer.readUInt16BE(offset);
        offset += 2;
        const key = buffer.toString('utf8', offset, offset + keyLength);
        offset += keyLength;
        value[key] = decodeValue();
      }
      return value;
    }

    throw new Error(`Unsupported server value type in capacity protocol client: ${type}`);
  }

  return Array.from({ length: count }, decodeValue);
}

function createInputMessage(handlerId, readOffset, args = []) {
  if (args.length === 0) {
    const message = Buffer.allocUnsafe(10);
    message.writeUInt16LE(handlerId, 0);
    message.writeUInt32LE(readOffset >>> 0, 2);
    message.writeUInt16LE(0, 6); // empty string table
    message.writeUInt8(8, 8); // encoded argument Array
    message.writeUInt8(0, 9); // zero arguments
    return message;
  }

  if (args.length !== 1 || typeof args[0] !== 'string') {
    throw new Error('Capacity protocol client only supports zero args or one string arg');
  }

  const encoded = Buffer.from(args[0]);
  const message = Buffer.allocUnsafe(15 + encoded.length);
  message.writeUInt16LE(handlerId, 0);
  message.writeUInt32LE(readOffset >>> 0, 2);
  message.writeUInt16LE(encoded.length, 6);
  encoded.copy(message, 8);
  let offset = 8 + encoded.length;
  message.writeUInt8(8, offset++); // encoded argument Array
  message.writeUInt8(1, offset++); // one argument
  message.writeUInt8(1, offset++); // encoded String
  message.writeUInt16LE(0, offset);
  offset += 2;
  message.writeUInt16LE(args[0].length, offset);
  return message;
}

function createAcknowledgement(readOffset) {
  const message = Buffer.allocUnsafe(6);
  message.writeUInt16LE(0, 0);
  message.writeUInt32LE(readOffset >>> 0, 2);
  return message;
}

function createCloseMessage() {
  return Buffer.alloc(2);
}

function serverFrameBytes(payloadBytes) {
  return payloadBytes + (payloadBytes < 126 ? 2 : payloadBytes <= 65535 ? 4 : 10);
}

export class ProtocolClient {
  constructor({ id, port, expectedHandlerCount }) {
    this.id = id;
    this.port = port;
    this.expectedHandlerCount = expectedHandlerCount;
    this.origin = `http://127.0.0.1:${port}`;
    this.readOffset = 0;
    this.windowId = '';
    this.handlerIds = [];
    this.bytesReceived = 0;
    this.tcpEgressBytesClosed = 0;
    this.counterUpdateEgressBytes = 0;
    this.acknowledgementsEnabled = true;
    this.closeCode = null;
    this.closePromise = null;
    this.resolveClose = null;
    this.pendingClick = null;
    this.selectionHandlerIds = [];
    this.socket = null;
  }

  async connect({ reconnect = false } = {}) {
    const location = encodeURIComponent(`/?benchmarkClient=${this.id}`);
    const url = `ws://127.0.0.1:${this.port}/?wi=${reconnect ? this.windowId : ''}&ro=${this.readOffset}&vs=1280x720&lo=${location}&vh=capacity`;

    await new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { origin: this.origin, perMessageDeflate: false });
      this.socket = socket;
      this.closeCode = null;
      this.closePromise = new Promise(resolve => {
        this.resolveClose = resolve;
      });
      let receivedMessage = false;
      let ready = false;

      const timeout = setTimeout(() => {
        reject(new Error(`Client ${this.id} timed out during connection`));
        socket.terminate();
      }, 60000);

      const maybeReady = () => {
        const initialConnectionReady = this.windowId && this.handlerIds.length === this.expectedHandlerCount;
        if ((reconnect && receivedMessage) || (!reconnect && initialConnectionReady)) {
          ready = true;
          clearTimeout(timeout);
          resolve();
        }
      };

      socket.once('open', maybeReady);
      socket.once('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
      socket.once('close', code => {
        this._recordClosedSocketEgress(socket);
        this.closeCode = code;
        this.resolveClose?.(code);
        this.resolveClose = null;

        if (this.pendingClick) {
          const pending = this.pendingClick;
          this.pendingClick = null;
          pending.reject(new Error(`Client ${this.id} closed during click (code ${code})`));
        }

        if (!ready) {
          clearTimeout(timeout);
          reject(new Error(`Client ${this.id} closed before it was ready (code ${code})`));
        }
      });
      socket.on('message', data => {
        receivedMessage = true;
        const message = Buffer.from(data);
        this.bytesReceived += message.length;

        if (process.env.SENIMAN_CAPACITY_DEBUG === '1') {
          console.error(`client=${this.id} opcode=${message[0]} bytes=${message.length}`);
        }

        if (!this.windowId && message.length >= 22 && message.readUInt8(0) === 2) {
          this.windowId = message.toString('utf8', 1, 22);
        }

        if (message.length === 1 && message.readUInt8(0) === CMD_PING) {
          if (this.acknowledgementsEnabled) {
            this.sendAcknowledgement(this.readOffset);
          }
          maybeReady();
          return;
        }

        if (message.length >= 4 && message.readUInt8(0) === CMD_CHANNEL_MESSAGE) {
          const values = decodeServerValues(message, 3);
          const announcement = values[0];
          if (announcement?.type === 'benchmark-handlers') {
            this.handlerIds = announcement.handlerIds;
            if (process.env.SENIMAN_CAPACITY_DEBUG === '1') {
              console.error(`client=${this.id} handlers=${this.handlerIds.length}`);
            }
          } else if (announcement?.type === 'benchmark-selection-handlers') {
            this.selectionHandlerIds = announcement.handlerIds;
            this.handlerIds = announcement.handlerIds;
          }
        }

        this.readOffset += message.length;

        if (this.pendingClick) {
          const pending = this.pendingClick;
          this.pendingClick = null;
          this.counterUpdateEgressBytes += serverFrameBytes(message.length);
          const endedAtEpochMs = performance.timeOrigin + performance.now();
          const latencyMs = Number(process.hrtime.bigint() - pending.startedAt) / 1e6;
          pending.resolve(pending.captureTiming
            ? {
                startedAtEpochMs: pending.startedAtEpochMs,
                endedAtEpochMs,
                latencyMs,
              }
            : latencyMs);
        }

        maybeReady();
      });
    });
  }

  sendAcknowledgement(offset) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(createAcknowledgement(offset));
    }
  }

  // Backward-compatible test-helper name. Protocol pongs now carry only the
  // cumulative read acknowledgement, so both helpers send the same frame.
  sendPong(offset) {
    this.sendAcknowledgement(offset);
  }

  async click(handlerId, timeoutMs = 5000, { captureTiming = false, args = [] } = {}) {
    if (this.pendingClick) {
      throw new Error(`Client ${this.id} already has an outstanding click`);
    }
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error(`Client ${this.id} is not connected`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingClick = null;
        reject(new Error(`Client ${this.id} click timed out`));
      }, timeoutMs);

      this.pendingClick = {
        startedAt: process.hrtime.bigint(),
        startedAtEpochMs: performance.timeOrigin + performance.now(),
        captureTiming,
        reject,
        resolve: latency => {
          clearTimeout(timeout);
          resolve(latency);
        },
      };
      this.socket.send(createInputMessage(handlerId, this.readOffset, args));
    });
  }

  randomHandlerId() {
    return this.handlerIds[Math.floor(Math.random() * this.handlerIds.length)];
  }

  randomSelectionHandlerId() {
    return this.selectionHandlerIds[
      Math.floor(Math.random() * this.selectionHandlerIds.length)
    ];
  }

  setAcknowledgementsEnabled(enabled) {
    this.acknowledgementsEnabled = enabled;
  }

  async waitForClose(timeoutMs = 5000) {
    if (this.closeCode != null) {
      return this.closeCode;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(
        new Error(`Client ${this.id} did not close in time`)
      ), timeoutMs);

      this.closePromise.then(code => {
        clearTimeout(timeout);
        resolve(code);
      });
    });
  }

  async disconnect() {
    await this.closeSocket();
  }

  async reconnect() {
    await this.connect({ reconnect: true });
  }

  async destroy() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(createCloseMessage());
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await this.closeSocket();
  }

  async closeSocket() {
    const socket = this.socket;
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      return;
    }

    await new Promise(resolve => {
      const timeout = setTimeout(() => {
        socket.terminate();
        resolve();
      }, 1000);
      socket.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.close();
    });
  }

  _recordClosedSocketEgress(socket) {
    if (socket._capacityEgressRecorded) return;
    socket._capacityEgressRecorded = true;
    this.tcpEgressBytesClosed += socket._socket?.bytesRead || 0;
  }

  egressBytes() {
    const current = this.socket;
    const currentBytes = current && !current._capacityEgressRecorded
      ? current._socket?.bytesRead || 0
      : 0;
    return this.tcpEgressBytesClosed + currentBytes;
  }
}
