import { monitorEventLoopDelay } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadFixture } from './fixture-registry.mjs';

const capacityDirectory = path.dirname(fileURLToPath(import.meta.url));
const senimanDirectory = process.env.SENIMAN_CAPACITY_PACKAGE_DIR
  ? path.resolve(process.env.SENIMAN_CAPACITY_PACKAGE_DIR)
  : path.resolve(capacityDirectory, '../../../packages/seniman');
const senimanDistUrl = pathToFileURL(path.join(senimanDirectory, 'dist/')).href;
const { createServer } = await import('node:http');
const { createEntrypoint } = await import(`${senimanDistUrl}entrypoint.node.js`);
const schedulerModule = await import(`${senimanDistUrl}scheduler.js`);
const scheduler_getMemorySize = schedulerModule.scheduler_getMemorySize || (() => 0);
const scheduler_getMemoryGrowthCount = schedulerModule.scheduler_getMemoryGrowthCount || (() => 0);

const profile = process.env.SENIMAN_CAPACITY_PROFILE || 'interactive-counters';
const counterCount = Number(process.env.SENIMAN_CAPACITY_COUNTER_COUNT || 50);
const outputBytes = Number(process.env.SENIMAN_CAPACITY_OUTPUT_BYTES || 0);
const fixtureModule = await loadFixture(profile);
const fixture = fixtureModule.createFixture({ counterCount, outputBytes });
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelay.enable();

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
