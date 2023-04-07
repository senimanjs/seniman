# Head Element

The `<head>` element in HTML contains important metadata about the page. In Seniman, you can use import various built-in components from the `seniman/head` package to add elements to the `<head>` section of your application:

- `<Title>`: Sets the title of the page
- `<Meta>`: Sets the meta tags of the page
- `<Link>`: Sets the link tags of the page
- `<Style>`: Sets the style tags of the page
- `<Script>`: Sets the script tags of the page

You can mount these components anywhere in your component tree, giving you the flexibility to set the `<head>` elements based on already-existing state of your application. They will take care to inject the elements to the `<head>` section of your application.

## Title

The `<Title>` component sets the title of the page.

```js
import Title from 'seniman/head';

function Body(props) {
  return <div>
    <Title text="My Page Title" />
    ...
  </div>;
}
```

A common use case is to set the title of the page based on the current state of your application -- say, the current product name. You can assign the `text` property of the `<Title>` component just like any other component:

```js

import Title from 'seniman/head';

function Body(props) {
  let [getProduct, setProduct] = useState(null);

  useEffect(() => {
    // ... fetch the product
  }, []);

  return <div>
    <Title text={getProduct() ? getProduct().name : 'Loading...'} />
    ...
  </div>;
}
```

The runtime will take care to update the title of the page whenever the state changes.

## Meta

The `<Meta>` component sets the meta tags of the page.

```js
import Meta from 'seniman/head';

function Body(props) {
  return <div>
    <Meta name="description" content="My page description" />
    ...
  </div>;
}
```

## Link

The `<Link>` component sets the link tags of the page.

```js

import Link from 'seniman/head';

function Body(props) {
  return <div>
    <Link rel="stylesheet" href="https://example.com/style.css" />
    ...
  </div>;
}
```

## Style

The `<Style>` component sets the style tags of the page.

```js

import Style from 'seniman/head';

function Body(props) {
  return <div>
    <Style text={`
      .counter {
        background: white;
        color: red;
      }
    `} />
    ...
  </div>;
}
```

The `Style` component will take care to inject your CSS text to the `<style>` tag in the `<head>` section of your application.

## Script

The `<Script>` component sets the script tags of the page. 

```js

import Script from 'seniman/head';

function Body(props) {
  return <div>
    <Script src="https://example.com/script.js" />
    ...
  </div>;
}
```

You can also pass a function to the `onLoad` attribute, which will be called when the script is loaded on the client-side:

```js

import Script from 'seniman/head';

function Body(props) {

  let onScriptLoad = () => {
    console.log('Server knows the script loaded!');
  };

  return <div>
    <Script src="https://example.com/script.js" onLoad={onScriptLoad} />
    ...
  </div>;
}
```
