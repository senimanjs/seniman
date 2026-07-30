import { createSequence, _resolveNodeResult } from "./window.js";
import {
  getActiveWindow,
  onDispose,
  useDisposableEffect,
  useEffect,
  useState,
  useCallback
} from "./state.js";

export function createCollection(initialItems) {
  return new Collection(initialItems);
}

const MODIFY_INSERT = 1;
const MODIFY_REMOVE = 2;
const MODIFY_SET = 3;
const MODIFY_SPLICE = 4;

class Collection {

  constructor(items) {
    if (items) {
      this.items = items.slice();
    } else {
      this.items = [];
    }

    this.subscribeFns = [];
    this.spliceSubscribeFns = [];

    let [lengthState, setLengthState] = useState(this.items.length);

    this.lengthState = lengthState;
    this.setLengthState = setLengthState;
  }

  subscribe(fn) {
    this.subscribeFns.push(fn);

    if (this.items.length > 0) {
      fn({ type: MODIFY_INSERT, startIndex: 0, items: this.items });
    }

    return () => {
      // TODO: optimize this
      let index = this.subscribeFns.indexOf(fn);
      this.subscribeFns.splice(index, 1);
    };
  }

  subscribeSplices(fn) {
    this.spliceSubscribeFns.push(fn);

    if (this.items.length > 0) {
      fn({
        type: MODIFY_SPLICE,
        index: 0,
        deletionCount: 0,
        items: this.items
      });
    }

    return () => {
      let index = this.spliceSubscribeFns.indexOf(fn);
      this.spliceSubscribeFns.splice(index, 1);
    };
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

    this.setLengthState(this.items.length);

    this.spliceSubscribeFns.forEach(fn => {
      fn({
        type: MODIFY_SPLICE,
        index,
        deletionCount,
        items
      });
    });

    if (deletionCount > 0) {
      this.subscribeFns.forEach(fn => {
        fn({ type: MODIFY_REMOVE, index, count: deletionCount });
      });
    }

    if (items.length > 0) {
      this.subscribeFns.forEach(fn => {
        fn({ type: MODIFY_INSERT, startIndex: index, items });
      });
    }
  }

  filter(fn) {
    return this.items.filter(fn);
  }

  reset() {
    this.splice(0, this.items.length);
  }

  set(index, value) {
    let item = this.items[index];
    let newItem;

    if (typeof value === 'function') {
      newItem = value(item);
    } else {
      newItem = value;
    }

    this.items[index] = newItem;

    this.spliceSubscribeFns.forEach(fn => {
      fn({ type: MODIFY_SET, index, item: newItem });
    });

    this.subscribeFns.forEach(fn => {
      fn({ type: MODIFY_SET, index, item: newItem });
    });
  }

  size() {
    return this.lengthState();
  }

  view(fn) {
    let _this = this;
    return <_CollectionMap collection={_this} renderFn={fn} resolveState={true} />;
  }

  map(fn) {
    let _this = this;
    return <_CollectionMap collection={_this} renderFn={fn} resolveState={false} />;
  }

  get Loop() {
    return (props) => {
      return this.map(props.fn);
    }
  }
};

/*
<collection.Loop fn={item => {
  return <div>{item()}</div>;
}} />
*/

function _CollectionMap(props) {
  let sequence = createSequence();
  let itemRecords = [];
  let pendingChanges = [];
  let processingChange = false;
  let { collection, renderFn, resolveState } = props;
  let window = getActiveWindow();
  let processNextChangeInScope;

  function finishChange() {
    processingChange = false;
    processNextChangeInScope();
  }

  function createItemRecord(item, onInitialValue) {
    let record = {
      dispose: null,
      itemId: null,
      published: false,
      ready: false,
      setter: null,
      value: null
    };

    let publish = value => {
      if (record.published) {
        window._attach(sequence.id, record.itemId, value);
        return;
      }

      record.value = value;
      if (!record.ready) {
        record.ready = true;
        onInitialValue();
      }
    };

    record.dispose = useDisposableEffect(() => {
      let [state, setState] = useState(item);
      record.setter = setState;

      useEffect(() => {
        let nodeResult = resolveState
          ? renderFn(state())
          : renderFn(state);

        _resolveNodeResult(nodeResult, publish);
      });
    });

    return record;
  }

  function applySplice(change) {
    let { index, deletionCount, items } = change;
    let removedRecords = itemRecords.slice(
      index,
      index + deletionCount
    );

    // Dispose the old server-side component owners first. Their browser
    // blocks remain in the visible sequence until the replacement values
    // below have completed their first render.
    removedRecords.forEach(record => record.dispose());

    if (items.length === 0) {
      if (deletionCount > 0) {
        sequence.remove(index, deletionCount);
      }
      itemRecords.splice(index, deletionCount);
      finishChange();
      return;
    }

    let readyCount = 0;
    let insertedRecords = [];
    let commit = () => {
      if (deletionCount > 0) {
        sequence.remove(index, deletionCount);
      }

      let startItemId = sequence.insert(
        index,
        ...insertedRecords.map(record => record.value)
      );

      for (let offset = 0; offset < insertedRecords.length; offset++) {
        let record = insertedRecords[offset];
        record.itemId = startItemId + offset;
        record.published = true;
      }

      itemRecords.splice(
        index,
        deletionCount,
        ...insertedRecords
      );
      finishChange();
    };

    let markReady = () => {
      readyCount++;
      if (readyCount === insertedRecords.length) {
        commit();
      }
    };

    insertedRecords = items.map(item =>
      createItemRecord(item, markReady)
    );
  }

  function processNextChange() {
    if (processingChange || pendingChanges.length === 0) {
      return;
    }

    processingChange = true;
    let change = pendingChanges.shift();

    if (change.type === MODIFY_SPLICE) {
      applySplice(change);
      return;
    }

    if (change.type === MODIFY_SET) {
      let record = itemRecords[change.index];
      if (!record) {
        throw new Error(
          `Cannot set missing Collection item ${change.index}`
        );
      }
      record.setter(change.item);
      finishChange();
    }
  }

  processNextChangeInScope = useCallback(processNextChange);

  let unsub = collection.subscribeSplices(
    useCallback(change => {
      pendingChanges.push(change);
      processNextChangeInScope();
    })
  );

  onDispose(() => {
    unsub();
  });

  return sequence;
}
