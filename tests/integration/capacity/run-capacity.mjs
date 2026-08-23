import { fork, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProtocolClient } from './protocol-client.mjs';

const capacityDirectory = path.dirname(fileURLToPath(import.meta.url));

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index].startsWith('--')) {
      values[argv[index].slice(2)] = argv[index + 1];
      index++;
    }
  }

  const output = values.output || path.join(capacityDirectory, 'results/latest.json');

  return {
    profile: values.profile || 'interactive-counters',
    steps: (values.steps || '100').split(',').map(Number),
    counterCount: Number(values['counter-count'] || 50),
    batchSize: Number(values['batch-size'] || 100),
    batchDelayMs: Number(values['batch-delay-ms'] || 25),
    settleMs: Number(values['settle-ms'] || 3000),
    activePercent: Number(values['active-percent'] || 10),
    clicksPerSecond: Number(values['clicks-per-second'] || 0.5),
    activitySeconds: Number(values['activity-seconds'] || 10),
    disconnectPercent: Number(values['disconnect-percent'] || 20),
    maxOldSpaceMb: Number(values['max-old-space-mb'] || 16384),
    runtimeDiagnostics: values['runtime-diagnostics'] === '1',
    allocationProfile: values['allocation-profile'] === '1',
    disablePingPong: values['disable-ping-pong'] === '1',
    smallFrameSend: values['small-frame-send'] === '1',
    allocationProfileOutput:
      values['allocation-profile-output'] || `${output}.heapprofile`,
    heapSnapshot: values['heap-snapshot'] === '1',
    heapSnapshotOutput:
      values['heap-snapshot-output'] || `${output}.heapsnapshot`,
    forceGcSamples: values['force-gc-samples'] !== '0',
    teardownBatchSize: Number(
      values['teardown-batch-size'] || values['batch-size'] || 100
    ),
    output,
  };
}

function percentile(sorted, value) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)];
}

function summarizeLatencies(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? null,
  };
}

function summarizeDurations(events) {
  const durations = events.map(event => event.durationMs).sort((a, b) => a - b);
  return {
    count: durations.length,
    totalMs: durations.reduce((total, duration) => total + duration, 0),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    maxMs: durations.at(-1) ?? null,
  };
}

function eventOverlapsClick(event, click) {
  return event.startEpochMs <= click.endedAtEpochMs &&
    event.startEpochMs + event.durationMs >= click.startedAtEpochMs;
}

function correlateRuntimeDiagnostics(activity, diagnostics) {
  const clickTimings = activity.clickTimings || [];
  const slowCutoffMs = activity.latency.p95Ms;

  const correlateEvents = events => {
    const overlappingLatencies = [];
    const nonOverlappingLatencies = [];
    let slowClicksOverlapping = 0;

    for (const click of clickTimings) {
      const overlaps = events.some(event => eventOverlapsClick(event, click));
      (overlaps ? overlappingLatencies : nonOverlappingLatencies).push(click.latencyMs);
      if (overlaps && click.latencyMs >= slowCutoffMs) slowClicksOverlapping++;
    }

    return {
      events: summarizeDurations(events),
      clicksOverlapping: overlappingLatencies.length,
      slowClicksOverlapping,
      slowClickOverlapPercent: activity.latency.count
        ? slowClicksOverlapping / Math.max(1, clickTimings.filter(
            click => click.latencyMs >= slowCutoffMs
          ).length) * 100
        : null,
      overlappingLatency: summarizeLatencies(overlappingLatencies),
      nonOverlappingLatency: summarizeLatencies(nonOverlappingLatencies),
    };
  };

  return {
    slowCutoffMs,
    eventLoop: correlateEvents(diagnostics.eventLoopStalls),
    gc: correlateEvents(diagnostics.gcPauses),
    topSlowClicks: [...clickTimings]
      .sort((a, b) => b.latencyMs - a.latencyMs)
      .slice(0, 100)
      .map(click => ({
        ...click,
        overlapsEventLoopStall: diagnostics.eventLoopStalls.some(
          event => eventOverlapsClick(event, click)
        ),
        overlapsGc: diagnostics.gcPauses.some(event => eventOverlapsClick(event, click)),
      })),
  };
}

