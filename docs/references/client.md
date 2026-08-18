# Client API Reference

The Client object exposes browser state and browser operations to server-side components.

Call `useClient()`, `createRef()`, and `createChannel()` inside a Seniman component or another active scope. `createModule()` is the exception: declare reusable modules at JavaScript module scope. Short examples using an existing `client` are component-body excerpts.

```js
import {
  createChannel,
  createHandler,
  createModule,
  createRef,
  useClient
} from 'seniman';
```

## Access

### `useClient()`

Returns the Client associated with the current browser window.

```js
function Page() {
  let client = useClient();
  return <p>{client.location.pathname()}</p>;
}
```

Call it while a component or another Seniman scope is executing. The returned object is stable for the lifetime of that browser window; its reactive getters update in place.

### `useWindow()`

An alias for `useClient()` retained for compatibility.

## Location

### `client.location.href()`

Returns the current full URL as a reactive value.

The result is a string such as `https://example.com/products?page=2`.

### `client.location.pathname()`

Returns the current pathname as a reactive value.

The result begins with `/` and does not include the query string or fragment.

### `client.location.search()`

Returns the current query string, including its leading `?`, as a reactive value.

### `client.location.searchParams()`

Returns the current `URLSearchParams` object as a reactive value.

Treat the returned object as read-only. To change the query, construct a new URL or query string and navigate with `setHref()`, `pushState()`, or `replaceState()`.

### `client.location.host`

The initial hostname and port.

### `client.location.hostname`

The initial hostname without a port.

### `client.location.origin`

The initial URL origin.

### `client.location.protocol`

The initial URL protocol, including its trailing colon.

### `client.location.port`

The initial explicit port, or an empty string.

### `client.location.setHref(href)`

Navigates to `href`. Same-origin URLs update browser history and Seniman's reactive location state. Cross-origin URLs perform a full browser navigation.

```js
function AccountLink() {
  let client = useClient();

  return <button onClick={() => {
    client.location.setHref('/account');
  }}>
    Account
  </button>;
}
```

Pass a root-relative URL beginning with `/` or a complete absolute URL. Root-relative paths are resolved against the initial origin. A same-origin call behaves like `history.pushState()`; it does not reload the page.

The host, hostname, origin, protocol, and port properties remain fixed for the window lifetime. Cross-origin navigation unloads the current Seniman window rather than updating those static properties.

## History

### `client.history.pushState(href)`

Pushes a same-origin history entry and updates reactive location state.

The browser Back button can return to the previous entry. Seniman listens for `popstate` and updates the location getters when that happens.

### `client.history.replaceState(href)`

Replaces the current same-origin history entry and updates reactive location state.

Unlike `pushState()`, it does not add another Back-button entry.

Both methods throw when passed a URL on another origin.

They accept a root-relative URL or an absolute same-origin URL. They do not accept browser-style state and title arguments; the single argument is the destination URL.

## Viewports

### `client.viewportSize()`

Returns the layout viewport as `{ width, height }`. It is available during initial rendering and tracks `window.innerWidth` and `window.innerHeight` changes.

Use it for responsive page layout.

The values are integer CSS pixels. The initial value comes from the WebSocket handshake, so layout decisions can be made during the first application render.

```js
import { useClient, useMemo } from 'seniman';

function Navigation() {
  let client = useClient();
  let compact = useMemo(() => client.viewportSize().width < 640);

  return compact() ? <MobileNavigation /> : <DesktopNavigation />;
}
```

### `client.visualViewport()`

Returns `null` until the browser sends its first visual viewport report, then returns:

```js
{
  width,
  height,
  offsetLeft,
  offsetTop,
  scale
}
```

It updates when the visible viewport resizes or moves, including software-keyboard and pinch-zoom changes. Use it for UI that must follow the currently visible portion of the screen.

The dimensions and offsets are CSS pixels; `scale` is the visual viewport scale. Always handle the initial `null` value, usually by falling back to `viewportSize()`.

```js
import { useClient, useMemo } from 'seniman';

function VisibleViewportStatus() {
  let client = useClient();
  let visibleHeight = useMemo(() =>
    client.visualViewport()?.height ?? client.viewportSize().height
  );

  return <span>{visibleHeight()}px visible</span>;
}
```

## Cookies

### `client.cookie(name)`

Returns a reactive getter for a browser cookie.

```js
function ThemeName() {
  let client = useClient();
  let theme = client.cookie('theme');

  return <span>{theme() ?? 'light'}</span>;
}
```

The getter returns the decoded cookie value or `null` when the key is absent. Create it once in the owning scope and reuse the returned getter rather than calling `client.cookie(name)` repeatedly in rendered output.

