import assert from 'node:assert/strict';
import test from 'node:test';
import { ProtocolClient } from './protocol-client.mjs';
import { runBatched, startMeasuredServer, wait } from './run-capacity.mjs';

test('output pressure culls stalled clients and preserves healthy clients', {
  timeout: 120000,
}, async () => {
  const clientCount = Number(process.env.SENIMAN_STORM_CLIENTS || 100);
  const stalledCount = Math.floor(clientCount * 0.3);
  const globalLimit = Math.ceil(stalledCount * 1024 * 1.1);
  const server = await startMeasuredServer({
    profile: 'interactive-counters',
    counterCount: 5,
    outputBytes: 1024,
  });
  const clients = Array.from({ length: clientCount }, (_, index) =>
    new ProtocolClient({
      id: index + 1,
      port: server.ready.port,
      expectedHandlerCount: 5,
    })
  );

  try {
    await runBatched(clients, 50, client => client.connect(), 10);

    for (const client of clients) {
      client.sendPong(client.readOffset);
    }

    // Wait for the scheduled network-status UI, then explicitly acknowledge
    // all bootstrap output before lowering the global retention ceiling.
    await wait(2700);
    for (const client of clients) {
      client.sendPong(client.readOffset);
    }

    let initialSample;
    for (let attempt = 0; attempt < 20; attempt++) {
      await wait(50);
      initialSample = await server.sample();
      if (initialSample.fixture.retainedOutputBytes === 0) {
        break;
      }
    }
    assert.equal(initialSample.fixture.retainedOutputBytes, 0);

    await server.configure({
      SENIMAN_MAX_UNACKNOWLEDGED_OUTPUT_BYTES: String(64 * 1024),
      SENIMAN_MAX_UNACKNOWLEDGED_PUBLICATIONS: '256',
      SENIMAN_MAX_RETAINED_OUTPUT_BYTES: String(globalLimit),
    });

    const stalled = clients.slice(0, stalledCount);
    const healthy = clients.slice(stalledCount);

    for (const client of stalled) {
      client.setAcknowledgementsEnabled(false);
    }

    // Let the next ping establish that the stalled clients are the oldest windows
    // without read progress. Healthy clients acknowledge and leave the list.
    await wait(2700);

    for (let round = 0; round < 5; round++) {
      await Promise.allSettled(stalled.map(client =>
        client.click(client.randomHandlerId(), 1500)
      ));
    }

    await wait(100);
    let pressureSample = await server.sample();
    let evicted = stalled.filter(client => client.closeCode === 3002);
    let evictedHealthy = healthy.filter(client => client.closeCode != null);

    assert.ok(evicted.length > 0);
    assert.equal(
      evictedHealthy.length,
      0,
      `pressure evicted healthy clients: ${evictedHealthy.map(client => client.id)}`
    );
    assert.ok(pressureSample.fixture.windowsDestroyed >= evicted.length);
    assert.ok(pressureSample.fixture.retainedOutputBytes <= globalLimit);

    // Healthy clients remain interactive. Acknowledge each response promptly
    // so this phase continues to pressure the old stalled-window head only.
    await runBatched(healthy, 10, async client => {
      await client.click(client.randomHandlerId());
      client.sendPong(client.readOffset);
    }, 10);

    await wait(100);
    let healthySample = await server.sample();

    assert.equal(healthy.filter(client => client.closeCode != null).length, 0);
    assert.ok(healthySample.fixture.retainedOutputBytes <= globalLimit);
    assert.ok(healthySample.fixture.clicksHandled >= healthy.length);
  } finally {
    await Promise.allSettled(clients.map(client => client.destroy()));
    await server.stop();
  }
});
