# Sequence API Reference

A Sequence is a directly mutable list of renderable values. It is useful for append-oriented output and other cases where the application already knows the exact insertion and removal operations.

Sequences are scope-owned. Call `createSequence()` while a Seniman component, effect, or another active scope is executing. Mutation snippets below assume that component-owned Sequence.

```js
import { createSequence, onDispose, useCallback } from 'seniman';
```

For reactive lists of application values, prefer [Collection](/docs/references/collection).

The `Sequence` class is exported for type and identity use, but application code should create instances with `createSequence()`. Its constructor requires a renderer-managed block ID.

## Creation

### `createSequence()`

Creates an empty Sequence in the active Seniman scope.

```js
function Output() {
  let output = createSequence();

  return <pre>{output}</pre>;
}
```

The Sequence is owned by the scope in which it is created and can be rendered directly in JSX.

**Returns:** an empty mutable Sequence. There is currently no public reactive length getter; keep any application-level count separately when the interface needs to display one.

A Sequence may be rendered at one location at a time as a child of an element, block, or another Sequence. It is a rendering primitive, not a general-purpose data store: it keeps renderable nodes and their disposal owners rather than exposing Array-style reads.

## Mutations

### `sequence.push(...items)`

Appends renderable items and returns the first internal item ID assigned to the insertion.

```js
output.push('Connected\n');
output.push(<strong>Ready</strong>, '\n');
```

The return value is an opaque renderer ID, not the item index. Most application code should ignore it. Calling `push()` without items performs an empty insertion and should be avoided.

### `sequence.insert(index, ...items)`

Inserts renderable items before `index` and returns the first internal item ID assigned to the insertion.

```js
output.insert(0, 'Header\n');
```

Use an index from `0` through the current item count. Inserting at the count is equivalent to `push()`.

### `sequence.remove(index, count)`

Removes `count` items beginning at `index`.

```js
output.remove(0, 1);
```

`index` must be non-negative, and `index + count` must not exceed the current sequence length.

Removal is positional. If earlier operations changed the Sequence, adjust stored indexes accordingly. The method returns `undefined`.

### `sequence.reset()`

Removes every item.

```js
output.reset();
```

Equivalent to `sequence.remove(0, currentItemCount)`. The Sequence tracks that count internally even though it does not expose it as public state.

## Item lifecycle

Items may be text, elements, components, or other values accepted by JSX children. Each inserted item receives its own rendering and disposal ownership where needed. Removing an item disposes the server-side scope created for that item.

Unaffected items retain their browser nodes and server scopes when siblings are inserted or removed. This makes a Sequence suitable for streamed text, logs, incremental document construction, and other append/splice workloads.

```js
function LogOutput(props) {
  let lines = createSequence();
  let appendLine = useCallback(line => {
    lines.push(<div>{line}</div>);
  });

  props.stream.on('line', appendLine);

  onDispose(() => props.stream.close());
  return <div>{lines}</div>;
}
```

When an external callback mutates a Sequence after the creating function has returned, bind it to the active Seniman scope with `useCallback()` unless the callback API is already invoked from a Seniman handler.

A Sequence may be inserted as an item inside another Sequence. The child remains independently mutable, and removing it from the parent removes its rendered browser nodes. The same child may be inserted again later while its owning scope remains active.

```js
let child = createSequence();
let parent = createSequence();

parent.push('before', child, 'after');
child.push('nested content');
```
