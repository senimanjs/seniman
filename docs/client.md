# Client Object

Although Seniman is a primarily server-side framework, accessing the browser functionality is still a prime concern. Seniman provides a `Client` object that represents the client-side functionality, accessible from the server-side.

You can access the `Client` object from the `useClient` hook:

```js
import { useClient } from 'seniman';

export function MyComponent() {
  let client = useClient();

  return (
    <div>
      <p>Current path: {client.location.pathname()}</p>
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

Let's go through the usage of these properties.

## Location

The `client.location` object is a rough equivalent of the `window.location` object in the browser. It has a few state getters that you can use to listen to location changes:

- `location.pathname`
- `location.search`
- `location.searchParams`
- `location.href`

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

- `location.host`
- `location.hostname`
- `location.origin`
- `location.protocol`
- `location.port`

These are static values and not states since they do not change during the lifetime of the window.

### Changing the Location
To change the location of the page, there is a single function that you can use:

- `location.setHref(href)`

This is roughly equivalent to `window.location.href = ...` in the browser, with a slight caveat: if it is a relative path or refers to the host that is similar to the current host, it will be treated as a path change that is equivalent to a `history.pushState`. Otherwise, it will be treated as a full page load. 

Under the hood, the `pushState` process uses the `client.history` object that we will discuss next.

## History

The `client.history` object is a rough equivalent of the `window.history` object in the browser. It has a few functions that you can use to manage the history of the page:

- `history.pushState(href)`
- `history.replaceState(href)`

These are the primary functions that you can use to change the location of the page, and are roughly equivalent to `window.history.pushState` and `window.history.replaceState` in the browser. The call to these functions will trigger the server-side `location` state to change, and history management on the browser to be executed.

## Cookie

#### `cookie` and `setCookie`

`client.cookie` is a function that returns a state getter for a cookie with the given name. You can then use the cookie key's state getter to react to changes in the cookie value. Here's a simple example:

```js
let myCookie = client.cookie("myCookie");

// do something when the cookie value changes
useEffect(() => {
  console.log('myCookie:', myCookie());
});
```

A primary use case for this in real-world apps are to manage session and authentication. Here's one way you can use `cookie` to manage authentication:

```js
import { useClient } from 'seniman';

function isValidSessionKey(sessionKey) { ... }

// Extract the session data from the session key -- say with JWT 
function extractSessionData(sessionKey) { ... }

function MyComponent() {
  const client = useClient();

  let mySessionCookie = client.cookie("mySessionKey");

  // memo that abstracts the session data reading -- will reactively change as the cookie value changes
  let sessionData = useMemo(() => {

    let _cookieValue = mySessionCookie();

    if (!_cookieValue|| !isValidSessionKey(_cookieValue)) {
      return null;
    }

    // might return { userId: 123, ... } encoded with JWT in the cookie value
    return extractSessionData(_cookieValue);
  });

  // simple memo to check if the user is logged in by checking if the session data is valid
  let isLoggedIn = useMemo(() => {

    if (!sessionData()) {
      return false;
    }

    return true;
  });

  return (
    <div>
      <p>Current value of `mySessionKey` cookie: {mySessionCookie()}</p>
      {isLoggedIn() ? <p>Logged in as user {sessionData().userId}</p> : <LoginPage />}
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

    client.setCookie("mySessionKey", encodeJWT({ userId: user.id }));
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

You can also pass the expiration time for the cookie as the third argument to `setCookie`:

```js
// Set the cookie to expire in 7 days
let expirationDate = new Date();
expirationDate.setDate(expirationDate.getDate() + 7);

client.setCookie("userId", user.id, expirationDate);
```

You can see more expanded example of how to use cookie for session management in Seniman in the [login-simple](https://github.com/senimanjs/seniman/tree/main/examples/login-simple) example.

## Viewport

#### `viewportSize`

The `viewportSize` state is a state getter for the current viewport size of the page in the shape of `{ width, height }`. The value of the `viewportSize` state is automatically updated when the page's viewport size changes. It is useful for implementing different layouts for different screen sizes.

Here's one example of how you can use it to implement a responsive layout:

```js

import { useClient, useMemo } from 'seniman';

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