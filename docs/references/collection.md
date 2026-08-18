# Collection API Reference

Collection is Seniman's reactive ordered-list abstraction. The `Collection` class is not exported directly; create an instance with `createCollection()`.

Collections are scope-owned. Call `createCollection()` inside a Seniman component, effect, or another active scope—not at module scope. Short mutation examples below assume the named Collection was created by such an owner.

```js
import { createCollection } from 'seniman';
```

## Creation

### `createCollection(initialItems?)`

Creates a Collection within the active Seniman scope.

```js
function MessageList(props) {
  let messages = createCollection(props.initialMessages);

  return <div>
    {messages.map(message => <p>{message().text}</p>)}
  </div>;
}
```

`initialItems` is an optional Array. The Array is shallow-copied, so later changes to the original Array do not change the Collection. Item values themselves are not cloned.

**Returns:** a Collection owned by the active Seniman scope. Create it inside a component, effect, or another active scope. Disposing that owner disposes any rendered Collection views created beneath it.

The Collection stores ordinary JavaScript values. Items do not need IDs, but stable IDs are useful when application code must find an item after other insertions or removals have changed its index.

## Rendering

### `collection.map(renderFn)`

Renders the Collection as a Seniman sequence. `renderFn` receives an item state accessor.

```js
collection.map(item => <div>{item().name}</div>)
```

The callback establishes a persistent rendering scope for the item. Calls to the accessor establish reactive dependencies where they occur, and the outer callback remains stable after `collection.set()`.

`renderFn` receives one argument—a zero-argument item getter. Read that getter in the smallest JSX expression or memo that should respond to `set()`.

This is the default rendering method for Collections because an item's identity, local state, and lifecycle resources survive value updates.

### `collection.view(renderFn)`

Renders the Collection as a Seniman sequence. `renderFn` receives the current item value directly.

```js
collection.view(item => <Row item={item} />)
```

When `collection.set()` changes the item, Seniman disposes the previous callback result and runs the complete `renderFn` again with the new value. Descendant state and lifecycle resources are recreated.

Use `view()` when replacing an item should intentionally reconstruct its complete rendering, or when the rendering code specifically needs an ordinary snapshot instead of an accessor.

`renderFn` receives one argument—the item value. It does not receive an index. This is deliberate: indexes are positional and may change without the item being rerendered.

Both rendering methods return a renderable Seniman sequence. Each Collection position has independent rendering and disposal ownership.

| Use | `map()` | `view()` |
| --- | --- | --- |
| Callback argument | Reactive item getter | Current item value |
| `set()` behavior | Preserves item scope and updates accessor readers | Disposes the previous result and reruns the complete renderer |
| Best fit | Normal retained item rendering | Intentional whole-item reconstruction or snapshot-oriented code |

Calling `view()` or `map()` creates a separate rendered view. Multiple views of the same Collection are allowed; each has its own item scopes and receives the same mutations.

## Mutations

Mutation methods update the Collection in place and return `undefined`.

### `collection.push(...items)`

Appends one or more items.

```js
collection.push(item);
collection.push(itemA, itemB);
```

With no arguments, this is a no-op. The method returns `undefined`.

### `collection.unshift(...items)`

Prepends one or more items.

```js
collection.unshift(item);
```

Existing items keep their rendering scopes and move to later positions.

### `collection.splice(index, deletionCount, ...items)`

Removes `deletionCount` items at `index`, then inserts the supplied items at the same position.

```js
collection.splice(2, 0, insertedItem);
collection.splice(2, 1);
collection.splice(2, 1, replacementItem);
```

Unlike `Array.prototype.splice()`, this method does not return the removed items.

For rendered Collections, use a normalized non-negative `index` between `0` and `collection.length`. `deletionCount` should be non-negative and should not extend past the end. These constraints keep the backing values and rendered item records aligned.

A combined removal and insertion is treated as one replacement operation. Seniman prepares the inserted items before publishing the browser sequence change, avoiding a visible empty placeholder between the old and new content.

### `collection.remove(index, count)`

Removes `count` items beginning at `index`. It is equivalent to `collection.splice(index, count)`.

```js
collection.remove(2, 1);
```

### `collection.set(index, valueOrUpdater)`

Updates one existing item without changing its position. The second argument can be a replacement value or an updater function.

```js
collection.set(2, replacement);

collection.set(2, current => ({
  ...current,
  selected: true
}));
```

The updater receives the current item and must return its new value.

`set()` always publishes an item update to Collection subscribers. Rendered views then apply the item state's strict-equality check: if the replacement is the same value, neither `view()` nor `map()` rerenders it. For a changed value, `view()` reruns the item renderer while `map()` updates the scopes that read its item getter.

Changing an object in place is discouraged because field readers cannot observe what changed. Return a replacement object instead.

### `collection.reset()`

Removes every item.

```js
collection.reset();
```

This is equivalent to removing the full current range. Calling it on an empty Collection is safe.

## Reading

### `collection.length`

The current item count as a synchronous number. Reading `length` does not establish a reactive dependency.

Use it in imperative code, index calculations, and mutation handlers.

### `collection.size()`

Returns the current item count and establishes a reactive dependency. Use it when rendered output should update as the Collection grows or shrinks.

```js
<div>{collection.size()} items</div>
```

The returned number is identical to `collection.length`; only its dependency-tracking behavior differs.

### `collection.items`

The current backing Array. Treat it as read-only. Mutating it directly bypasses Collection notifications and does not update rendered views.

### `collection.indexOf(item)`

Returns the first index whose value is strictly equal to `item`, or `-1` when there is no match.

### `collection.findIndex(predicate)`

Returns the index of the first item accepted by `predicate`, or `-1` when there is no match.

The predicate receives the same arguments as `Array.prototype.findIndex()`: item value, index, and the backing Array.

### `collection.find(predicate)`

Returns the first item accepted by `predicate`, or `undefined` when there is no match.

The predicate receives item value, index, and the backing Array.

### `collection.filter(predicate)`

Returns a regular Array containing the accepted items. It does not return another Collection.

The returned Array is a snapshot of the matching item references. Later Collection mutations do not update it.

The read methods above inspect the current values synchronously and do not establish reactive dependencies.

## Index rules

Indexes passed to `set()`, `remove()`, and `splice()` should be non-negative integers within the Collection's current bounds. For insertion with `splice()`, `collection.length` is also valid.

`set()` must target an existing item. Use `push()`, `unshift()`, or `splice()` to add an item.

## Rendering lifecycle

Inserting or removing an item leaves the rendering scopes of unaffected items intact. Removing an item disposes the server-side scope that owns its rendered output.

For a splice that removes and inserts items together, Seniman disposes the removed server-side owners and prepares the inserted items' initial renderings before changing the visible browser sequence. The old browser nodes remain present until the replacement sequence is ready.

Changes are processed in mutation order. A later Collection change waits while an earlier inserted item completes its initial rendering.

Collection mutations change the server-side values synchronously. Rendering work is scheduled and may complete afterward. Code immediately following `push()` or `splice()` can read the updated `items` and `length`, but should not assume the corresponding browser DOM has already changed.

For task-oriented examples and guidance on choosing `view()` or `map()`, see [Rendering Changing Lists with Collections](/docs/collection).
