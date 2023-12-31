# Components

With components, we can build more complex interfaces while keeping the code clean and easy to maintain. In this section, we will go through the basics of components in Seniman, and how to use them.

Let's start with the most basic example:

```js
function MyComponent() {
  return <div>Hello World!</div>;
}
```

This is a component that renders a `div` element with the text "Hello World!" inside it. To use this component, you can add it in the `Body` component:
 
```js
function Body() {
  return <MyComponent />;
}
```

## Passing Props

Component can accept props, which are values that are passed by the parent to the component. To pass props to a component, you can write them as attributes in the component tag, like so:

```js
function Body() {
  return <MyComponent name="John" />;
}
```

And within the component, you can access the props using the `props` object:

```js
function MyComponent(props) {
  return <div>Hello {props.name}!</div>;
}
```

## Passing state as props

You can also pass state as props. Let's start with a simple example:

```js
import { useState } from 'seniman';

function MyComponent(props) {
  return <div>Count is {props.count}!</div>;
}

function Body() {
  let [getCount, setCount] = useState(0);

  return <MyComponent count={getCount()} />;
}

```

When you run this, you'll see the following element:

```js
<div>Count is 0!</div>
```

To have the text change, we can start modifying the state -- this time with a little bit of fun with `setInterval`:

```js
import { onDispose, useState } from 'seniman';

function MyComponent(props) {
  return <div>Count is {props.count}!</div>;
}

function Body() {
  let [getCount, setCount] = useState(0);

  let interval = setInterval(() => {
    setCount(count => count + 1);
  }, 1000);

  // make sure to clear the interval when the user goes away
  onDispose(() => {
    clearInterval(interval);
  });

  return <MyComponent count={getCount()} />;
}
```

When you run this, you'll see count in the `div` go up every second. Make sure to clear the interval with `onDispose` so that the interval is cleared when the user goes away and the component tree is disposed on the server.

## Re-rendering on state changes

In Seniman, the state access is tracked at the execution context in which they're being used. Execution context in this case can be a component function, a `useEffect` or `useMemo` initialization call, or a JSX expression within an element.

```js
function MyComponent(props) {
  return <div>Count is {props.count}!</div>;
}
```
In `MyComponent`, `{props.count}` — representing the `getCount()` call up in the parent — is being used within the `div` element. This means that only the contents of the `div` element will re-render every time the state changes. The rest of `MyComponent` itself will not re-render.

Now, since the components does not re-render, how do we get the updated count values from the parent to flow into the `div`? 

The answer is that the expressions we pass as prop values to components are not evaluated immediately:

```js
<MyComponent count={getCount()} />
```

During this prop initialization, the `getCount()` expression is not actually executed -- it is only until later when it is finally accessed as the `props.count` within the `div` in `MyComponent` that the `getCount()` expression is executed, tracking the state access:

```js
function MyComponent(props) {
  return <div>Count is {props.count}!</div>;
}
```

---

The `getCount()` expression is wrapped within the `props` object by turning the value expressions into an object of getter functions during compilation. Here's how `MyComponent`'s props would roughly look like after compilation:

```js
props = {
  get count() {
    return getCount();
  }
}
```

When `props.count` is called in the child component, the getter function is called, which in turn calls `getCount()`.

## Passing state through multiple levels of components

Having lazily-evaluated prop values also means we can pass the state value through multiple levels of components -- and have state changes span multiple levels of components directly.

Let's add on an additional component level compared to the previous example:

```js
function Level2(props) {
  return <div>Count is {props.count}!</div>;
}

function Level1(props) {
  return <Level2 count={props.count} />;
}

function Body() {
  let [getCount, setCount] = useState(0);

  let interval = setInterval(() => {
    setCount(count => count + 1);
  }, 1000);

  onDispose(() => {
    clearInterval(interval);
  });

  return <Level1 count={getCount()} />;
}
```

This will work similarly -- `Level2`'s `div` will only re-render when the state in `Body` changes. `Level1` will not re-render at all since it only serves as the forwarder of the prop reference. This is one of the benefits of this state execution model -- you can "surgically" re-render only parts of the component that need to be re-rendered, wherever they are in the component tree.

## Calling state props at the top level

In some situations, you might want to have your component render two completely different outputs based on a state prop. For example, when the state value is 0, you'll want to show an "Unavailable" message, and when the state value is larger than 0, you'll want to show the count. 

