# Building a Counter

In this tutorial, we will create a simple counter application using Seniman. The completed code for this tutorial is available in the [`counter`](https://github.com/senimanjs/seniman/tree/main/examples/counter) example.

You can download the app's code by running `npx clone-seniman-app` and choosing `counter` from the list of examples. This will create a new local folder with the app code downloaded into it.

Inside the newly created project, let's install the dependencies:

```bash
npm install
```

Then, run the following command to compile the app using Babel:

```bash
npx babel src --out-dir dist
```

And then the following command to start the development server:

```bash
npx nodemon dist/index.js
```

You will see the application running at [http://localhost:3002](http://localhost:3002). The page will automatically reload if you make edits to the source code.


Let's start by understanding the existing code, then start building our counter functionalities from there. Let's take a  look at the only file of the app -- `src/index.js`:

```js
import { createRoot } from "seniman";
import { serve } from "seniman/node";

function App() {
  return <div>Hello World</div>;
}

let root = createRoot(App);
serve(root, 3002);
```

Let's go through these line-by-line. 

```js
import { createRoot } from "seniman";
```

As a start, we use one core functions from the `seniman` package: `createRoot`.

`createRoot` is used to wrap your application by giving it our top-level component. It will then give us back a `Root` object that Seniman's underlying networking stack can use to manage the two-way communication between the browser and the application.


```js
import { serve } from "seniman/node";
```

`serve` creates a Node HTTP server, attaches Seniman's WebSocket handler, and starts listening. Applications that need custom routes or middleware can use `createEntrypoint` from the same module instead.

Now, let's take a look at the main component of our application:

```js
function App() {
  return <div>Hello World</div>;
}
```

This is the main and only component of our application. It is a simple component that returns a `div` (in JSX syntax) with the text "Hello World". If you open up the browser, you should see this text on the page.

Let's now go on to the final two lines of the file:

```js
let root = createRoot(App);
serve(root, 3002);
```

As mentioned, `createRoot` wraps the application in a Root object. `serve(root, 3002)` connects it to Node and opens the port.

This should be all that's required to start serving a Seniman application. Now, let's start building our counter.

Let's start by creating a new component called `Counter`:

```js
function Counter(props) {
  return <div></div>;
}
```

and refer it from the `App` component:

```js
function App() {
  return <Counter />;
}
```

Next, import `useState` alongside `createRoot` at the top of the file:

```js
import { createRoot, useState } from 'seniman';
```

Then create a state to represent the counter value:

```js
function Counter(props) {
  let [getCount, setCount] = useState(0);
  
  return <div></div>;
}
```

We use the `useState` function to create a state. As mentioned, you might already be familiar with `useState` in other frameworks, such as React.

`useState` takes an initial value as its argument, and returns an array containing two functions: the first function is used to get the current value of the state, and the second function is used to set the value of the state. We will use the `getCount` function to get the current value of the counter, and we will use the `setCount` function to set the value of the counter.

Let's now create a button to increment the counter:

```js
function Counter(props) {
  let [getCount, setCount] = useState(0);

  return <div>
    <button onClick={() => setCount(getCount() + 1)}>
      Increment
    </button>
  </div>;
}
```

Looks good. But now, all we've created is a button that changes a value that doesn't get displayed anywhere. Let's fix that by displaying the current value of the counter:

```js
function Counter(props) {
  let [getCount, setCount] = useState(0);

  return <div>
    <button onClick={() => setCount(getCount() + 1)}>
      Increment
    </button>
    <div>Counter: {getCount()}</div>
  </div>;
}
```

If you look at the page now, we have a working counter!

Let's make it a little more interesting by adding a button to decrement the counter:

```js

function Counter(props) {
  let [getCount, setCount] = useState(0);

  return <div>
    <button onClick={() => setCount(getCount() + 1)}>
      Increment
    </button>
    <button onClick={() => setCount(getCount() - 1)}>
      Decrement
    </button>
    <div>Counter: {getCount()}</div>
  </div>;
}
```

We can now count in both directions. But there's a problem -- if you click the decrement button when the counter is 0, the counter will go into negative numbers. Let's fix that by adding a check to make sure the counter doesn't go below 0:

```js
function Counter(props) {
  let [getCount, setCount] = useState(0);

  return <div>
    <button onClick={() => setCount(getCount() + 1)}>
      Increment
    </button>
    <button onClick={() => setCount(Math.max(0, getCount() - 1))}>
      Decrement
    </button>
    <div>Counter: {getCount()}</div>
  </div>;
}
```

And that's it, you've built your first counter application in Seniman. 

You do not need to set up a separate browser application for this counter. Seniman maintains the component tree on the server, while its browser runtime receives the required DOM commands through a compact binary protocol over WebSocket. Browser-specific behavior can still be added explicitly with client functions when an application needs it.
