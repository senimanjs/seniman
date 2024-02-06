const MODIFY_INSERT = 3;
const MODIFY_REMOVE = 4;

export class Sequence {

  constructor(id) {
    this.id = id;
    this.nodes = [];
    this.disposeFns = [];
    this.onChangeFn = null;
    this.incrementingId = 1;

    // TODO: add deleteBlockOnRemove option
  }

  onChange(fn) {
    this.onChangeFn = fn;
  }

  registerDisposeFns(index, fns) {
    this.disposeFns.splice(index, 0, ...fns);
  }

  remove(index, count) {

    if (index < 0) {
      throw new Error('index must be >= 0');
    }

    if (index + count > this.nodes.length) {
      throw new Error('index + count must be <= nodes.length');
    }

    this.nodes.splice(index, count);
    this.disposeFns.splice(index, count).forEach(fn => {
      if (fn) { fn() }
    });

    this.onChangeFn({ type: MODIFY_REMOVE, index, count });
  }

  push(...items) {
    this.insert(this.nodes.length, ...items);
  }

  insert(index, ...items) {

    this.nodes.splice(index, 0, ...items);

    let startItemId = this.incrementingId;

    this.onChangeFn({
      type: MODIFY_INSERT,
      startIndex: index,
      startItemId,
      nodes: items
    });

    this.incrementingId += items.length;
  }

  reset() {
    this.remove(0, this.nodes.length);
  }
}
