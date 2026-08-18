# Building with Components

Components divide a Seniman interface into server-owned pieces with clear inputs and lifetimes. A component is a function that runs in a Seniman scope and returns renderable output.

```js
function Greeting() {
  return <p>Hello from Seniman.</p>;
}

function App() {
  return <main>
    <h1>Welcome</h1>
    <Greeting />
  </main>;
}
```

Unlike a browser-only component framework, the component function runs on the server. Its JSX describes browser output, while its state, effects, handlers, and cleanup remain owned by the server-side scope.

## Compose components around responsibilities

A useful component owns one coherent part of the interface: a toolbar, message row, editor, account menu, or page section. Parents arrange those pieces and pass the values they need.

```js
function UserCard(props) {
  return <article>
    <h2>{props.user.name}</h2>
    <p>{props.user.role}</p>
  </article>;
}

function TeamPage(props) {
  return <main>
    <h1>{props.team.name}</h1>
    <UserCard user={props.team.owner} />
  </main>;
}
```

Props are read-only inputs. When a child needs to change parent-owned state, pass a server function describing the allowed action:

```js
import { useState } from 'seniman';

function CounterButton(props) {
  return <button onClick={props.increment}>
    Count: {props.count}
  </button>;
}

function Counter() {
  let [count, setCount] = useState(0);

  return <CounterButton
    count={count()}
    increment={() => setCount(value => value + 1)}
  />;
}
```

The action remains a server handler owned by `Counter`. The child does not need direct access to the setter or knowledge of where the state lives.

## Props preserve reactive expressions

Seniman does not eagerly reduce every prop expression to a static value. The compiler preserves expressions such as `count()` so the child subscribes where it actually reads `props.count`.

```js
function CountLabel(props) {
  return <span>{props.count}</span>;
}

function Counter() {
  let [count, setCount] = useState(0);

  return <div>
    <CountLabel count={count()} />
    <button onClick={() => setCount(value => value + 1)}>Add</button>
  </div>;
}
```

The reactive read occurs in the text expression inside `CountLabel`. Updating `count` replaces that text; it does not require the parent and every intermediate component to rerun.

This also allows a prop to pass through components without making those components subscribers:

```js
function Panel(props) {
  return <section><CountLabel count={props.count} /></section>;
}

function App() {
  let [count, setCount] = useState(0);
  return <Panel count={count()} />;
}
```

`Panel` forwards the reactive expression. `CountLabel` consumes it.

## Place reactive reads at the right boundary

A prop read at the top level of a component can make the entire component function reactive:

```js
function Availability(props) {
  if (!props.available) {
    return <p>Unavailable</p>;
  }

  return <Editor />;
}
```

That behavior is useful when the complete component structure should be replaced. The previous output and scopes it owned are disposed before the new branch takes over.

When only one region is conditional, keep the read inside JSX so the surrounding component and its state remain stable:

```js
import { useState, withValue } from 'seniman';

function EditorCard(props) {
  let [draft, setDraft] = useState('');

  return <section>
    <h2>Editor</h2>
    {props.available
      ? <textarea value={draft()} onChange={withValue(setDraft)} />
      : <p>Unavailable</p>}
  </section>;
}
```

Here, changes to `props.available` replace only the conditional region. The `EditorCard` scope and its `draft` state survive.

Use top-level reads for whole-component branching. Use JSX expressions, memos, or smaller child components for narrower updates.

## Pass children for layout and ownership

Components receive nested content through `props.children`.

```js
function Card(props) {
  return <section class="card">
    <h2>{props.title}</h2>
    <div class="card-body">{props.children}</div>
  </section>;
}

function AccountPage() {
  return <Card title="Account">
    <ProfileForm />
  </Card>;
}
```

Children may contain text, elements, components, conditional expressions, Collections, or Sequences. Their server-side scopes remain owned by the place where Seniman renders them and are disposed when that rendered branch is removed.

## Own resources for the component lifetime

Anything created for a component should usually end with it.

```js
import { onDispose, useState } from 'seniman';

function Clock() {
  let [now, setNow] = useState(new Date());
  let timer = setInterval(() => setNow(new Date()), 1000);

  onDispose(() => clearInterval(timer));

  return <time>{now().toLocaleTimeString()}</time>;
}
```

This applies to timers, database listeners, streams, subscriptions, and other server resources. Effects have the same ownership rule and clean up before rerunning.

## Keep server work on the server

Direct event handlers execute in the component's server scope, so they can call databases and internal services without exposing credentials or APIs to the browser.

```js
import { useState } from 'seniman';

function UserLoader(props) {
  let [user, setUser] = useState(null);
  let [error, setError] = useState(null);

  async function loadUser() {
    try {
      setError(null);
      setUser(await props.users.findById(props.userId));
    } catch (cause) {
      setError(cause);
    }
  }

  return <section>
    <button onClick={loadUser}>Load user</button>
    {user() ? <p>{user().name}</p> : null}
    {error() ? <p>Could not load user.</p> : null}
  </section>;
}
```

Use an effect when work follows reactive inputs automatically. Use an event handler when work follows an explicit user action. See [Managing Reactive State](/docs/state-management) for effects and cleanup, and [Understanding Events](/docs/event-system) for the browser-server event boundary.

## A practical component checklist

- Create state and owned resources inside the component scope.
- Treat props as inputs and pass actions upward as server functions.
- Read reactive props close to the output that needs them.
- Use top-level reactive reads only when replacing the whole component is intended.
- Register cleanup for timers, subscriptions, and streams.
- Extract a component when a region has its own inputs, state, lifetime, or repeated structure.

Components provide structure; state getters determine update boundaries; ownership determines cleanup. Keeping those three concerns visible produces Seniman interfaces that update narrowly and dispose predictably.
