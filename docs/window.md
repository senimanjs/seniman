# Window

In the center of Seniman's architecture is the `Window` object. It is the representation of the connected browser window's functionality that can be accessed from the component tree on the server-side.

It is used for the management of a couple of things that you'd expect to be available in the browser, such as:

- [`path`](#path)
- [`setPath`](#setpath)
- [`pageTitle`](#pagetitle)
- [`setPageTitle`](#setpagetitle)
- [`cookie`](#cookie)
- [`setCookie`](#setcookie)
- [`viewportSize`](#viewportsize)
- [`clientExec`](#clientexec)

Let's go through the usage of these functions and states.

## Path

#### `window.path`

The `path` state is a string that represents the current path of the page. The value of the `path` state is automatically updated when the page's path changes. 

Example use:

```js
import { useWindow } from 'seniman'

export function MyComponent() {
  const window = useWindow();

  return (
    <div>
      <p>Current path: {window.path()}</p>
    </div>
  )
}
```

Since this is just a regular state, you can also use it in a `useEffect` to be notified when the path changes.

```js
import { useWindow, useEffect } from 'seniman'

export function MyComponent() {
  const window = useWindow();

  useEffect(() => {
    console.log('Current path:', window.path());
  });

  return (
    <div>
      <p>Current path: {window.path()}</p>
    </div>
  )
}
```

#### `window.setPath`

The `setPath` function is used to change the current path of the browser.

```js

import { useWindow } from 'seniman'

export function MyComponent() {
  const window = useWindow();

  return (
    <div>
      <button onClick={() => window.setPath('/new-path')}>Change path</button>
    </div>
  )
}

```

Note: Seniman has a built-in router that wrap these APIs that you can use to manage the pages routing more easily. You can read more about it in the [Routing](/docs/routing) document.

### Page title

#### `window.pageTitle`

The `title` state is a string that represents the current title of the page. The value of the `title` state is automatically updated when the page's title changes. You'd typically use this to set the page title in the `Head` component.

```js

import { useWindow } from 'seniman'

function Head() {
  const window = useWindow();

  return (
    <>
      <title>{window.pageTitle()}</title>
    </>
  )
}

```

To set the page title, you can use the `setPageTitle` from somewhere in your component tree.

```js

import { useWindow } from 'seniman'

function ProductPage() {
  const window = useWindow();

  useEffect(async () => {
    let product = await getProduct(3);

    window.setPageTitle(product.name);
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

#### `window.cookie` and `window.setCookie`

`window.cookie` is a state whose value is a string that represents the current complete cookie value of the page. It is a state getter, meaning that you can only read its value, but not change it. The value of the `cookie` state is automatically updated when the page's cookie changes. To change the cookie, you can use the `setCookie` function.

A primary use case for this in real-world apps are to manage session and authentication. Here's one simple way you can use `cookie` to manage authentication:

```js

import { useWindow } from 'seniman';

function MyComponent() {
  const window = useWindow();

  let session = useMemo(() => {
    let _cookie = window.cookie();

    if (_cookie) {
      return { userId: parseCookie(_cookie).userId };
    } else {
      return null;
    }
  });

  return (
    <div>
      <p>Current cookie: {window.cookie()}</p>
      {session() ? <p>Logged in as user {session().userId}</p> : <LoginPage />}
    </div>
  )
}

```

To set the cookie, you can use the `setCookie` from somewhere in your component tree, for example, when a user logs in.

```js

import { useWindow } from 'seniman'

function LoginPage() {
  const window = useWindow();

  let [username, setUsername] = useState('');
  let [password, setPassword] = useState('');

  let login = async () => {
    let user = await login(username(), password());

    window.setCookie(`userId=${user.id}`);
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

#### `window.viewportSize`

The `viewportSize` state is an object that represents the current viewport size of the page. It is a state getter, meaning that you can only read its value, but not change it. The value of the `viewportSize` state is automatically updated when the page's viewport size changes. It is useful for implementing different layouts for different screen sizes.

Here's one example of how you can use it to implement a responsive layout:

```js

import { useWindow } from 'seniman'

function Body() {
  let window = useWindow();
  let isMobileLayout = useMemo(() => window.viewportSize().width < 600);

  return (
    <div>
      <div>
        <p>Current viewport size: {window.viewportSize().width} x {window.viewportSize().height}</p>
      </div>
      {isMobileLayout() ? <MobileHeader /> : <DesktopHeader />}
      <Content />
      {!isMobileLayout() ? <Sidebar /> : null}
    </div>
  )
}

```

#### `window.clientExec`

The `clientExec` function is used to execute a client function. A client function is used to execute logic that needs to run exclusively on the client, as opposed to the server. A more complete explanation on how to use this is written at the [Client Functions](/docs/client-functions) document.