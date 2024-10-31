const DEFAULT_PAGE_SIZE = 4096 * 4;

const pageSize = parseInt(process.env.SENIMAN_PAGE_SIZE) || DEFAULT_PAGE_SIZE;

if (pageSize != DEFAULT_PAGE_SIZE) {
  console.log(`Setting custom page size to ${pageSize} bytes`);
}

// Seniman page size in bytes
export const PAGE_SIZE = pageSize;

const reuseBufferQueue = [];

export const bufferPool = {

  alloc: () => {

    if (reuseBufferQueue.length > 0) {
      return reuseBufferQueue.shift();
    } else {
      return Buffer.allocUnsafe(PAGE_SIZE);
    }
  },

  returnBuffer: (buffer) => {
    reuseBufferQueue.push(buffer);
  }
}