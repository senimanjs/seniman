# State Management
State management in Seniman is built on a few core functions:

- [`useState`](#usestate)
- [`useEffect`](#useeffect)
- [`useMemo`](#usememo)
- [`useContext`](#usecontext)

Below, we'll go over each of these functions and how they can be used to manage state in your application.

## useState

`useState` is a function that allows you to create a reactive value in your application. You can initialize `useState` with an initial value, and with the getter and the setter functions it returns, you can have your interface automatically update when the value changes.

Here's how you'd initialize them in a component:

```js

import { useState } from 'seniman';

function MyComponent() {
  const [getCounter, setCounter] = useState(0);

  ...
}
```

To get the current value of the state, you can call the getter function within your elements:

```js
return (
  <div>
    <p>Current value of the state: {getCounter()}</p>
  </div>
);
```

When the value of the state changes, Seniman will make sure that the only the text node responsible for displaying the value of the state on the client-side will be updated. Other non-participating parts of the element tree will not be touched or in any way re-calculated. The component that houses the `useState` call will also not be re-executed.

You can also run the getter within an effect:
  
```js
useEffect(() => {
  console.log(getCounter());
});
```

When the value of the state changes, the effect will be re-run.

Next, let's start changing the value of the state. To set the value of the state, you can call the setter function -- for example:

```js
return (
  <div>
    <button onClick={() => setCounter(1)}>Set to 1</button>
  </div>
);
```

In this case, when the button is clicked, the state will be set to the new value of `1`. Effects and memoized values that depend on the state will promptly be re-evaluated.

You can also pass a function to the setter function, which will be called with the current value of the state as its argument. For example:

```js
return (
  <div>
    <button onClick={() => setCounter(count => count + 1)}>Increment</button>
  </div>
);
```

This method of calling the setter function is useful when you want to update the state based on its current value. In this case, the state will be incremented by `1` every time the button is clicked.

## useEffect

`useEffect` provides you with a way to run a function in response to changes in the state of your application. It takes a single function to run as an argument. During the execution of the `useEffect` function, Seniman will track any calls to `state` or `memo` variables, and will re-run the effect when any of those values change.

Example:

```js
import { useState, useEffect } from 'seniman';

function ComponentA() {
  const [firstName, setFirstName] = useState('John');

  useEffect(() => {
    console.log(firstName());
  });

  return ...
}
```

One primary real-world use case of `useEffect` is also to load data from an API or a database. In that case, we can use an `async` function inside the `useEffect`, for example:

```js

import { useState, useEffect } from 'seniman';

function ComponentA() {
  let [data, setData] = useState(null);
  let [page, setPage] = useState(1);

  useEffect(async () => {
    let _page = page();
    const response = await fetch('https://example.com/data?page=' + _page);
    const data = await response.json();
    setData(data);
  });

  return ...
}
```

One caveat to async `useEffect` is that any state getter calls after the first `await` keyword will not be properly tracked -- so it is good practice to resolve all the state values upfront in the function before starting the async calls.

## useMemo

`useMemo` is a function that allows you to create a memoized value, usually based on the values of other state variables or even other memoized values. It takes a function as an argument, and will only re-run the function when the values of dependencies change.

Example:

```js
import { useState, useEffect } from 'seniman';

function ComponentA() {

  const [firstName, setFirstName] = useState('John');
  const [lastName, setLastName] = useState('Doe');

  const fullName = useMemo(() => {
    return firstName() + ' ' + lastName();
  });

  ...
}
```

And to use it:

```js
return (
  <div>
    <p>Full name: {fullName()}</p>
  </div>
);
```

The `fullName` memo will only be re-computed when the value of either `firstName` or `lastName` changes.

## useContext

One way to share state between components, especially when they do not have a direct parent-child relationship, is to use the `useContext` function. Context allows you to share values easily deep within the component tree without having to pass props down manually at every level.

To use it, the first step is to create a context object:

```js

import { createContext, useContext } from 'seniman';

const MyContext = createContext();

function App() {
  ...
}
```

Then, in the highest level component of the tree in which you want to share the context, you can initialize a `MyContext.Provider` component:

```js
import { createContext, useContext } from 'seniman';

const MyContext = createContext();

function App() {
  return (
    <MyContext.Provider value={value}>
      <ChildComponent />
    </MyContext.Provider>
  );
}
```

Later on, deep down within the tree, you can use the `useContext` function to access the value of the context:

```js
function GrandChild() {
  const value = useContext(MyContext);

  return (
    <div>
      <p>Value of the context: {value}</p>
    </div>
  );
}
```