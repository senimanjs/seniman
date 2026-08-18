# Rendering Changing Lists with Collections

Many interfaces contain a list that changes while the application is running: people join a room, messages arrive, or rows are removed from a table.

For a list like that, Seniman provides a **Collection**. A Collection stores the items in order and gives Seniman precise information when an item is inserted, removed, or updated.

This guide builds up a Collection one feature at a time. We will start by rendering two strings. By the end, the items will be editable records with persistent reactive rendering scopes.

## Start with a list of values

Import `createCollection` and call it inside a component:

```js
import { createCollection } from 'seniman';

function GuestList() {
  let guests = createCollection(['Ada', 'Grace']);

  return <ul>
    {guests.map(name => <li>{name()}</li>)}
  </ul>;
}
```

There are two new pieces here:

- `createCollection([...])` creates an ordered collection with some initial items.
- `guests.map(...)` gives every item a persistent rendering scope.

The function passed to `map()` runs once when an item enters the Collection. Its argument is a reactive getter: call `name()` wherever the current value should appear. If that item is later updated, expressions that read `name()` update while the item's surrounding scope remains intact.

Collections belong to the Seniman scope that creates them. Create them inside a component or another active Seniman scope, not at module scope. The initial Array is shallow-copied when the Collection is created.

## Add an item

A rendered Collection becomes useful when its contents change. Add a button that calls `push()`:

```js
function GuestList() {
  let guests = createCollection(['Ada', 'Grace']);

  return <section>
    <button onClick={() => guests.push('Linus')}>
      Add Linus
    </button>

    <ul>
      {guests.map(name => <li>{name()}</li>)}
    </ul>
  </section>;
}
```

Clicking the button appends `Linus`. Seniman renders the new item and inserts it after the existing items. It does not need to render Ada and Grace again.

This is the central idea behind a Collection: mutate the list through the Collection, and Seniman can update only the affected positions.

## Remove an item

The callback passed to `map()` can include event handlers for that item:

```js
function GuestList() {
  let guests = createCollection(['Ada', 'Grace', 'Linus']);

  let removeGuest = name => {
    let index = guests.indexOf(name);

    if (index !== -1) {
      guests.remove(index, 1);
    }
  };

  return <ul>
    {guests.map(name =>
      <li>
        {name()}
        <button onClick={() => removeGuest(name())}>Remove</button>
      </li>
    )}
  </ul>;
}
```

`remove(index, count)` removes a range. Here it removes one item at the index returned by `indexOf()`.

When an item is removed, Seniman removes its browser output and disposes the server-side scope that rendered it. The other items keep their existing scopes, even though their numeric positions may have changed.

## Display the number of items

A Collection exposes its count in two forms:

```js
return <section>
  <h2>Guests ({guests.size()})</h2>
  <ul>
    {guests.map(name => <li>{name()}</li>)}
  </ul>
</section>;
```

Use `size()` in rendered output. It is reactive, so the heading changes after an item is added or removed.

The `length` property contains the same number, but it is not reactive. Use it in event handlers and other imperative code:

```js
let removeLastGuest = () => {
  if (guests.length > 0) {
    guests.remove(guests.length - 1, 1);
  }
};
```

The distinction is simple:

- Use `size()` when the interface should update.
- Use `length` when code only needs the current number.

## Store richer items

Collection items can be any JavaScript value. Let us replace the names with records so each guest can have a status:

```js
function GuestList() {
  let guests = createCollection([
    { id: 1, name: 'Ada', checkedIn: false },
    { id: 2, name: 'Grace', checkedIn: true }
  ]);

  return <ul>
    {guests.map(guest =>
      <li>
        {guest().name}: {guest().checkedIn ? 'here' : 'not here'}
      </li>
    )}
  </ul>;
}
```

Nothing about `map()` changes. Its callback receives a getter for the current item, whether that item is a string, an object, or something else.

## Update one item

Use `set()` when an item stays in the same position but its value changes:

