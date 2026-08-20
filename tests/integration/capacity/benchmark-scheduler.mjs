import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  SCHEDULER_INPUT_PAGE_SIZE,
  SCHEDULER_OUTPUT_PAGE_SIZE,
  scheduler_deregisterWindow,
  scheduler_drainWork,
  scheduler_hasWork,
  scheduler_ingest,
  scheduler_registerWindow,
} from '../../../packages/seniman/dist/scheduler.js';

const windowCount = Number(process.argv[2] || 1000);
const observerCount = Number(process.argv[3] || 50);
const waveCount = Number(process.argv[4] || 20);
const outputPath = process.argv[5];
const output = Buffer.allocUnsafe(SCHEDULER_OUTPUT_PAGE_SIZE);

function ingest(handle, commands) {
  const commandLength = commands.reduce(
    (length, command) => length + (command[0] === 6 ? 5 : 9),
    0
  );
  const length = 12 + commandLength;
  if (length > SCHEDULER_INPUT_PAGE_SIZE) {
    throw new Error('Scheduler benchmark input exceeds one page');
  }

  const input = Buffer.allocUnsafe(length);
  input.writeUInt32LE(handle.slot, 0);
  input.writeUInt32LE(handle.generation, 4);
  input.writeUInt32LE(commandLength, 8);
  let offset = 12;

  for (const command of commands) {
    input.writeUInt8(command[0], offset);
    input.writeUInt32LE(command[1], offset + 1);
    offset += 5;
    if (command[0] !== 6) {
      input.writeUInt32LE(command[2], offset);
      offset += 4;
    }
  }
  scheduler_ingest(input, length);
}

function drain() {
  let outputBytes = 0;
  while (scheduler_hasWork()) {
    outputBytes += scheduler_drainWork(output);
  }
  return outputBytes;
}

function measure(operation) {
  const startCpu = process.cpuUsage();
  const start = process.hrtime.bigint();
  const result = operation();
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const cpu = process.cpuUsage(startCpu);
  return {
    result,
    elapsedMs,
    cpuMs: (cpu.user + cpu.system) / 1000,
  };
}

const handles = [];
const registration = measure(() => {
  for (let windowIndex = 0; windowIndex < windowCount; windowIndex++) {
    const handle = scheduler_registerWindow(windowIndex + 1);
    handles.push(handle);
    ingest(handle, [[3, 0, 4]]);
  }
  let outputBytes = drain();

  for (const handle of handles) {
    const commands = [[2, 4, 3]];
    for (let index = 0; index < observerCount; index++) {
      const nodeId = 6 + index * 2;
      commands.push([3, 4, nodeId], [1, nodeId, 3]);
    }
    ingest(handle, commands);
  }
  outputBytes += drain();
  return outputBytes;
});

const waves = measure(() => {
  let outputBytes = 0;
  for (let wave = 0; wave < waveCount; wave++) {
    for (const handle of handles) {
      const commands = [];
      for (let index = 0; index < observerCount; index++) {
        const nodeId = 6 + index * 2;
        commands.push([1, nodeId, 3]);
      }
      commands.push([6, 3]);
      ingest(handle, commands);
    }
    outputBytes += drain();
  }
  return outputBytes;
});

const teardown = measure(() => {
  for (const handle of handles) {
    scheduler_deregisterWindow(handle.slot, handle.generation);
  }
});

const report = {
  scheduler: process.env.SENIMAN_SCHEDULER || 'wasm',
  windowCount,
  observerCount,
  waveCount,
  scheduledNodes: windowCount * observerCount * waveCount,
  registration,
  waves,
  teardown,
};

if (outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2));
}

console.log(JSON.stringify(report, null, 2));