Let's try to do that in the existing `MyComponent` example:

```js
function MyComponent(props) {

  if (props.count === 0) {
    return <span>Unavailable</span>;
  } 

  return <div>Count is {props.count}</div>;
}
```

Here, the component will re-render everytime `props.count`'s state changes, showing the correct output -- which is largely what we want.

The problem, however, is when you start setting up additional states within this component. For example, let's say you want to add a button that will add to the count -- using a `childCount` state:

```js
function MyComponent(props) {

  if (props.count === 0) {
    return <span>Unavailable</span>;
  } 

  let [getChildCount, setChildCount] = useState(0);

  return <div>
    <div>Total count is {props.count + getChildCount()}</div>
    <button onClick={() => setChildCount(count => count + 1)}>Add</button>
  </div>;
}
```

In this case, as `props.count` changes each second, the component will re-render -- re-setting the `childCount` state to 0 each time, which is not what we want. What we want instead is for the component to only re-render when `props.count` changes from 0 to 1 -- once, and never again as `props.count` increases above 1.

The key here is to make sure to only re-render when the primary condition -- in this case, whether `props.count` is 0 or larger than 0 -- changes. To do this, we can use the `useMemo` function to capture the primary condition:

```js

function MyComponent(props) {
  let isAvailable = useMemo(() => props.count > 0);
  ...
```

And wrap the rest of the component in a function -- which will re-execute only when the primary condition changes:

```js
function MyComponent(props) {
  let isAvailable = useMemo(() => props.count > 0);

  return () => {
    if (!isAvailable()) {
      return <span>Unavailable</span>;
    } 

    let [childCount, setChildCount] = useState(0);

    return <div>
      <div>Total count is {props.count + childCount()}</div>
      <button onClick={() => setChildCount(count => count + 1)}>Add</button>
    </div>;
  }
}
```

With the component written this way, the component will only re-render when `props.count` changes from 0 to 1 -- once, and not again as `props.count` increases above 1. `childCount` value will then be preserved as `props.count` continues to increase above 1.

## Loading data from the server

Loading data is a common use case for components. Here's the standard example of how you'd do it:

```js
function MyComponent(props) {
  let [user, setUser] = useState(null);
  let [isLoading, setLoading] = useState(true);

  useEffect(async () => {
    let userId = props.userId;

    setLoading(true);

    let user = await fetchUser(userId);

    setUser(user);
    setLoading(false);
  });

  return <div>
    {isLoading() ? 'Loading...' : user().name}
  </div>;
}
```

You can use an `async` `useEffect` function to load the data from the server, in combination with a `useState` to store the server data & loading state.

Please note that in an `async` `useEffect` function, you need to resolve all the state getters you depend on before the first `await` statement for them to be tracked correctly.

## Calling server API in response to user interaction

You can also load data from the server in response to user interaction. For example, you can add a button that will load the user data from the server when clicked:

```js
function MyComponent(props) {

  let [user, setUser] = useState(null);

  let onClick = async () => {
    let user = await fetchUserInfo(props.userId);
    setUser(user);
  };

  return <div>
    <button onClick={onClick}>Load User</button>
    <div>{user() && user().name}</div>
  </div>;
}
```

In this case, you can use an `async` function as the `onClick` handler, and call `setUser` to update the state with the user data when the API call is done.

##### Note: State accesses are not tracked in event handlers.

## Handling server errors

You can also use `try / catch` to handle API errors and show an error message in the UI:

```js
function MyComponent(props) {
  let [error, setError] = useState(null);
  let [user, setUser] = useState(null);

  let onClick = async () => {
    try {
      let user = await fetchUserInfo(props.userId);
      setUser(user);
    } catch (err) {
      setError(err);
    }
  };

  return <div>
    <button onClick={onClick}>Load User</button>
    <div>{user() && user().name}</div>
    {error() && <div>Error: {error().message}</div>}
  </div>;
}
```

## Passing children

`children` as props are supported in Seniman.

You can pass elements, text, or components as a children to a component, like so:

```js
function Body() {
  return <MyComponent>
    Hello World!
  </MyComponent>;
}
```

Within the component, you can then access the children using `props.children`:

```js
function MyComponent(props) {
  return <div class="my-component">
    {props.children}
  </div>;
}
```
