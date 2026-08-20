const implementation = process.env.SENIMAN_SCHEDULER || 'wasm';

if (implementation !== 'js' && implementation !== 'wasm') {
  throw new Error(
    `SENIMAN_SCHEDULER must be either "js" or "wasm", received "${implementation}"`
  );
}

const scheduler = implementation === 'js'
  ? await import('./scheduler-js.js')
  : await import('./scheduler-wasm.js');

export const SCHEDULER_PACKET_START = scheduler.SCHEDULER_PACKET_START;
export const SCHEDULER_PACKET_END = scheduler.SCHEDULER_PACKET_END;
export const SCHEDULER_WINDOW_WORK_QUANTUM = scheduler.SCHEDULER_WINDOW_WORK_QUANTUM;
export const SCHEDULER_INPUT_PAGE_SIZE = scheduler.SCHEDULER_INPUT_PAGE_SIZE;
export const SCHEDULER_OUTPUT_PAGE_SIZE = scheduler.SCHEDULER_OUTPUT_PAGE_SIZE;

export const scheduler_getInputBuffer = scheduler.scheduler_getInputBuffer;
export const scheduler_getMemorySize = scheduler.scheduler_getMemorySize;
export const scheduler_getMemoryGrowthCount = scheduler.scheduler_getMemoryGrowthCount;
export const scheduler_registerWindow = scheduler.scheduler_registerWindow;
export const scheduler_deregisterWindow = scheduler.scheduler_deregisterWindow;
export const scheduler_ingest = scheduler.scheduler_ingest;
export const scheduler_drainWork = scheduler.scheduler_drainWork;
export const scheduler_hasWork = scheduler.scheduler_hasWork;