### `client.setCookie(name, value, expirationTime?)`

Writes a cookie through `document.cookie` and updates matching server-side cookie getters.

When omitted, `expirationTime` defaults to one hour from the call. This API cannot create `HttpOnly` cookies; authentication cookies should be issued by the HTTP server.

The cookie is written with `path=/`. `expirationTime` must be a `Date`. The current API does not expose `Secure`, `SameSite`, `Domain`, or a custom Path option.

## Browser execution

### `client.exec(clientFunction)`

Executes a `$c` client function in the browser.

```js
function BrowserTitleButton() {
  let client = useClient();

  return <button onClick={() => {
    client.exec($c(() => {
      document.title = 'Updated in the browser';
    }));
  }}>
    Update title
  </button>;
}
```

Server values captured with `$s(...)` are serialized when `exec()` is called. See [Events](/docs/references/events) for client and server function syntax.

`exec()` is fire-and-forget and returns `undefined`; browser return values are not sent back to the server. To report a result, call a server handler from the client function.

```js
import {
  createHandler,
  createRef,
  useClient,
  useState
} from 'seniman';

function PreviewPanel(props) {
  let client = useClient();
  let previewRef = createRef();
  let [preview, setPreview] = useState('');
  let [height, setHeight] = useState(null);

  let reportHeight = createHandler(value => {
    setHeight(Math.round(value));
  });

  async function generatePreview() {
    let text = await props.renderPreview();
    setPreview(text);

    client.exec($c(() => {
      requestAnimationFrame(() => {
        let preview = $s(previewRef).get();
        $s(reportHeight)(preview.getBoundingClientRect().height);
      });
    }));
  }

  return <div>
    <button onClick={generatePreview}>Generate preview</button>
    <pre ref={previewRef}>{preview()}</pre>
    <p>Rendered height: {height() ?? 'not measured'}px</p>
  </div>;
}
```

Here `client.exec()` runs only after asynchronous server work has produced the preview and scheduled its DOM update. A `$c` click handler would run too early to measure that new content. Raw server functions captured by a `$c` event or lifecycle prop are wrapped automatically; a standalone function passed to `client.exec()` does not have that JSX-owned attachment lifecycle, so callbacks from it require an explicit `createHandler()`.

Captured server values may contain strings, numbers, booleans, `null`/`undefined`, Arrays, plain objects, Buffers, handlers, refs, channels, and modules. Values are serialized snapshots; ordinary object identity and prototypes do not cross the connection.

## Element references

### `createRef()`

Creates a server-side reference token that can identify one rendered element inside client functions.

```js
function SearchInput() {
  let inputRef = createRef();

  return <div>
    <input ref={inputRef} />
    <button onClick={$c(() => {
      $s(inputRef).get()?.focus();
    })}>
      Focus
    </button>
  </div>;
}
```

Pass the token to an element's `ref` prop. Inside `$c`, `$s(ref).get()` returns that browser DOM element once mounted, otherwise `null`. The DOM element itself never exists on the server.

Create a separate ref for each simultaneously mounted element. Reusing one ref prop causes the token to point at whichever attachment was processed most recently.

## Channels

### `createChannel()`

Creates a server-to-browser value channel.

```js
function ProgressButton() {
  let client = useClient();
  let progress = createChannel();

  client.exec($c(() => {
    $s(progress).onValue(value => {
      console.log('Progress:', value);
    });
  }));

  return <button onClick={() => {
    progress.send({ completed: 4, total: 10 });
  }}>
    Send progress
  </button>;
}
```

**Returns:** a channel token with `send(value)` on the server. Inside a client function, `$s(channel).onValue(callback)` registers a browser-side receiver. Values sent before a receiver is installed are queued by the browser runtime and delivered once `onValue()` is registered.

Channels are one-way. Use a server handler when the browser must send a value back.

## Client modules

### `createModule(clientFunction)`

Defines a reusable browser-side value or function. The client function runs once when that module is first required by a browser window, and its return value becomes the module value.

```js
const FocusModule = createModule($c(() => {
  return element => element.focus();
}));

function SearchBox() {
  let inputRef = createRef();

  return <div>
    <input ref={inputRef} />
    <button onClick={$c(() => {
      $s(FocusModule)($s(inputRef).get());
    })}>
      Focus search
    </button>
  </div>;
}
```

Declare modules at module scope so they receive one stable Seniman module ID. Modules may capture other modules and serializable server values through `$s` using the same rules as other client functions.

## Compatibility aliases

### `client.path()`

Alias for `client.location.pathname()`.

Prefer the `location` form in new code.

### `client.navigate(href)`

Alias for `client.location.setHref(href)`.

Prefer the `location` form in new code.
