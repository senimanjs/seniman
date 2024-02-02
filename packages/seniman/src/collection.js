import { Sequence } from "./window.js";
import { getActiveScope, runInScope, onDispose, useDisposableEffect, useState, useMemo, useEffect } from "./state.js";

export function createCollection(initialItems) {
  return new Collection(initialItems);
}

class Collection {

  constructor(items) {

    if (items) {
      this.items = items.slice();
    } else {
      this.items = [];
    }

    this.rootScope = getActiveScope();
    this.isTracked = false;
    this.trackedStates = [];
    this.views = [];
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

    if (this.isTracked) {
      // remove the item states
      this.trackedStates.splice(index, count);
    }

    this.views.forEach(view => {
      this.notifyViewRemoval(view, index, count);
    });
  }

  unshift(...items) {
    this.splice(0, 0, ...items);
  }

  push(...items) {
    let index = this.items.length;
    this.splice(index, 0, ...items);
  }

  splice(index, deletionCount, ...items) {
    this.items.splice(index, deletionCount, ...items);

    if (this.isTracked) {

      if (deletionCount > 0) {
        // remove the item states
        this.trackedStates.splice(index, deletionCount);
      }

      runInScope(this.rootScope, () => {
        // add the new item states
        for (let i = 0; i < items.length; i++) {
          let item = items[i];
          let [getter, setter] = useState(item);
          this.trackedStates.splice(index + i, 0, { getter, setter });
        }
      });
    }

    this.views.forEach(view => {
      if (deletionCount > 0) {
        this.notifyViewRemoval(view, index, deletionCount);
      }

      this.notifyViewInsert(view, index, items);
    });
  }

  /*
  swap(index1, index2) {

    let item1 = this.items[index1];
    let item2 = this.items[index2];
    this.items[index1] = item2;
    this.items[index2] = item1;

    let itemId1 = this.itemIds[index1];
    let itemId2 = this.itemIds[index2];

    this.itemIds[index1] = itemId2;
    this.itemIds[index2] = itemId1;

    this.views.forEach(view => {

      // swap the disposeFns of the views
      let disposeFn1 = view.disposeFns[index1];
      let disposeFn2 = view.disposeFns[index2];

      view.disposeFns[index1] = disposeFn2;
      view.disposeFns[index2] = disposeFn1;

      view.sequence.swap(index1, index2);
    });
  }
  */

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
  }

  notifyViewInsert(view, startIndex, items) {

    let nodes = [];
    let count = items.length;

    runInScope(view.scope, () => {

      // attach items initially
      for (let i = 0; i < count; i++) {
        let [nodeRoot, nodeRootSetter] = useState(null);
        let node = view.containerFn(nodeRoot);
        let item;

        if (view.tracked) {
          let { getter } = this.trackedStates[startIndex + i];
          item = getter;
        } else {
          item = items[i];
        }

        let disposeFn = useDisposableEffect(() => {
          let nodeResult = view.renderFn(item, startIndex + i);
          nodeRootSetter(nodeResult);
        });

        nodes.push(node);

        // insert the dispose function at the correct index
        view.disposeFns.splice(startIndex + i, 0, disposeFn);
      }

      view.sequence.insert(startIndex, nodes);
    });
  }

  notifyViewRemoval(view, index, count) {
    // run the dispose functions
    for (let i = 0; i < count; i++) {
      view.disposeFns[index + i]();
    }

    // remove the dispose functions
    view.disposeFns.splice(index, count);
    // remove from the sequence
    view.sequence.remove(index, count);
  }

  set(index, fn) {
    let item = this.items[index];
    let newItem = fn(item);

    this.items[index] = newItem;

    if (this.isTracked) {
      let trackedState = this.trackedStates[index];
      let { setter } = trackedState;
      setter(newItem);
    }
  }

  view(fn) {
    return this._map(fn, { isTracked: false });
  }

  map(fn) {
    return this._map(fn, { isTracked: true });
  }

  _map(fn, { isTracked }) {

    // TODO: allow containerFn to be overridden
    let containerFn = (node) => {
      return <span>{node()}</span>;
    }

    let view = {
      renderFn: fn,
      scope: getActiveScope(),
      sequence: new Sequence(),
      disposeFns: [],
      containerFn,
      tracked: isTracked
    };

    if (view.tracked) {
      // if the collection itself hasn't been tracked yet
      // then run the tracking initialization
      if (!this.isTracked) {
        this.isTracked = true;

        runInScope(this.rootScope, () => {
          this.trackedStates = this.items.map(item => {
            let [getter, setter] = useState(item);
            return { getter, setter };
          });
        });
      }
    }

    this.views.push(view);

    // handle the case where the collection already has items
    if (this.items.length > 0) {
      this.notifyViewInsert(view, 0, this.items);
    }

    onDispose(() => {
      let index = this.views.indexOf(view);
      this.views.splice(index, 1);
    });

    return view.sequence;
  }
};