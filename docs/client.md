# Client Object

Although Seniman is a primarily server-side framework, accessing the client-side functionality is still a prime necessity. Seniman provides a `Client` object that represents the client-side functionality, accessible from the server-side.

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

The `client` object is used for the management of a couple of things that you'd expect to be available in the browser, such as:

- [`path`](#clientpath)
- [`setPath`](#setpath)
- [`pageTitle`](#pagetitle)
- [`setPageTitle`](#setpagetitle)
- [`cookie`](#cookie)
- [`setCookie`](#setcookie)
- [`viewportSize`](#viewportsize)
- [`exec`](#exec)

Let's go through the usage of these functions and states.

## Path

#### `client.path`

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

#### `client.setPath`

The `setPath` function is used to change the current path of the browser.

```js

import { useClient } from 'seniman'

export function MyComponent() {
  const client = useClient();

  return (
    <div>
      <button onClick={() => client.setPath('/new-path')}>Change path</button>
    </div>
  )
}

```

Note: Seniman has a built-in router that wrap these APIs that you can use to manage the pages routing more easily. You can read more about it in the [Routing](/docs/routing) document.

### Page title

#### `client.pageTitle`

The `title` state is a string that represents the current title of the page. The value of the `title` state is automatically updated when the page's title changes. You'd typically use this to set the page title in the `Head` component.

```js

import { useClient } from 'seniman'

function Head() {
  const client = useClient();

  return (
    <>
      <title>{client.pageTitle()}</title>
    </>
  )
}

```

To set the page title, you can use the `setPageTitle` from somewhere in your component tree.

```js

import { useClient } from 'seniman'

function ProductPage() {
  const client = useClient();

  useEffect(async () => {
    let product = await getProduct(3);

    client.setPageTitle(product.name);
  });

  return (
    <div>
      <h1>My product</h1>
      <div>{product.name}</div>
    </div>
  )
}

```

### Cookie

#### `client.cookie` and `client.setCookie`

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

    client.setCookie(`userId=${user.id}`);
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

#### `client.viewportSize`

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

#### `client.exec`

The `exec` function is used to execute a client function. A client function is used to execute logic that needs to run exclusively on the client, as opposed to the server. A more complete explanation on how to use this is written at the [Client Functions](/docs/client-functions) document.