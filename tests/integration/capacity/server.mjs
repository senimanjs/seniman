import {
  monitorEventLoopDelay,
  performance,
  PerformanceObserver,
} from 'node:perf_hooks';
import { Session } from 'node:inspector';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeHeapSnapshot } from 'node:v8';
import { loadFixture } from './fixture-registry.mjs';

const capacityDirectory = path.dirname(fileURLToPath(import.meta.url));
const senimanDirectory = process.env.SENIMAN_CAPACITY_PACKAGE_DIR
  ? path.resolve(process.env.SENIMAN_CAPACITY_PACKAGE_DIR)
  : path.resolve(capacityDirectory, '../../../packages/seniman');
const senimanDistUrl = pathToFileURL(path.join(senimanDirectory, 'dist/')).href;
const { createServer } = await import('node:http');
const { createEntrypoint } = await import(`${senimanDistUrl}entrypoint.node.js`);
const { Window } = await import(`${senimanDistUrl}window.js`);
const schedulerModule = await import(`${senimanDistUrl}scheduler.js`);
const scheduler_getMemorySize = schedulerModule.scheduler_getMemorySize || (() => 0);
const scheduler_getMemoryGrowthCount = schedulerModule.scheduler_getMemoryGrowthCount || (() => 0);

const profile = process.env.SENIMAN_CAPACITY_PROFILE || 'interactive-counters';
const counterCount = Number(process.env.SENIMAN_CAPACITY_COUNTER_COUNT || 50);
const outputBytes = Number(process.env.SENIMAN_CAPACITY_OUTPUT_BYTES || 0);
const disablePingPong = process.env.SENIMAN_CAPACITY_DISABLE_PING_PONG === '1';
const smallFrameSend = process.env.SENIMAN_CAPACITY_SMALL_FRAME_SEND === '1';
const smallFrameSendStats = { hits: 0, fallbacks: 0 };

if (disablePingPong) {
  Window.prototype.startPingLoop = function startDisabledPingLoop() {};
}

if (smallFrameSend) {
  const wsModuleUrl = pathToFileURL(
    path.join(senimanDirectory, 'node_modules/ws/wrapper.mjs')
  ).href;
  const { default: WebSocket } = await import(wsModuleUrl);
  const standardSend = WebSocket.prototype.send;
  const headerStorage = Buffer.allocUnsafeSlow(126 * 2);
  const binaryHeaders = Array.from({ length: 126 }, (_, length) => {
    let offset = length * 2;
    headerStorage[offset] = 0x82;
    headerStorage[offset + 1] = length;
    return headerStorage.subarray(offset, offset + 2);
  });

  WebSocket.prototype.send = function sendWithSmallFrameFastPath(
    data,
    options,
    callback
  ) {
    let sender = this._sender;

    if (
      this._isServer &&
      this.readyState === WebSocket.OPEN &&
      options === undefined &&
      callback === undefined &&
      Buffer.isBuffer(data) &&
      data.length <= 125 &&
      sender?._state === 0 &&
      sender._queue.length === 0 &&
      Object.keys(this._extensions).length === 0
    ) {
      smallFrameSendStats.hits++;
      let socket = sender._socket;
      socket.cork();
      socket.write(binaryHeaders[data.length]);
      socket.write(data);
      socket.uncork();
      return;
    }

    smallFrameSendStats.fallbacks++;
    return standardSend.call(this, data, options, callback);
  };
}

const fixtureModule = await loadFixture(profile);
const fixture = fixtureModule.createFixture({ counterCount, outputBytes });
const eventLoopDelay = monitorEventLoopDelay({ resolution: 1 });
eventLoopDelay.enable();

const runtimeDiagnostics = {
  active: false,
  eventLoopStalls: [],
  gcPauses: [],
  allocationProfile: null,
  allocationSampling: false,
  lagTimer: null,
  lastLagSampleMs: 0,
  startedAtEpochMs: null,
};

let inspectorSession = null;

