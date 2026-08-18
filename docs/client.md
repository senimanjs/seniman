# Working with the Browser Client

Seniman components run on the server, but each component tree belongs to one browser window. `useClient()` gives server-side code a window-specific Client object for navigation, viewport state, cookies, and intentional browser execution.

```js
import { useClient } from 'seniman';

function CurrentPath() {
  let client = useClient();
  return <p>Current path: {client.location.pathname()}</p>;
}
```

Call `useClient()` inside a component or another active Seniman scope. Do not store one Client in module scope: different visitors have different locations, dimensions, cookies, and browser connections.

This guide focuses on choosing the right part of the Client. See the [Client reference](/docs/references/client) for every property, exact shape, compatibility alias, ref, channel, and module API.

## Navigate without reloading the page

The Client exposes reactive location state. `pathname()`, `search()`, `searchParams()`, and `href()` update when Seniman performs same-origin navigation or the user moves through browser history.

```js
function PageRouter() {
  let client = useClient();

  return () => {
    switch (client.location.pathname()) {
      case '/account':
        return <AccountPage />;
      case '/settings':
        return <SettingsPage />;
      default:
        return <HomePage />;
    }
  };
}
```

Use `<Anchor>` for normal links:

```js
import { Anchor } from 'seniman';

function Navigation() {
  return <nav>
    <Anchor href="/account">Account</Anchor>
    <Anchor href="/settings">Settings</Anchor>
  </nav>;
}
```

For imperative navigation, call `client.location.setHref()`:

```js
function ContinueButton() {
  let client = useClient();

  return <button onClick={() => {
    client.location.setHref('/checkout');
  }}>
    Continue
  </button>;
}
```

A root-relative or absolute same-origin URL updates history and reactive location state without reloading the document. A cross-origin URL performs a normal full-page navigation.

Use `client.history.replaceState()` when the destination should replace the current Back-button entry—for example, after normalizing a URL. Use `pushState()` when it should add a new entry.

## Build responsive layouts from the layout viewport

`client.viewportSize()` reports `{ width, height }` for the browser's layout viewport. It is available during the first render and is normally the right input for responsive layout.

```js
import { useClient, useMemo } from 'seniman';

function AppLayout() {
  let client = useClient();
  let compact = useMemo(() => client.viewportSize().width < 640);

  return <div>
    {compact() ? <MobileNavigation /> : <DesktopNavigation />}
    <MainContent />
    {compact() ? null : <Sidebar />}
  </div>;
}
```

Keep the width decision in a memo when several regions use the same breakpoint. Only consumers of `compact()` then need to respond to that decision.

## Use the visual viewport for overlays and keyboards

The layout viewport describes page layout. The visual viewport describes the portion currently visible after software keyboards, pinch zoom, and viewport panning.

`client.visualViewport()` is initially `null`, then becomes `{ width, height, offsetLeft, offsetTop, scale }` after the browser reports it.

```js
function VisibleBottomBar() {
  let client = useClient();

  let bottom = useMemo(() => {
    let visual = client.visualViewport();
    if (!visual) return 0;

    let layoutHeight = client.viewportSize().height;
    return Math.max(0, layoutHeight - visual.offsetTop - visual.height);
  });

  return <div style={{ position: 'fixed', bottom: `${bottom()}px` }}>
    <ComposerActions />
  </div>;
}
```

Use this for bars that must stay above a mobile keyboard or overlays that follow the visible screen. Do not base ordinary desktop/mobile breakpoints on `visualViewport()`: opening a keyboard would incorrectly look like a layout change.

## Store non-sensitive browser preferences in cookies

`client.cookie(name)` returns a reactive getter. `client.setCookie()` writes through `document.cookie` and updates that getter.

```js
import { useClient, useMemo } from 'seniman';

function ThemeControl() {
  let client = useClient();
  let themeCookie = client.cookie('theme');
  let theme = useMemo(() => themeCookie() ?? 'light');

  return <button onClick={() => {
    client.setCookie(
      'theme',
      theme() === 'dark' ? 'light' : 'dark'
    );
  }}>
    Theme: {theme()}
  </button>;
}
```

This is appropriate for preferences that may be read by browser JavaScript. It is not appropriate for authentication secrets: JavaScript-created cookies cannot be `HttpOnly`, and this helper does not expose the full set of cookie security attributes. Issue sensitive cookies through the HTTP server.

## Cross into browser code deliberately

Most application work should remain in components and server handlers. Use `client.exec()` when the operation fundamentally requires the DOM or another browser-only API.

```js
import { useClient } from 'seniman';

function CopyButton(props) {
  let client = useClient();

  return <button onClick={() => {
    let text = props.text;

    client.exec($c(() => {
      navigator.clipboard.writeText($s(text));
    }));
  }}>
    Copy
  </button>;
}
```

The `$c` function runs in the browser. `$s(text)` embeds the server value serialized at the time `exec()` is called.

Browser return values do not automatically come back to the server. If the result matters to server state, call a server handler from the client function. The [Client Functions guide](/docs/client-functions) develops that bridge in detail.

The Client is a narrow bridge, not a second application state store. Keep durable application state on the server and cross into the browser only for capabilities that actually live there.
