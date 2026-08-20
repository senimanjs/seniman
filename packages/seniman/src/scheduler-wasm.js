import schedulerCore from "#seniman-scheduler-core";

const OUTPUT_PACKET_HEADER_SIZE = 28;
const MAX_U32 = 0xffffffff;

export const SCHEDULER_PACKET_START = 1;
export const SCHEDULER_PACKET_END = 2;
export const SCHEDULER_WINDOW_WORK_QUANTUM = 256;
export const SCHEDULER_INPUT_PAGE_SIZE = 64 * 1024;
export const SCHEDULER_OUTPUT_PAGE_SIZE = 64 * 1024;

let memoryBuffer = null;
let inputBuffer = null;
let outputBuffer = null;
let memoryGrowthCount = 0;

function refreshMemoryViews() {
  let inputPointer = schedulerCore.scheduler_input_ptr();
  let outputPointer = schedulerCore.scheduler_output_ptr();
  let nextMemoryBuffer = schedulerCore.memory.buffer;

  if (memoryBuffer === nextMemoryBuffer) {
    return;
  }

  if (memoryBuffer !== null) {
    memoryGrowthCount++;
  }

  memoryBuffer = nextMemoryBuffer;
  inputBuffer = Buffer.from(
    memoryBuffer,
    inputPointer,
    SCHEDULER_INPUT_PAGE_SIZE
  );
  outputBuffer = Buffer.from(
    memoryBuffer,
    outputPointer,
    SCHEDULER_OUTPUT_PAGE_SIZE
  );
}

export function scheduler_getInputBuffer() {
  refreshMemoryViews();
  return inputBuffer;
}

export function scheduler_getOutputBuffer() {
  refreshMemoryViews();
  return outputBuffer;
}

export function scheduler_getMemorySize() {
  return schedulerCore.memory.buffer.byteLength;
}

export function scheduler_getMemoryGrowthCount() {
  return memoryGrowthCount;
}

export function scheduler_registerWindow(windowId) {
  let slot = schedulerCore.scheduler_register_window(windowId);
  let generation = schedulerCore.scheduler_window_generation(slot);

  refreshMemoryViews();
  return { slot, generation };
}

export function scheduler_deregisterWindow(slot, generation) {
  schedulerCore.scheduler_deregister_window(slot, generation);
  refreshMemoryViews();
}

export function scheduler_ingest(buffer, length) {
  if (length > buffer.length || length > SCHEDULER_INPUT_PAGE_SIZE) {
    throw new Error('Scheduler input length exceeds its buffer');
  }

  refreshMemoryViews();

  if (buffer !== inputBuffer) {
    inputBuffer.set(buffer.subarray(0, length), 0);
  }

  let status = schedulerCore.scheduler_ingest(length);
  refreshMemoryViews();

  if (status !== 0) {
    throw new Error('Invalid scheduler input');
  }
}

export function scheduler_drainWork(buffer, workBudget = Infinity) {
  if (buffer.length < OUTPUT_PACKET_HEADER_SIZE + 4) {
    throw new Error('Scheduler output buffer is too small');
  }

  refreshMemoryViews();

  let normalizedBudget = Number.isFinite(workBudget)
    ? Math.max(0, Math.min(MAX_U32, Math.floor(workBudget)))
    : MAX_U32;
  let capacity = Math.min(buffer.length, SCHEDULER_OUTPUT_PAGE_SIZE);
  let length = schedulerCore.scheduler_drain_work(
    capacity,
    normalizedBudget
  );

  refreshMemoryViews();

  if (buffer !== outputBuffer && length > 0) {
    outputBuffer.copy(buffer, 0, 0, length);
  }

  return length;
}

export function scheduler_hasWork() {
  return schedulerCore.scheduler_has_work() !== 0;
}

refreshMemoryViews();
