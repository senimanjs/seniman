# Event Handling

Building a user interface means handling events. Let's start with a simple example. We will log a message to the server console when the user clicks a button.


Let's start with the `src/index.js` file from the Hello World tutorial:

```js
import { createRoot } from "seniman";
import { serve } from "seniman/server";

function App() {
  return <div>Hello World</div>;
}

let root = createRoot(App);
serve(root, 3002);
```

Let's now add a button to the App component:

```js
function App() {
  return <div>
    <button>Click Me</button>
    Hello World
  </div>;
}
```

Next, we'll add a click handler to the button. We will use the `onClick` attribute to do that:

```js
function App() {
  
  let onClick = () => {
    console.log('Button clicked');
  };

  return <div>
    <button onClick={onClick}>Click Me</button>
    Hello World
  </div>;
}
```

Compile and run the application:

```bash
npx babel src --out-dir dist

node dist/index.js
```

Open [http://localhost:3002](http://localhost:3002) in your browser. When you click the button, you should see the message in the server console.

You can also run the `babel` process in watch mode in another terminal window so that it automatically recompiles the code when you make changes:

```bash
npx babel src --out-dir dist --watch
```

And then use `nodemon` to automatically restart the server when the compiled code changes:

```bash
npx nodemon dist/index.js
```

This way, you can make changes to the code and see the changes in the browser without having to manually restart the server.

In the next tutorial, we'll start modifying the interface in response to events.