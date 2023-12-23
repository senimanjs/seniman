# Client Object

Although Seniman is a primarily server-side framework, accessing the browser functionality is still a prime concern. Seniman provides a `Client` object that represents the client-side functionality, accessible from the server-side.

You can access the `Client` object from the `useClient` hook:

```js
import { useClient } from 'seniman'

export function MyComponent() {
  let client = useClient();

  return (
    <div>
      <p>Current path: {client.path()}</p>
    </div>
  )
}
```

The `client` object is used for server-side management of critical browser functions. Here are some properties of the `client` object:

- [`location`](#location)
- [`history`](#history)
- [`cookie`](#cookie)
- [`setCookie`](#setcookie)
- [`viewportSize`](#viewportsize)
- [`exec`](#exec)

And a few deprecated ones:

- [`path`](#path)
- [`navigate`](#navigate)

Let's go through the usage of these functions and states.

## Location

The `client.location` object is a rough equivalent of the `window.location` object in the browser. It has a few state getters that you can use to listen to location changes:

- `client.location.pathname`
- `client.location.search`
- `client.location.searchParams`
- `client.location.href`

You can use it in an effect to be notified when the location changes:

```js
function Component() {

  useEffect(() => {
    console.log('searchParams:', client.location.searchParams());

    ...
  });

  ...
}
```

There are also a few other static properties that are available:

- `client.location.host`
- `client.location.hostname`
- `client.location.origin`
- `client.location.protocol`
- `client.location.port`

These are static values and not states since they do not change during the lifetime of the window.

### Changing the Location
To change the location of the page, there is a single function that you can use:

- `client.location.setHref(href)`

This is roughly equivalent to `window.location.href = ...` in the browser, with a slight caveat: if it is a relative path or refers to the host that is similar to the current host, it will be treated as a path change that is equivalent to a `history.pushState`. Otherwise, it will be treated as a full page load. 

Under the hood, the `pushState` process uses the `client.history` object that we will discuss next.

##### Note: Seniman has a built-in router that wrap these APIs that you can use to manage the pages routing more easily. You can read more about it in the [Routing](/docs/routing) document.

## History

The `client.history` object is a rough equivalent of the `window.history` object in the browser. It has a few functions that you can use to manage the history of the page:

- `client.history.pushState(href)`
- `client.history.replaceState(href)`

These are the primary functions that you can use to change the location of the page, and are roughly equivalent to `window.history.pushState` and `window.history.replaceState` in the browser. The call to these functions will trigger the server-side `location` state to change, and history management on the browser to be executed.

## Cookie

#### `cookie` and `setCookie`

`client.cookie` is a state whose value is a string that represents the current complete cookie value of the page. It is a state getter, meaning that you can only read its value, but not change it. The value of the `cookie` state is automatically updated when the page's cookie changes. To change the cookie, you can use the `setCookie` function.

A primary use case for this in real-world apps are to manage session and authentication. Here's one simple way you can use `cookie` to manage authentication:

```js

import { useClient } from 'seniman';

function MyComponent() {
  const client = useClient();

  let session = useMemo(() => {
    let _cookie = client.cookie();

    if (_cookie) {
      return { userId: parseCookie(_cookie).userId };
    } else {
      return null;
    }
  });

  return (
    <div>
      <p>Current cookie: {client.cookie()}</p>
      {session() ? <p>Logged in as user {session().userId}</p> : <LoginPage />}
    </div>
  )
}

```

To set the cookie, you can use the `setCookie` from somewhere in your component tree, for example, when a user logs in.

```js

import { useClient } from 'seniman'

function LoginPage() {
  const client = useClient();

  let [username, setUsername] = useState('');
  let [password, setPassword] = useState('');

  let login = async () => {
    let user = await login(username(), password());

    client.setCookie("userId", user.id);
  };

  return (
    <div>
      <input type="text" onBlur={withValue(setUsername)} /> 
      <input type="password" onBlur={withValue(setPassword)} />
      <button onClick={login}>Login</button>
    </div>
  /)
}

```

You can see more real-world example of how to use cookie for session management in Seniman in the [express-routing-session](https://github.com/senimanjs/seniman/tree/main/examples/express-routing-session) example.

## Viewport

#### `viewportSize`

The `viewportSize` state is an object that represents the current viewport size of the page. It is a state getter, meaning that you can only read its value, but not change it. The value of the `viewportSize` state is automatically updated when the page's viewport size changes. It is useful for implementing different layouts for different screen sizes.

Here's one example of how you can use it to implement a responsive layout:

```js

import { useClient } from 'seniman'

function Body() {
  let client = useClient();
  let isMobileLayout = useMemo(() => client.viewportSize().width < 600);

  return (
    <div>
      <div>
        <p>Current viewport size: {client.viewportSize().width} x {client.viewportSize().height}</p>
      </div>
      {isMobileLayout() ? <MobileHeader /> : <DesktopHeader />}
      <Content />
      {!isMobileLayout() ? <Sidebar /> : null}
    </div>
  )
}

```

## Client Functions

#### `exec`

The `exec` function is used to execute a client function. A client function is used to execute logic that needs to run exclusively on the client, as opposed to the server. A more complete explanation on how to use this is written at the [Client Functions](/docs/client-functions) document.


---

#### Deprecated APIs

## Path

#### `path`

The `path` state is a string that represents the current path of the page. The value of the `path` state is automatically updated when the page's path changes. 

Example use:

```js
import { useClient } from 'seniman'

export function MyComponent() {
  const client = useClient();

  return (
    <div>
      <p>Current path: {client.path()}</p>
    </div>
  )
}
```

Since this is just a regular state, you can also use it in a `useEffect` to be notified when the path changes.

```js
import { useClient, useEffect } from 'seniman'

export function MyComponent() {
  const client = useClient();

  useEffect(() => {
    console.log('Current path:', client.path());
  });

  return (
    <div>
      <p>Current path: {client.path()}</p>
    </div>
  )
}
```

## Navigation

#### `navigate`

The `navigate` function is used to change the current path of the browser.

```js
import { useClient } from 'seniman'

export function MyComponent() {
  const client = useClient();

  return (
    <div>
      <button onClick={() => client.navigate('/new-path')}>Change path</button>
    </div>
  )
}
```
