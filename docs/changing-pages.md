# Changing Pages

Changing pages are the bread and butter of any web application. Seniman provides a few functions that you can use to change the page, and also to react to page URL changes.


### Making anchor links

To create a link to another page in your component, you can use the built-in `Anchor` component. `Anchor` is a thin wrapper on top of the `<a>` tag with the `onClick` wiring done for you. Here's an example:

```js
import { Anchor } from 'seniman';

function MyComponent(props) {
  return (
    <Anchor href={"/products/" + props.id}>
      Go to product
    </Anchor>
  );
}
```

Since this is a relative link to another page in the same host, it will execute a `history.pushState` under the hood. You can also use the `Anchor` component to link to an external page as well:

```js
import { Anchor } from 'seniman';

function MyComponent() {
  return (
    <Anchor href="http://otherhost.com">
      External Site
    </Anchor>
  );
}
```

The `Anchor` component will automatically detect if the link is an external link, and will execute a full page load instead of `history.pushState`.

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

Let's make a simple example that displays different "page components" depending on the page URL. First, let's create a `div` that will be the root of our app, with a function inside, calling the `client.location.pathname` state getter:

```js
import { useClient } from 'seniman';

function App() {
  let client = useClient();

  return <div>
    {() => {
      let pathname = client.location.pathname();      
    }}
  </div>;
}
```

With this code, we'll have the function re-compute every time the page URL changes. Now, we want to have the function actually return a component depending on the page URL. Let's do that:

```js
import { useClient } from 'seniman';

function App() {
  let client = useClient();

  return <div>
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

Now, we have an application that renders different components depending on the page URL using standard if-else statements. Let's now add a few `Anchor` components to make the links.

```js
import { useClient, Anchor } from 'seniman';

function App() {
  let client = useClient();

  return <div>
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

Voila! We now have an application that renders different components depending on the URL, with links to navigate between them.

If you want to take a look at a simple codebase that implements this pattern, you can take a look at the [Basic Routing](https://github.com/senimanjs/seniman/tree/main/examples/routing-basic) example in the Seniman repository.

Next, we'll take a look at styling our interface using CSS in Seniman [here](/docs/styling).