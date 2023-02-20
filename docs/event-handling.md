# Event Handling

Building a user interface means handling events. Let's start with a simple example. We will log a message to the server console when the user clicks a button.


Let's start with the `src/index.js` file from the Hello World tutorial:

```js
import { createServer } from 'seniman/server';

function Body(props) {
  return <div>Hello World</div>;
}

let server = createServer({ Body });
server.listen(3002);
```

Let's now add a button to the Body component:

```js
function Body(props) {
  return <div>
    <button>Click Me</button>
    Hello World
  </div>;
}
```

Next, we'll add a click handler to the button. We will use the `onClick` attribute to do that:

```js
function Body(props) {
  return <div>
    <button onClick={() => console.log('Button clicked')}>Click Me</button>
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

In the next tutorial, we'll start modifying the interface in response to events.