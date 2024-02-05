const MODIFY_INSERT = 3;
const MODIFY_REMOVE = 4;

export class Sequence {

  constructor(id) {
    this.id = id;
    this.nodes = [];
    this.onChangeFn = null;
    this.incrementingId = 1;
  }

  onChange(fn) {
    this.onChangeFn = fn;
  }

  remove(index, count) {
    this.nodes.splice(index, count);

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
    this.onChangeFn({ type: MODIFY_REMOVE, index: 0, count: this.nodes.length });

    this.nodes = [];
  }
}
