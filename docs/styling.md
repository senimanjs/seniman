# Styling

Seniman provides the standard HTML & CSS experience to style your elements. Here, we'll cover the basics of styling in Seniman using inline styles and CSS classes.

## Inline styles

Inline styles are styles that are applied to an element using the `style` attribute. You can use the object syntax to set the styles:

```js
<div style={{ backgroundColor: 'red' }}>Hello World</div>
```

Note that we're using camelCase for the style names. This will be converted to the standard CSS property names when the HTML is rendered; for example, `backgroundColor` will be converted to `background-color`.

You can also use the standard casing, provided that you use quotes:

```js
<div style={{ 'background-color': 'red' }}>Hello World</div>
```

You can also use dynamic values for the individual style properties:

```js
function Counter(props) {
  let [getCount, setCount] = useState(0);
  
  return <div style={{ color: getCount() > 0 ? 'green' : 'red', background: 'white' }}>
    {getCount}
  </div>;
}
```

You can also generate the complete style object externally, and pass it to the `style` attribute:

```js

function generateStyle(count) {
  return {
    background: 'white',
    color: count > 0 ? 'green' : 'red'
  };
}

function Counter(props) {
  let [getCount, setCount] = useState(0);
  
  return <div style={generateStyle(getCount())}>
    {getCount}
  </div>;
}
```

## CSS classes

You can also use CSS classes to style your elements. You can use the `class` attribute to set the CSS class name:

```js

function Counter(props) {
  let [getCount, setCount] = useState(0);
  
  return <div class="counter">
    {getCount}
  </div>;
}
```

You can then define the CSS class in the `<Head>` component:

```js
function Head(props) {
  return <>
    <style>
      {`
        .counter {
          background: white;
          color: red;
        }
      `}
    </style>
  </>;
}

wrapExpress(app, { Head, Body });
```

You can also use dynamic values for the CSS class names:

```js
function Counter(props) {
  let [getCount, setCount] = useState(0);
  
  return <div class={`counter ${getCount() > 0 ? 'active' : 'inactive'}`}>
    {getCount}
  </div>;
}
```

These are the standard ways to style your elements in Seniman. Since these are standard HTML & CSS techniques, you can also use other CSS styling libraries you prefer, such as Tailwind. We'll be covering Tailwind in the article [Styling with Tailwind](/docs/styling-with-tailwind).