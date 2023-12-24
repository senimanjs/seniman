# Managing State

In order to make our app's UI change over time in response to user inputs, we need to use our state utility functions. In Seniman, state is managed using the `useState` function. Let's start with a simple example — we will create a counter that increments when the user clicks a button.

Let's start with the `src/index.js` file from the Event Handling tutorial:

```js
import { createRoot } from 'seniman';
import { serve } from "seniman/server";

function App() {
  return <div>
    <button onClick={() => console.log('Button clicked')}>
      Click Me
    </button>
  </div>;
}

let root = createRoot(App);
serve(root, 3002);
```

Let's now add a state variable to the `App` component, after importing the `useState` function:

```js
import { createRoot, useState } from 'seniman';
import { serve } from 'seniman/server';

function App() {
  let [getCount, setCount] = useState(0);
  return <div>
    <button onClick={() => console.log('Clicked')}>
      Click Me
    </button>
  </div>;
}
```

A state variable gives you a way to store and retrieve a reactive value. More specifically, it gives you a way for the UI to automatically update when you change a value, given that you use the `setCount` function to change the value, and the `getCount` function where you need the value to be shown and updated. The initial value of `0` that we passed to `useState` is the default value of the state variable.

Now, let's start using `getCount()` to show the value of the counter in the UI:

```js

function App() {
  let [getCount, setCount] = useState(0);
  return <div>
    <button onClick={() => console.log('Clicked')}>
      Click Me: {getCount()}
    </button>
  </div>;
}
```

If you compile and run the app, you will see that the counter is not changing when we click the button. This is because we haven't yet changed the counter on the click handler. Let's modify the click handler to do that:

```js

function App() {
  let [getCount, setCount] = useState(0);
  return <div>
    <button onClick={() => setCount(getCount() + 1)}>
      Click Me
    </button>
    {getCount()}
  </div>;
}
```

Passing `getCount() + 1` to `setCount` will change the value of the counter. The UI will automatically update to reflect the new value. Let's now compile and run the application:

```bash
npx babel src --out-dir dist

node dist/index.js
```

Open [http://localhost:3002](http://localhost:3002) in your browser to see your counter in action. 

This is the basics of state management in Seniman. To see its full capability, check out the [State Management](/docs/state-management) tutorial. Next, we'll see how to change pages and react to URL changes in the [next tutorial](/docs/changing-pages).