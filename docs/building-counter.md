# Building a Counter

In this tutorial, we will create a simple counter application using Seniman. The starting code for this tutorial is available [here](https://github.com/senimanjs/seniman/tree/main/examples/hello-world). 

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
import { serve } from "seniman/server";

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
import { serve } from "seniman/server";
```

The `serve` function is used to initialize and start a server that will serve our Seniman application. A server for a Seniman app has two main required functions: serving the main HTML page which contains the client runtime on the browser, and a WebSocket server serving as communication channel between the client runtime and the server. 

Seniman has a few built-in server implementations that you can use, but in this tutorial, we will use one from the `seniman/server` package, which is a thin layer above Node's `http` server with a small WebSocket handler.

There are other built-in networking options you can use such as `seniman/express` and `seniman/workers` for CloudFlare Workers, but let's go with the simplest `seniman/server` for this tutorial.

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

As mentioned, the `createRoot` function is used to wrap the application in a `Root` object for the underlying networking stack to interact with. The `serve` function is used to start the networking stack, specifically a HTTP server with a WebSocket connection handler. The `serve` function also takes a port number as its second argument, which is the port number that the server will listen to.

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

Next, let's create a state to represent the counter value:

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

You might be wondering if there is another front-end aspect to this that we need to set up. The answer is no. Seniman, and your application code, runs entirely on the server. The full component tree will be executed and maintained by the server, and Seniman will take care to send only the minimum amount of DOM manipulation commands to the browser through an efficient binary protocol running on WebSocket.