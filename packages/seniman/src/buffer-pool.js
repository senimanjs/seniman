const DEFAULT_PAGE_SIZE = 4096 * 4;

const pageSize = parseInt(process.env.SENIMAN_PAGE_SIZE) || DEFAULT_PAGE_SIZE;

if (pageSize != DEFAULT_PAGE_SIZE) {
  console.log(`Setting custom page size to ${pageSize} bytes`);
}

// Seniman page size in bytes
export const PAGE_SIZE = pageSize;

const reuseBufferQueue = [];

export const bufferPool = {

  alloc: (minimumSize = PAGE_SIZE) => {

    if (minimumSize > PAGE_SIZE) {
      return Buffer.allocUnsafe(minimumSize);
    } else if (reuseBufferQueue.length > 0) {
      return reuseBufferQueue.pop();
    } else {
      return Buffer.allocUnsafe(PAGE_SIZE);
    }
  },

  returnBuffer: (buffer) => {
    if (buffer.length == PAGE_SIZE) {
      reuseBufferQueue.push(buffer);
    }
  }
}
