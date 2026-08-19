# Managing the Document Head

Titles, metadata, stylesheets, preload hints, and scripts live in the browser document's `<head>`, but they still need to follow the page and component currently rendered by Seniman.

The components exported by `seniman/head` make head entries scope-owned:

```js
import { Link, Meta, Script, Style, Title } from 'seniman/head';
```

Render them inside normal Seniman components. They produce no visible body element; instead, Seniman attaches the corresponding element to `<head>` and removes it when its owner is disposed.

For every supported prop, see the [Document Head reference](/docs/references/head).

## Establish application-wide defaults

Place entries that should live for the complete window lifetime near the application root.

```js
function App() {
  return <div>
    <Title text="Acme" />
    <Meta name="viewport" content="width=device-width, initial-scale=1" />
    <Meta name="theme-color" content="#202326" />
    <Link rel="stylesheet" href="/app.css" />
    <CurrentPage />
  </div>;
}
```

Because `App` owns these entries, route-level changes beneath `CurrentPage` do not remove them.

## Override the title inside a page

Titles form a stack. The most recently mounted `<Title>` is active; when it is removed, the previous title becomes active again.

```js
function App() {
  return <div>
    <Title text="Acme" />
    <CurrentPage />
  </div>;
}

function AccountPage() {
  return <main>
    <Title text="Account · Acme" />
    <h1>Account</h1>
  </main>;
}
```

When `AccountPage` is removed, its title is removed and `Acme` is restored automatically. The page does not need an unload handler that remembers the old title.

The `text` prop may be reactive:

```js
function DocumentPage(props) {
  return <main>
    <Title text={`${props.document.title} · Acme`} />
    <h1>{props.document.title}</h1>
  </main>;
}
```

When the document title changes, Seniman updates the active browser title.

## Keep page metadata with the page

Page-specific descriptions and metadata should be owned by the page component that knows their values.

```js
function ArticlePage(props) {
  return <article>
    <Title text={`${props.article.title} · Acme`} />
    <Meta name="description" content={props.article.summary} />

    <h1>{props.article.title}</h1>
    <ArticleBody article={props.article} />
  </article>;
}
```

Navigating away disposes both the page title and description. Seniman does not deduplicate Meta components by name, so avoid mounting two competing descriptions in the same active branch.

## Choose between `<Style>` and `<Link>`

Use `<Link>` for a static external stylesheet that the browser can cache:

```js
function AppStylesheet() {
  return <Link rel="stylesheet" href="/app.css" />;
}
```

Use `<Style>` when CSS is generated or bundled as text by the server application:

```js
function EditorStyles() {
  return <Style text={`
    .editor {
      min-height: 12rem;
      border: 1px solid #555;
    }
  `} />;
}
```

Styles apply only while their component is mounted. This is useful for self-contained routes or widgets, but application-wide CSS should usually have one stable owner to avoid repeatedly adding and removing large stylesheets.

`<Link>` can also express preload and media-specific resources:

```js
function FontResources() {
  return <Link
    rel="preload"
    href="/fonts/inter.woff2"
    as="font"
    type="font/woff2"
    crossorigin="anonymous"
  />;
}
```

## Load browser libraries with `<Script>`

`<Script>` adds an external script element. Use a browser-side `onLoad` function when initialization requires the loaded browser global.

```js
function Analytics() {
  return <Script
    src="/analytics.js"
    onLoad={$c(() => {
      window.analytics.initialize();
    })}
  />;
}
```

Use a direct server handler when the server only needs notification:

```js
function MapLibraryStatus() {
  function loaded() {
    console.log('Map library loaded in this browser');
  }

  return <Script src="/maps.js" onLoad={loaded} />;
}
```

Removing `<Script>` removes the element, but it cannot undo global variables, listeners, or other effects produced by code that already ran. If a browser library needs teardown, initialize it through an element-owned client lifecycle and return the library's cleanup function.

## Let ownership follow conditional UI

Head entries can appear inside the same conditional branch as the feature that needs them.

```js
function Workspace(props) {
  return <main>
    {props.editorOpen
      ? <EditorPage />
      : <WorkspaceOverview />}
  </main>;
}

function EditorPage() {
  return <section>
    <Title text="Editor · Acme" />
    <Style text=".editor-toolbar { position: sticky; top: 0; }" />
    <Editor />
  </section>;
}
```

Opening the editor mounts its title and styles. Closing it removes both along with the editor's visible output.

That is the main advantage of Seniman's head components: document metadata follows the same component ownership model as the rest of the interface, instead of becoming unrelated global setup code.
