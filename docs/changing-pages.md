# Changing Pages

Changing pages are the bread and butter of any web application. Seniman provides a few functions that you can use to change the page, and also to react to page URL changes.


### Making anchor links

To create a link to another page in your component, you can use the built-in `Anchor` component:

```js
import { Anchor } from 'seniman';

function MyComponent(props) {
  return <Anchor href={"/products/" + props.id}>Go to product</Anchor>;
}
```

Since this is a relative link to another page in the same host, it will execute a `history.pushState` under the hood.

You can also use the `Anchor` component to link to an external page as well:

```js
import { Anchor } from 'seniman';

function MyComponent() {

  return <Anchor href="http://otherhost.com">External Site</Anchor>;
}
```

The `Anchor` component will automatically detect if the link is an external link, and will execute a full page load instead of a `history.pushState` under the hood.

### Programmatic page changes

You can also change the page programmatically by directly calling the `client.location.setHref` function:

```js
import { useClient } from 'seniman';

function MyComponent(props) {
  let client = useClient();

  let onClick = () => {
    client.location.setHref('http://otherhost.com/page?id=' + props.id);
  };

  return <button onClick={onClick}>Go to another page</button>;
}
```

`client.location.setHref` employs the same logic as the `Anchor` component -- we are linking to an external host in this example, so it will execute a full page load. If we were linking to a page in the same host, it will execute a `history.pushState` under the hood.


### Reacting to page changes

We've just covered how to change the page. But how do we react to page changes? Seniman provides a few state getters in the `client.location` that you can use to react to page changes. 

Let's make a simple example that displays different "page components" depending on the page URL.

First, let's create a `div` that will be the root of our application, with a scope function inside, calling the `client.location.pathname` state getter:

```js
import { createRoot, useState } from 'seniman';

function App() {
  let client = useClient();

  return <div class="root-div">
    {() => {
      let pathname = client.location.pathname();      
    }}
  </div>;
}
```

With this code, we'll have the function re-compute every time the page URL changes. Now, we want to have the function actually
return a component depending on the page URL. Let's do that:

```js
import { createRoot, useClient } from 'seniman';

function App() {
  let client = useClient();

  return <div class="root-div">
    {() => {
      let pathname = client.location.pathname();

      if (pathname === '/products') {
        return <ProductsPage />;
      } else if (pathname === '/about') {
        return <AboutPage />;
      } else {
        return <NotFoundPage />;
      }
    }}
  </div>;
}

function ProductsPage() { ... }
function AboutPage() { ... }
function NotFoundPage() { ... }
```

Now, we have an application that renders different components depending on the page URL. But we're not changing the page URL yet. Let's create a few links to change the page URL:

```js
import { createRoot, useState } from 'seniman';

function App() {
  let client = useClient();

  return <div class="root-div">
    <Anchor href="/products">Products</Anchor>
    <Anchor href="/about">About</Anchor>
    {() => {
      let pathname = client.location.pathname();

      if (pathname === '/products') {
        return <ProductsPage />;
      } else if (pathname === '/about') {
        return <AboutPage />;
      } else {
        return <NotFoundPage />;
      }
    }}
  </div>;
}

function ProductsPage() { ... }
function AboutPage() { ... }
function NotFoundPage() { ... }
```

Voila! We now have an application that renders different components depending on the page URL. There are details that we haven't covered yet, such as getting parameters from the URL -- you can take a look at a more complete multi-page app example in the [examples](https://github.com/senimanjs/seniman/tree/main/examples/simple-multi-page).