```js
function GuestList() {
  let guests = createCollection([
    { id: 1, name: 'Ada', checkedIn: false },
    { id: 2, name: 'Grace', checkedIn: true }
  ]);

  let toggleCheckIn = id => {
    let index = guests.findIndex(guest => guest.id === id);
    if (index === -1) return;

    guests.set(index, guest => ({
      ...guest,
      checkedIn: !guest.checkedIn
    }));
  };

  return <ul>
    {guests.map(guest =>
      <li>
        {guest().name}: {guest().checkedIn ? 'here' : 'not here'}
        <button onClick={() => toggleCheckIn(guest().id)}>
          Toggle check-in
        </button>
      </li>
    )}
  </ul>;
}
```

`set(index, updater)` passes the current item to the updater and stores the returned value. For an object, return a new object instead of changing the existing object in place.

Notice that the event handler remembers the guest's stable `id`, not its index. An index describes a current position and may become stale after another item is inserted or removed. Looking up the ID at mutation time finds the guest's current position.

Calling `set()` updates the getter belonging to that item. The expressions that read it react to the new value, while the item's rendering scope and every other guest's scope remain intact.

## Insert, replace, and clear items

Once `push()`, `remove()`, and `set()` make sense, the remaining mutations are variations on the same idea:

```js
guests.push(newGuest);                    // append
guests.unshift(newGuest);                 // prepend
guests.splice(2, 0, newGuest);            // insert at index 2
guests.splice(2, 1, replacementGuest);    // replace at index 2
guests.remove(2, 1);                      // remove one item
guests.reset();                           // remove every item
```

Use `set()` to update an existing logical item in place. Use `splice()` when the membership of the list changes at a particular position.

Mutations update the Collection's server-side `items` and `length` immediately. The corresponding browser rendering is scheduled afterward.

## Collections compared with Arrays

An ordinary Array is a good fit when a list is fixed for the lifetime of its rendered scope:

```js
function Navigation(props) {
  return <nav>
    {props.links.map(link =>
      <a href={link.href}>{link.label}</a>
    )}
  </nav>;
}
```

If a list's membership changes over time, a Collection can express the exact change. A `push()`, for example, means “append these items,” while `remove()` means “dispose this range.” Unaffected items keep their state, cleanup ownership, and browser nodes.

A Collection's `items` property exposes its current backing Array for synchronous reads. Treat that Array as read-only. Mutating `collection.items` directly bypasses Collection notifications and will not update rendered views.

## Render a value as a replaceable snapshot with `view()`

Most code should use `map()` so that each item keeps a persistent rendering scope:

```js
{guests.map(guest =>
  <li>{guest().name}: {guest().checkedIn ? 'here' : 'not here'}</li>
)}
```

Collections also provide `view()`. Its callback receives the current item value directly instead of a getter:

```js
{guests.view(guest =>
  <GuestRow guest={guest} />
)}
```

When `set()` changes that guest, Seniman disposes the previous result of the complete callback and renders it again with the new value. This gives the replacement a fresh descendant scope. Local state and lifecycle resources created beneath that callback are therefore recreated as well.

Use `view()` when that whole-item reconstruction is intentional, or when a component or helper specifically needs an ordinary snapshot value. Do not choose it merely because the item can change shape: reactive expressions inside `map()` can return different elements and branches while preserving the rest of the item scope.

The distinction is about identity and lifecycle, not just performance:

| Use | Callback receives | After `set()` |
| --- | --- | --- |
| `map()` | A reactive item getter | Item scope persists; expressions that read the getter update |
| `view()` | The current item value | Previous result is disposed; complete item callback runs again |

If you are unsure, start with `map()`.

## The model to remember

A Collection is an ordered list in which every item rendered with `map()` owns a persistent independent scope.

- Mutations describe exactly where the list changed.
- Inserted items get new scopes.
- Removed items have their scopes disposed.
- Unaffected items keep their scopes when neighbors change.
- `set()` updates one item's getter without changing its membership or identity.

That is enough for most changing lists. For every method signature, return value, and index rule, see the [Collection API Reference](/docs/references/collection).
