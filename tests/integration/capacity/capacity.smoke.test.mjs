import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCapacity } from './run-capacity.mjs';

test('capacity client connects, clicks, reconnects, and releases windows', { timeout: 30000 }, async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'seniman-capacity-'));
  const output = path.join(temporaryDirectory, 'report.json');

  try {
    const report = await runCapacity({
      profile: 'interactive-counters',
      steps: [5],
      counterCount: 50,
      batchSize: 5,
      batchDelayMs: 0,
      settleMs: 200,
      activePercent: 100,
      clicksPerSecond: 5,
      activitySeconds: 1,
      disconnectPercent: 40,
      output,
    });

    assert.equal(report.fixture.counterCount, 50);
    assert.ok(report.activity.latency.count > 0);
    assert.equal(report.activity.errors, 0);
    assert.ok(report.samples.some(sample => sample.label === 'disconnected'));
    assert.ok(report.samples.some(sample => sample.label === 'reconnected'));
    assert.equal(report.samples.at(-1).fixture.activeWindows, 0);
    assert.ok(report.cpuPhases.every(phase => phase.totalCpuMs >= 0));
    assert.ok(report.cpuPhases.some(phase => phase.cpuMsPerClick !== null));
    assert.ok(JSON.parse(await readFile(output, 'utf8')).samples.length >= 5);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
