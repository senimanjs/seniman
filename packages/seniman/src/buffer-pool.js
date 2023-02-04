
export const PAGE_SIZE = 4096 * 3;//8192 * 2;

Buffer.poolSize = PAGE_SIZE * 2;

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