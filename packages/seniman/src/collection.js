import { Sequence } from "./window.js";
import { getActiveScope, runInScope, onDispose, useDisposableEffect } from "./state.js";

export function createCollection(initialItems) {
  return new Collection(initialItems);
}

class Collection {

  constructor(items) {
    this.items = items;
    this.views = [];

    this.itemIds = [];
    this.disposeFns = [];
    this._lastItemId = 0;
  }

  indexOf(item) {
    return this.items.indexOf(item);
  }

  get length() {
    return this.items.length;
  }

  findIndex(fn) {
    return this.items.findIndex(fn);
  }

  find(fn) {
    return this.items.find(fn);
  }

  remove(index, count) {
    this.items.splice(index, count);

    this.views.forEach(view => {
      this.notifyViewRemoval(view, index, count);
    });
  }

  unshift(...items) {
    this.items.unshift(...items);

    this.views.forEach(view => {
      this.notifyViewInsert(view, 0, items.length);
    });
  }

  push(...items) {
    let index = this.items.length;

    this.items.push(...items);

    this.views.forEach(view => {
      this.notifyViewInsert(view, index, items.length);
    });
  }

  splice(index, count, ...items) {
    this.items.splice(index, count, ...items);

    this.views.forEach(view => {
      this.notifyViewRemoval(view, index, count);
      this.notifyViewInsert(view, index, items.length);
    });
  }

  filter(fn) {
    return this.items.filter(fn);
  }


  reset() {
    let itemLength = this.items.length;

    this.views.forEach(view => {
      this.notifyViewRemoval(view, 0, itemLength);
    });

    this.items = [];
    this.itemIds = [];
    this.disposeFns = [];
    this._lastItemId = 0;
  }

  notifyViewInsert(view, startIndex, count) {

    let assignItemId = (startIndex) => {
      let itemId = ++this._lastItemId;
      this.itemIds.splice(startIndex, 0, itemId);
      return itemId;
    }

    let nodes = [];
    let readyCount = 0;

    let onInitial = (node) => {
      nodes.push(node);

      readyCount++;

      if (readyCount == count) {
        view.sequence.insert(startIndex, nodes);
      }
    }

    let onChange = (index, node) => {
      view.sequence.replace(index, node);
    }

    // attach items initially
    for (let i = 0; i < count; i++) {
      let itemId = assignItemId(startIndex + i);
      let disposeFn = this._initNode(view, itemId, onInitial, onChange);

      // insert the dispose function at the correct index
      this.disposeFns.splice(startIndex + i, 0, disposeFn);
    }
  }

  notifyViewRemoval(view, index, count) {
    // run the dispose functions
    for (let i = 0; i < count; i++) {
      this.disposeFns[index + i]();
    }

    // remove the dispose functions
    this.disposeFns.splice(index, count);

    // remove from the sequence
    view.sequence.remove(index, count);
  }

  _getIndexForItemId(itemId) {
    // use better data structure for this
    return this.itemIds.indexOf(itemId);
  }

  _initNode(view, itemId, onInitial, onChange) {
    let isInitial = true;
    let disposeFn = null;

    runInScope(view.scope, () => {
      disposeFn = useDisposableEffect(() => {
        let currentIndexForItemId = this._getIndexForItemId(itemId);
        let nodeResult = view.renderFn(this.items[currentIndexForItemId]);

        if (isInitial) {
          isInitial = false;
          onInitial(nodeResult);
        } else {
          onChange(currentIndexForItemId, nodeResult);
        }
      });
    });

    return disposeFn;
  }

  view(fn) {
    return this.map(fn);
  }

  map(fn) {

    let view = {
      renderFn: fn,
      scope: getActiveScope(),
      sequence: new Sequence()
    };

    this.views.push(view);

    // handle the case where the collection already has items
    if (this.items.length > 0) {
      this.notifyViewInsert(view, 0, this.items.length);
    }

    onDispose(() => {
      let index = this.views.indexOf(view);
      this.views.splice(index, 1);
    });

    return view.sequence;
  }
};