function inspectorPost(method, params = {}) {
  if (!inspectorSession) {
    inspectorSession = new Session();
    inspectorSession.connect();
  }

  return new Promise((resolve, reject) => {
    inspectorSession.post(method, params, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

const gcObserver = new PerformanceObserver(list => {
  if (!runtimeDiagnostics.active) return;

  for (const entry of list.getEntries()) {
    const detail = entry.detail || {};
    runtimeDiagnostics.gcPauses.push({
      startEpochMs: performance.timeOrigin + entry.startTime,
      durationMs: entry.duration,
      kind: detail.kind ?? entry.kind ?? null,
      flags: detail.flags ?? entry.flags ?? null,
    });
  }
});
gcObserver.observe({ entryTypes: ['gc'] });

function sampleRuntimeEventLoopLag() {
  if (!runtimeDiagnostics.active) return;

  const nowMs = performance.now();
  const expectedMs = runtimeDiagnostics.lastLagSampleMs + 1;
  const delayMs = Math.max(0, nowMs - expectedMs);
  if (delayMs >= 0.5) {
    runtimeDiagnostics.eventLoopStalls.push({
      startEpochMs: performance.timeOrigin + expectedMs,
      durationMs: delayMs,
    });
  }

  runtimeDiagnostics.lastLagSampleMs = nowMs;
}

async function startRuntimeDiagnostics({ captureAllocations = false } = {}) {
  clearInterval(runtimeDiagnostics.lagTimer);
  runtimeDiagnostics.allocationProfile = null;
  runtimeDiagnostics.allocationSampling = captureAllocations;

  if (captureAllocations) {
    await inspectorPost('HeapProfiler.startSampling', {
      samplingInterval: 32768,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
  }

  runtimeDiagnostics.active = true;
  runtimeDiagnostics.eventLoopStalls = [];
  runtimeDiagnostics.gcPauses = [];
  runtimeDiagnostics.startedAtEpochMs = performance.timeOrigin + performance.now();
  runtimeDiagnostics.lastLagSampleMs = performance.now();
  runtimeDiagnostics.lagTimer = setInterval(sampleRuntimeEventLoopLag, 1);
}

async function stopRuntimeDiagnostics() {
  await new Promise(resolve => setImmediate(resolve));
  const endedAtEpochMs = performance.timeOrigin + performance.now();
  runtimeDiagnostics.active = false;
  clearInterval(runtimeDiagnostics.lagTimer);
  runtimeDiagnostics.lagTimer = null;

  if (runtimeDiagnostics.allocationSampling) {
    const { profile } = await inspectorPost('HeapProfiler.stopSampling');
    runtimeDiagnostics.allocationProfile = profile;
    runtimeDiagnostics.allocationSampling = false;
  }

  return {
    startedAtEpochMs: runtimeDiagnostics.startedAtEpochMs,
    endedAtEpochMs,
    eventLoopStalls: runtimeDiagnostics.eventLoopStalls,
    gcPauses: runtimeDiagnostics.gcPauses.filter(entry =>
      entry.startEpochMs >= runtimeDiagnostics.startedAtEpochMs &&
      entry.startEpochMs <= endedAtEpochMs
    ),
    allocationProfile: runtimeDiagnostics.allocationProfile,
  };
}

const entrypoint = createEntrypoint(fixture.root, {
  allowedOrigins: ['127.0.0.1'],
  perMessageDeflate: false,
});
const server = createServer(entrypoint.request);
server.on('upgrade', entrypoint.upgrade);

server.listen(0, '127.0.0.1', () => {
  process.send?.({
    type: 'ready',
    port: server.address().port,
    fixture: fixture.metadata,
  });
});

const milliseconds = nanoseconds => Number(nanoseconds) / 1e6;

async function collectSample(forceGc) {
  const natural = process.memoryUsage();
  const beforeGcCpu = process.cpuUsage();
  const beforeGcTimeMs = Number(process.hrtime.bigint()) / 1e6;
  let postGc = null;

  if (forceGc && global.gc) {
    global.gc();
    await new Promise(resolve => setImmediate(resolve));
    global.gc();
    postGc = process.memoryUsage();
  }

  const afterGcCpu = process.cpuUsage();
  const afterGcTimeMs = Number(process.hrtime.bigint()) / 1e6;

  const sample = {
    natural,
    postGc,
    cpu: afterGcCpu,
    measurement: {
      beforeGcCpu,
      afterGcCpu,
      beforeGcTimeMs,
      afterGcTimeMs,
    },
    eventLoop: {
      meanMs: milliseconds(eventLoopDelay.mean),
      p50Ms: milliseconds(eventLoopDelay.percentile(50)),
      p95Ms: milliseconds(eventLoopDelay.percentile(95)),
      p99Ms: milliseconds(eventLoopDelay.percentile(99)),
      maxMs: milliseconds(eventLoopDelay.max),
    },
    scheduler: {
      wasmMemoryBytes: scheduler_getMemorySize(),
      wasmMemoryGrowthCount: scheduler_getMemoryGrowthCount(),
    },
    transport: {
      smallFrameSend,
      ...smallFrameSendStats,
    },
    fixture: fixture.getMetrics(),
  };

  eventLoopDelay.reset();
  return sample;
}

process.on('message', async message => {
  if (message.type === 'sample') {
    process.send?.({
      type: 'sample',
      requestId: message.requestId,
      sample: await collectSample(message.forceGc),
    });
  } else if (message.type === 'configure') {
    fixture.root.configure(message.env);
    process.send?.({ type: 'configured', requestId: message.requestId });
  } else if (message.type === 'start-runtime-diagnostics') {
    await startRuntimeDiagnostics({ captureAllocations: message.captureAllocations });
    process.send?.({ type: 'runtime-diagnostics-started', requestId: message.requestId });
  } else if (message.type === 'stop-runtime-diagnostics') {
    process.send?.({
      type: 'runtime-diagnostics',
      requestId: message.requestId,
      diagnostics: await stopRuntimeDiagnostics(),
    });
  } else if (message.type === 'heap-snapshot') {
    let filename = writeHeapSnapshot(message.filename);
    process.send?.({
      type: 'heap-snapshot-written',
      requestId: message.requestId,
      filename,
    });
  } else if (message.type === 'stop') {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  }
});

process.on('uncaughtException', error => {
  process.send?.({ type: 'fatal', error: error.stack || String(error) });
  process.exit(1);
});

process.on('unhandledRejection', error => {
  process.send?.({ type: 'fatal', error: error?.stack || String(error) });
  process.exit(1);
});
