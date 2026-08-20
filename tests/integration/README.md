# Seniman integration tests

The capacity harness runs the measured Seniman server in a separate process from
the load-generating WebSocket clients. This keeps client allocations out of the
server memory figures.

Prerequisite:

```sh
cd packages/seniman
npm install
npm run build
```

Run the small integration smoke test:

```sh
cd tests/integration
npm test
```

Run capacity experiments:

```sh
npm run capacity:1k
npm run capacity:10k

# Custom workload
npm run capacity -- \
  --steps 1000,10000 \
  --active-percent 10 \
  --clicks-per-second 0.5 \
  --activity-seconds 15 \
  --disconnect-percent 20
```

The `interactive-counters` fixture creates 50 counters per window. Lightweight
clients receive the real server handler IDs through a fixture-only Seniman
Channel, randomly invoke those handlers, acknowledge command buffers, disconnect,
and reconnect to their retained windows.

The fixture disables Seniman's window/input rate limiter because every simulated
user originates from the same load-generator IP. Production applications should
keep rate limiting enabled or provide it at their trusted edge.

Reports are written to `capacity/results/` and include natural and post-GC
server memory. Capacity runs are measurements rather than pass/fail tests because
absolute RSS varies by OS, Node version, allocator, and machine.

For 10,000 clients, ensure the process file-descriptor limit is high enough, for
example by checking `ulimit -n` before starting the run.

This harness measures the Seniman server process. It does not construct a DOM,
measure browser painting, or include kernel socket-buffer memory in RSS.
