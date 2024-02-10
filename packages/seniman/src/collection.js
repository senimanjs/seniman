import { createSequence, _createComponent } from "./window.js";
import { onDispose, useState, useCallback } from "./state.js";

export function createCollection(initialItems) {
  return new Collection(initialItems);
}

const MODIFY_INSERT = 1;
const MODIFY_REMOVE = 2;
const MODIFY_SET = 3;

class Collection {

  constructor(items) {
    if (items) {
      this.items = items.slice();
    } else {
      this.items = [];
    }

    this.subscribeFns = [];

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
  let stateSetters = [];
  let { collection, renderFn, resolveState } = props;

  let unsub = collection.subscribe(
    useCallback(change => {
      if (change.type === MODIFY_INSERT) {
        let { startIndex, items } = change;
        let nodes = [];

        for (let i = 0; i < items.length; i++) {
          let item = items[i];

          let stateSetterContainer = {
            setter: null
          };

          let component = _createComponent((props) => {
            let [state, setState] = useState(item);
            stateSetterContainer.setter = setState;

            return () => {
              if (resolveState) {
                return renderFn(state());
              } else {
                return renderFn(state);
              }
            };
          });

          nodes.push(component);
          stateSetters.splice(startIndex + i, 0, stateSetterContainer);
        }

        sequence.insert(startIndex, ...nodes);
      } else if (change.type === MODIFY_REMOVE) {
        let { index, count } = change;

        sequence.remove(index, count);
        stateSetters.splice(index, count);
      } else if (change.type === MODIFY_SET) {
        let { index, item } = change;

        let stateSetter = stateSetters[index].setter;
        stateSetter(item);
      }
    })
  );

  onDispose(() => {
    unsub();
  });

  return sequence;
}
