# Routing

Seniman provides a simple built-in routing system that allows you to define routes and their corresponding components easily.

To use it, let's import the necessary functions from the `seniman/router` module:

```js
import { createRouting, Link, RouterRoot } from "seniman/router";
```

Next, let's initialize the routing system by calling `createRouting`:

```js
let routing = createRouting();
```

Next, we can start defining routes. Let's start with a simple route for the homepage at `/`:

```js
routing.on('/', 'home', (router) => {
  return <div>Welcome to the homepage!</div>;
});
```

As you can see, the `on` function takes three arguments, the `path`, the `name` and the `function`. The `path` is the path of the route, the `name` is the name of the route, and the `function` is the function that will be executed when the route is matched, returning elements to render. The `function` takes a `router` object as an argument, which we will use later.

You can now apply the routing in your component tree by wrapping it in a `RouterRoot` component:

```js
function Body() {
  return <RouterRoot routing={routing} />;
}
```

If you open `/` path in your application, you should see the "Welcome to the homepage!" message.

## Links

Links form the basis of navigation in any web application. Seniman provides a `Link` component that you can use to create links to other routes. Let's define a second route for the about page:

```js
routing.on('/about', 'about', (router) => {

  return <div>
    <h1>About</h1>
    <p>This is the about page.</p>
  </div>;
});
```

Now, let's add a link to the about page in the homepage:

```js
routing.on('/', 'home', (router) => {

  return <div>
    Welcome to the homepage!
    <Link name="about">About</Link>
  </div>;
});
```

When you click the link, you should be navigated to the about page.

## Route parameters

Now, let's add another route that takes a parameter:

```js
routing.on('/product/:id', 'product-detail', (router) => {

  return <div>
    Product page ID: {router.params().id}!
    </div>;
});
```

To define a route that takes a parameter, we can use the `:` prefix. The parameter will be available in the `router.params()` function, which returns a reactive state object containing the parameter values.

To create a link to a route with parameters, we can use the `params` option:

```js
<Link name="product-detail" params={{ id: 123 }}>Product 123</Link>
```

Within the route, we can also wrap the ID parameter in a `useMemo` to make it easier to use in different parts of the component. Let's try to use it in a slightly more real-world example:

```js

routing.on('/product/:id', 'product-detail', (router) => {
  let id = useMemo(() => router.params().id);
  let [product, setProduct] = useState(null);

  useEffect(async () => {
    // this effect will re-run when the user switches to a different product page
    // caused by the ID parameter change. 
    // the route function itself will not re-run since the route pattern is still the same.
    let _id = id();

    console.log('Product ID changed to', _id);

    let product = await fetch(`/api/product/${_id}`);

    setProduct(product);
  });

  return <div>
    Product page ID: {id()}!

    {product() && <div>
      Product name: {product().name}
    </div>}
  </div>;
});
```

You can further see how the routing system is used in a real application in the Seniman [`express-routing-session`](https://github.com/senimanjs/seniman/tree/main/examples/express-routing-session) example app.