function cpuDifference(current, previous) {
  return {
    user: current.user - previous.user,
    system: current.system - previous.system,
  };
}

function deriveCpuPhases(samples) {
  return samples.slice(1).map((sample, index) => {
    const previous = samples[index];
    const startCpu = previous.measurement?.afterGcCpu || previous.cpu;
    const endCpu = sample.measurement?.beforeGcCpu || sample.cpu;
    const cpu = cpuDifference(endCpu, startCpu);
    const totalCpuMs = (cpu.user + cpu.system) / 1000;
    const elapsedWallMs = sample.measurement && previous.measurement
      ? sample.measurement.beforeGcTimeMs - previous.measurement.afterGcTimeMs
      : null;
    const clickCount = sample.fixture.clicksHandled - previous.fixture.clicksHandled;
    const newWindowCount = Math.max(
      0,
      sample.fixture.activeWindows - previous.fixture.activeWindows
    );

    return {
      from: previous.label,
      phase: sample.label,
      elapsedWallMs,
      userCpuMs: cpu.user / 1000,
      systemCpuMs: cpu.system / 1000,
      totalCpuMs,
      averageCpuCores: elapsedWallMs ? totalCpuMs / elapsedWallMs : null,
      clickCount,
      cpuMsPerClick: clickCount ? totalCpuMs / clickCount : null,
      newWindowCount,
      cpuMsPerNewWindow: newWindowCount ? totalCpuMs / newWindowCount : null,
    };
  });
}

export const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function runBatched(items, batchSize, operation, delayMs = 0) {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map(operation));
    if (delayMs && index + batchSize < items.length) await wait(delayMs);
  }
}

