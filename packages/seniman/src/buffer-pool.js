export const STANDARD_PAGE_SIZE = 4096 * 2;

const DEFAULT_MAX_PAGE_SIZE = 4096 * 32;
const configuredMaxPageSize = process.env.SENIMAN_MAX_PAGE_SIZE;

export const MAX_PAGE_SIZE = configuredMaxPageSize
  ? Number(configuredMaxPageSize)
  : DEFAULT_MAX_PAGE_SIZE;

if (!Number.isSafeInteger(MAX_PAGE_SIZE) || MAX_PAGE_SIZE < STANDARD_PAGE_SIZE) {
  throw new Error(`SENIMAN_MAX_PAGE_SIZE must be an integer of at least ${STANDARD_PAGE_SIZE} bytes`);
}

if (MAX_PAGE_SIZE != DEFAULT_MAX_PAGE_SIZE) {
  console.log(`Setting maximum page size to ${MAX_PAGE_SIZE} bytes`);
}

const reuseBufferQueue = [];

function getPageSize(commandSize) {
  if (commandSize <= STANDARD_PAGE_SIZE) {
    return STANDARD_PAGE_SIZE;
  } else if (commandSize <= MAX_PAGE_SIZE) {
    return commandSize;
  }

  throw new Error(
    `Seniman command requires ${commandSize} bytes, exceeding SENIMAN_MAX_PAGE_SIZE=${MAX_PAGE_SIZE}. ` +
    `Set SENIMAN_MAX_PAGE_SIZE=${commandSize} or higher, or preferably stagger large initial rendering ` +
    `into smaller updates for a faster user-visible response.`
  );
}

export const bufferPool = {
  getPageSize,

  alloc: (minimumSize = STANDARD_PAGE_SIZE) => {
    let pageSize = getPageSize(minimumSize);

    return pageSize == STANDARD_PAGE_SIZE && reuseBufferQueue.length > 0
      ? reuseBufferQueue.pop()
      : Buffer.allocUnsafe(pageSize);
  },

  returnBuffer: (buffer) => {
    if (buffer.length == STANDARD_PAGE_SIZE) {
      reuseBufferQueue.push(buffer);
    }
  }
}
