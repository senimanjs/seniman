# Document Head API Reference

The `seniman/head` components add lifecycle-owned elements to the browser document's `<head>`.

Render these components inside a Seniman component tree. The import belongs at module scope; each `<Title>`, `<Meta>`, `<Style>`, `<Script>`, or `<Link>` instance belongs to the component that returns it.

```js
import { Link, Meta, Script, Style, Title } from 'seniman/head';
```

They may be rendered anywhere in the component tree. Their head element is removed when the component's owning scope is disposed.

These components render no visible body content. Their position in the component tree determines ownership and lifetime, not their physical position in the document.

## Title

### `<Title text>`

Sets the document title.

```js
function ProfilePage(props) {
  return <main>
    <Title text={`Profile: ${props.user.name}`} />
    ...
  </main>;
}
```

Titles form a stack. The most recently mounted Title is active; removing it restores the previous title. A reactive `text` prop updates the active title in place.

**Props:**

- `text` — the string placed in `document.title`.

This stacking behavior allows a nested page or dialog to temporarily override an application-level title without manually restoring it.

```js
function AppShell() {
  return <div>
    <Title text="Acme" />
    <CurrentPage />
  </div>;
}

function AccountPage() {
  return <main>
    <Title text="Account · Acme" />
    ...
  </main>;
}
```

## Metadata

### `<Meta name? content? httpEquiv? charset?>`

Adds a `<meta>` element.

```js
function AccountMetadata() {
  return <>
    <Meta name="description" content="Account settings" />
    <Meta charset="utf-8" />
  </>;
}
```

**Props:**

- `name` — metadata name, such as `description` or `viewport`.
- `content` — metadata value associated with `name` or `httpEquiv`.
- `httpEquiv` — value for the HTML `http-equiv` attribute.
- `charset` — character encoding declaration.

Use the prop combination appropriate to the metadata being declared; unspecified props are omitted. Mounting multiple Meta components creates multiple elements—Seniman does not deduplicate by `name`.

## Styles

### `<Style text type?>`

Adds a `<style>` element containing `text`.

```js
function AppStyles() {
  return <Style text={`
    .notice { color: orange; }
  `} />;
}
```

**Props:**

- `text` — raw CSS text.
- `type` — optional style MIME type.

The CSS applies while the Style component is mounted. Removing its owner removes the `<style>` element and its rules. Prefer one stable Style component for large shared stylesheets; frequently replacing a large reactive `text` value recreates browser CSS work.

## Scripts

### `<Script src onLoad?>`

Adds a `<script>` element. `onLoad` uses the normal Seniman event-handler rules.

```js
function AnalyticsScript() {
  return <Script src="/analytics.js" onLoad={() => {
    console.log('Analytics loaded');
  }} />;
}
```

**Props:**

- `src` — script URL.
- `onLoad` — optional handler called after the browser fires the script's load event.

The Script component currently exposes `src` and `onLoad`; it does not expose inline script text, `type`, `async`, `defer`, integrity, or nonce props. Removing the component removes the element but does not undo side effects produced by code that already executed.

Use a `$c` `onLoad` handler when initialization itself must run in the browser, or a direct server handler when the server only needs notification.

## Links

### `<Link rel href type? as? crossorigin? media? onLoad?>`

Adds a `<link>` element.

```js
function AppAssets() {
  return <>
    <Link rel="stylesheet" href="/app.css" />
    <Link rel="preload" href="/font.woff2" as="font" crossorigin="anonymous" />
  </>;
}
```

`onLoad` uses the normal Seniman event-handler rules.

**Props:**

- `rel` and `href` — link relationship and destination.
- `type` — linked resource MIME type.
- `as` — destination type for preload links.
- `crossorigin` — value for the HTML `crossorigin` attribute.
- `media` — media query controlling applicability.
- `onLoad` — optional load handler.

The prop is spelled `crossorigin` in this component API. As with Style, removing a stylesheet Link removes its element and therefore removes that stylesheet from the document.

## Reactive props and ownership

Head components participate in normal Seniman ownership. When a conditional branch changes, elements owned by the removed branch are cleaned up automatically.

```js
function ArticleMetadata(props) {
  return props.article
    ? <Meta name="description" content={props.article.summary} />
    : null;
}
```

Title has dedicated in-place text updates. Other head components are replaced through normal component rendering when a top-level reactive prop causes their component scope to rerun.
