
export const PAGE_SIZE = 4096 * 3;//8192 * 2;

const returnBufferQueue = [];

export const bufferPool = {

  alloc: () => {

    if (returnBufferQueue.length > 0) {
      return returnBufferQueue.shift();
    } else {
      return new ArrayBuffer(PAGE_SIZE);
    }
  },

  returnBuffer: (buffer) => {
    returnBufferQueue.push(buffer);
  }
}