export async function startMeasuredServer(options) {
  const execArgv = [
    '--expose-gc',
    `--max-old-space-size=${options.maxOldSpaceMb || 16384}`,
  ];
  const cpuProfileDirectory = process.env.SENIMAN_CAPACITY_CPU_PROFILE_DIR;

  if (cpuProfileDirectory) {
    execArgv.push(
      '--cpu-prof',
      `--cpu-prof-dir=${cpuProfileDirectory}`,
      `--cpu-prof-name=scheduler-${process.env.SENIMAN_SCHEDULER || 'wasm'}.cpuprofile`
    );
  }

  const child = fork(path.join(capacityDirectory, 'server.mjs'), [], {
    env: {
      ...process.env,
      SENIMAN_CAPACITY_PROFILE: options.profile,
      SENIMAN_CAPACITY_COUNTER_COUNT: String(options.counterCount),
      SENIMAN_CAPACITY_OUTPUT_BYTES: String(options.outputBytes || 0),
      SENIMAN_CAPACITY_DISABLE_PING_PONG: options.disablePingPong ? '1' : '0',
      SENIMAN_CAPACITY_SMALL_FRAME_SEND: options.smallFrameSend ? '1' : '0',
    },
    execArgv,
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });

  let requestId = 0;
  const requests = new Map();
  let fatalError = null;

  child.on('message', message => {
    if (message.type === 'sample') {
      requests.get(message.requestId)?.resolve(message.sample);
      requests.delete(message.requestId);
    } else if (message.type === 'configured') {
      requests.get(message.requestId)?.resolve();
      requests.delete(message.requestId);
    } else if (message.type === 'runtime-diagnostics-started') {
      requests.get(message.requestId)?.resolve();
      requests.delete(message.requestId);
    } else if (message.type === 'runtime-diagnostics') {
      requests.get(message.requestId)?.resolve(message.diagnostics);
      requests.delete(message.requestId);
    } else if (message.type === 'heap-snapshot-written') {
      requests.get(message.requestId)?.resolve(message.filename);
      requests.delete(message.requestId);
    } else if (message.type === 'fatal') {
      fatalError = new Error(message.error);
    }
  });

  const ready = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Capacity server did not start')), 10000);
    const onMessage = message => {
      if (message.type === 'ready') {
        clearTimeout(timeout);
        child.off('message', onMessage);
        resolve(message);
      }
    };
    child.on('message', onMessage);
    child.once('exit', code => reject(new Error(`Capacity server exited during startup (${code})`)));
  });

  return {
    child,
    ready,
    async sample({ forceGc = true } = {}) {
      if (fatalError) throw fatalError;
      const id = ++requestId;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          requests.delete(id);
          reject(new Error('Timed out collecting server sample'));
        }, 10000);
        requests.set(id, {
          resolve: sample => {
            clearTimeout(timeout);
            resolve(sample);
          },
        });
        child.send({ type: 'sample', requestId: id, forceGc });
      });
    },
    async configure(env) {
      if (fatalError) throw fatalError;
      const id = ++requestId;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          requests.delete(id);
          reject(new Error('Timed out configuring capacity server'));
        }, 10000);
        requests.set(id, {
          resolve: () => {
            clearTimeout(timeout);
            resolve();
          },
        });
        child.send({ type: 'configure', requestId: id, env });
      });
    },
    async startRuntimeDiagnostics({ captureAllocations = false } = {}) {
      if (fatalError) throw fatalError;
      const id = ++requestId;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          requests.delete(id);
          reject(new Error('Timed out starting runtime diagnostics'));
        }, 10000);
        requests.set(id, {
          resolve: () => {
            clearTimeout(timeout);
            resolve();
          },
        });
        child.send({
          type: 'start-runtime-diagnostics',
          requestId: id,
          captureAllocations,
        });
      });
    },
    async stopRuntimeDiagnostics() {
      if (fatalError) throw fatalError;
      const id = ++requestId;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          requests.delete(id);
          reject(new Error('Timed out stopping runtime diagnostics'));
        }, 10000);
        requests.set(id, {
          resolve: diagnostics => {
            clearTimeout(timeout);
            resolve(diagnostics);
          },
        });
        child.send({ type: 'stop-runtime-diagnostics', requestId: id });
      });
    },
    async takeHeapSnapshot(filename) {
      if (fatalError) throw fatalError;
      const id = ++requestId;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          requests.delete(id);
          reject(new Error('Timed out collecting server heap snapshot'));
        }, 180000);
        requests.set(id, {
          resolve: writtenFilename => {
            clearTimeout(timeout);
            resolve(writtenFilename);
          },
        });
        child.send({
          type: 'heap-snapshot',
          requestId: id,
          filename,
        });
      });
    },
    async stop() {
      if (child.exitCode !== null || !child.connected) return;
      await new Promise(resolve => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        child.send({ type: 'stop' });
      });
    },
  };
}

async function runActivity(clients, options) {
  const activeCount = Math.floor(clients.length * options.activePercent / 100);
  const activeClients = clients.slice(0, activeCount);
  const deadline = Date.now() + options.activitySeconds * 1000;
  const latencies = [];
  const clickTimings = [];
  let errors = 0;

  await Promise.all(activeClients.map(async client => {
    while (Date.now() < deadline) {
      const randomDelay = -Math.log(1 - Math.random()) / options.clicksPerSecond * 1000;
      await wait(Math.min(randomDelay, Math.max(0, deadline - Date.now())));
      if (Date.now() >= deadline) break;
      try {
        const result = await client.click(
          client.randomHandlerId(),
          5000,
          { captureTiming: options.runtimeDiagnostics }
        );
        if (options.runtimeDiagnostics) {
          latencies.push(result.latencyMs);
          clickTimings.push({ clientId: client.id, ...result });
        } else {
          latencies.push(result);
        }
      } catch {
        errors++;
      }
    }
  }));

  return {
    activeClients: activeCount,
    errors,
    latency: summarizeLatencies(latencies),
    ...(options.runtimeDiagnostics ? { clickTimings } : {}),
  };
}

