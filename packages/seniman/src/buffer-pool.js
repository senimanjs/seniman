export const SMALL_PAGE_SIZE = 4096;
export const MEDIUM_PAGE_SIZE = 4096 * 4;

const DEFAULT_MAX_PAGE_SIZE = 4096 * 32;
const configuredMaxPageSize = process.env.SENIMAN_MAX_PAGE_SIZE;

export const MAX_PAGE_SIZE = configuredMaxPageSize
  ? Number(configuredMaxPageSize)
  : DEFAULT_MAX_PAGE_SIZE;

if (!Number.isSafeInteger(MAX_PAGE_SIZE) || MAX_PAGE_SIZE < MEDIUM_PAGE_SIZE) {
  throw new Error(`SENIMAN_MAX_PAGE_SIZE must be an integer of at least ${MEDIUM_PAGE_SIZE} bytes`);
}

if (MAX_PAGE_SIZE != DEFAULT_MAX_PAGE_SIZE) {
  console.log(`Setting maximum page size to ${MAX_PAGE_SIZE} bytes`);
}

const reuseBufferQueues = new Map();

for (let pageSize of [SMALL_PAGE_SIZE, MEDIUM_PAGE_SIZE, MAX_PAGE_SIZE]) {
  reuseBufferQueues.set(pageSize, []);
}

function getPageSize(minimumSize) {
  if (minimumSize <= SMALL_PAGE_SIZE) {
    return SMALL_PAGE_SIZE;
  } else if (minimumSize <= MEDIUM_PAGE_SIZE) {
    return MEDIUM_PAGE_SIZE;
  } else if (minimumSize <= MAX_PAGE_SIZE) {
    return MAX_PAGE_SIZE;
  }

  throw new Error(
    `Seniman command requires ${minimumSize} bytes, exceeding SENIMAN_MAX_PAGE_SIZE=${MAX_PAGE_SIZE}. ` +
    `Set SENIMAN_MAX_PAGE_SIZE=${minimumSize} or higher, or preferably stagger large initial rendering ` +
    `into smaller updates for a faster user-visible response.`
  );
}

export const bufferPool = {
  getPageSize,

  alloc: (minimumSize = SMALL_PAGE_SIZE) => {
    let pageSize = getPageSize(minimumSize);
    let reuseBufferQueue = reuseBufferQueues.get(pageSize);

    return reuseBufferQueue.length > 0
      ? reuseBufferQueue.pop()
      : Buffer.allocUnsafe(pageSize);
  },

  returnBuffer: (buffer) => {
    reuseBufferQueues.get(buffer.length)?.push(buffer);
  }
}