export async function runCapacity(options) {
  const server = await startMeasuredServer(options);
  const clients = [];
  const samples = [];
  let activity = null;
  let runtimeDiagnostics = null;

  const takeSample = async label => {
    const sample = await server.sample({ forceGc: options.forceGcSamples });
    const egressBytes = clients.reduce((total, client) => total + client.egressBytes(), 0);
    const counterUpdateEgressBytes = clients.reduce(
      (total, client) => total + client.counterUpdateEgressBytes,
      0
    );
    samples.push({
      label,
      clients: clients.length,
      egressBytes,
      counterUpdateEgressBytes,
      ...sample,
    });
    console.log(
      `[capacity] ${label}: windows=${sample.fixture.activeWindows} ` +
      `rss=${(sample.natural.rss / 1024 / 1024).toFixed(1)}MB ` +
      `wasm=${(sample.scheduler.wasmMemoryBytes / 1024 / 1024).toFixed(1)}MB ` +
      `retained=${(sample.fixture.retainedOutputBytes / 1024 / 1024).toFixed(1)}MB`
    );
    return sample;
  };

  try {
    await takeSample('baseline');

    for (const target of options.steps) {
      const newClients = Array.from(
        { length: target - clients.length },
        (_, index) => new ProtocolClient({
          id: clients.length + index + 1,
          port: server.ready.port,
          expectedHandlerCount: options.counterCount,
        })
      );
      await runBatched(newClients, options.batchSize, client => client.connect(), options.batchDelayMs);
      clients.push(...newClients);
      await wait(options.settleMs);
      await takeSample(`connected-${target}`);

      if (
        options.heapSnapshot &&
        target === options.steps[options.steps.length - 1]
      ) {
        await mkdir(path.dirname(options.heapSnapshotOutput), {
          recursive: true,
        });
        await server.takeHeapSnapshot(path.resolve(options.heapSnapshotOutput));
      }
    }

    if (options.runtimeDiagnostics) {
      await server.startRuntimeDiagnostics({
        captureAllocations: options.allocationProfile,
      });
    }
    try {
      activity = await runActivity(clients, options);
    } finally {
      if (options.runtimeDiagnostics) {
        runtimeDiagnostics = await server.stopRuntimeDiagnostics();
      }
    }
    await takeSample('after-activity');

    const disconnectCount = Math.floor(clients.length * options.disconnectPercent / 100);
    const disconnected = clients.slice(0, disconnectCount);
    await runBatched(disconnected, options.batchSize, client => client.disconnect());
    await wait(Math.min(options.settleMs, 1000));
    await takeSample('disconnected');

    await runBatched(disconnected, options.batchSize, client => client.reconnect(), options.batchDelayMs);
    await wait(Math.min(options.settleMs, 1000));
    await takeSample('reconnected');

    await runBatched(
      clients,
      options.teardownBatchSize || options.batchSize,
      client => client.destroy()
    );
    await wait(1500);
    await takeSample('released');
  } finally {
    await Promise.allSettled(clients.map(client => client.closeSocket()));
    await server.stop();
  }

  let gitCommit = null;
  try {
    gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: path.resolve(capacityDirectory, '../../..'),
      encoding: 'utf8',
    }).trim();
  } catch {}

  const report = {
    generatedAt: new Date().toISOString(),
    gitCommit,
    system: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount: os.cpus().length,
      totalMemory: os.totalmem(),
    },
    options,
    fixture: server.ready.fixture,
    activity,
    runtimeDiagnostics,
    samples,
  };

  if (runtimeDiagnostics) {
    report.runtimeCorrelation = correlateRuntimeDiagnostics(activity, runtimeDiagnostics);
  }

  if (runtimeDiagnostics?.allocationProfile) {
    const allocationProfileOutput = options.allocationProfileOutput ||
      `${options.output}.heapprofile`;
    await mkdir(path.dirname(allocationProfileOutput), { recursive: true });
    await writeFile(
      allocationProfileOutput,
      JSON.stringify(runtimeDiagnostics.allocationProfile)
    );
    runtimeDiagnostics.allocationProfile = null;
    report.allocationProfileOutput = allocationProfileOutput;
  }

  const baseline = samples[0];
  report.cpuPhases = deriveCpuPhases(samples);
  report.egressPhases = samples.slice(1).map((sample, index) => {
    const previous = samples[index];
    const elapsedWallMs = sample.measurement.beforeGcTimeMs - previous.measurement.afterGcTimeMs;
    const egressBytes = sample.egressBytes - previous.egressBytes;
    return {
      from: previous.label,
      phase: sample.label,
      elapsedWallMs,
      egressBytes,
      averageBytesPerSecond: elapsedWallMs ? egressBytes * 1000 / elapsedWallMs : null,
    };
  });
  report.totalEgressBytes = samples.at(-1)?.egressBytes || 0;
  report.totalCounterUpdateEgressBytes = samples.at(-1)?.counterUpdateEgressBytes || 0;
  report.counterUpdateBytesPerClick = activity?.latency.count
    ? report.totalCounterUpdateEgressBytes / activity.latency.count
    : null;
  report.capacity = samples
    .filter(sample => sample.fixture.activeWindows > 0)
    .map(sample => ({
      phase: sample.label,
      windows: sample.fixture.activeWindows,
      naturalRssBytesPerWindow:
        (sample.natural.rss - baseline.natural.rss) / sample.fixture.activeWindows,
      postGcRssBytesPerWindow:
        sample.postGc && baseline.postGc
          ? (sample.postGc.rss - baseline.postGc.rss) / sample.fixture.activeWindows
          : null,
      postGcHeapBytesPerWindow:
        sample.postGc && baseline.postGc
          ? (sample.postGc.heapUsed - baseline.postGc.heapUsed) / sample.fixture.activeWindows
          : null,
    }));

  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, JSON.stringify(report, null, 2));

  console.table(samples.map(sample => ({
    phase: sample.label,
    windows: sample.fixture.activeWindows,
    rssMB: (sample.natural.rss / 1024 / 1024).toFixed(1),
    postGcMB: sample.postGc ? (sample.postGc.rss / 1024 / 1024).toFixed(1) : '-',
    wasmMB: (sample.scheduler.wasmMemoryBytes / 1024 / 1024).toFixed(1),
    heapMB: (sample.natural.heapUsed / 1024 / 1024).toFixed(1),
    clicks: sample.fixture.clicksHandled,
    egressMB: (sample.egressBytes / 1024 / 1024).toFixed(2),
  })));
  console.table(report.capacity.map(sample => ({
    phase: sample.phase,
    windows: sample.windows,
    rssKBPerWindow: (sample.naturalRssBytesPerWindow / 1024).toFixed(1),
    postGcHeapKBPerWindow: sample.postGcHeapBytesPerWindow == null
      ? '-'
      : (sample.postGcHeapBytesPerWindow / 1024).toFixed(1),
  })));
  console.table(report.cpuPhases.map(phase => ({
    phase: phase.phase,
    wallMs: phase.elapsedWallMs?.toFixed(0) ?? '-',
    cpuMs: phase.totalCpuMs.toFixed(1),
    avgCores: phase.averageCpuCores?.toFixed(2) ?? '-',
    cpuMsPerWindow: phase.cpuMsPerNewWindow?.toFixed(3) ?? '-',
    cpuMsPerClick: phase.cpuMsPerClick?.toFixed(3) ?? '-',
  })));
  console.table(report.egressPhases.map(phase => ({
    phase: phase.phase,
    egressMB: (phase.egressBytes / 1024 / 1024).toFixed(2),
    averageMbps: (phase.averageBytesPerSecond * 8 / 1_000_000).toFixed(3),
  })));
  console.log(`Total egress: ${(report.totalEgressBytes / 1024 / 1024).toFixed(2)}MB`);
  console.log(
    `Counter update egress: ${(report.totalCounterUpdateEgressBytes / 1024).toFixed(2)}KB ` +
    `(${report.counterUpdateBytesPerClick?.toFixed(2) || '-'} bytes/click)`
  );
  console.log(`Activity: ${JSON.stringify(
    activity ? { ...activity, clickTimings: undefined } : activity
  )}`);
  console.log(`Report: ${options.output}`);

  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCapacity(parseArguments(process.argv.slice(2)));
}
