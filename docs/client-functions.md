# Client Functions

Using Seniman, being a server-driven UI framework, means your interfaces are generated on the server, derived from values that already exist on the server. It is inevitable, however, that you will need to implement some client-side functionality. At the very least, you will need to know when a user clicks a button -- or when a user types something into a text field, and what they typed, and respond to that event. Seniman provides a way to implement client-side functionality, and it is called client functions.

Client functions allows you to define functions which execute on the client-side, which can be used to implement event handlers, or any other kind of client-side logic. Let's go through the two different forms of using client functions: [event handlers](#event-handlers) and [`client.exec`](#clientexec).

### Event handlers

The most basic form of client functions are event handlers. Here is the most basic example of an event handler that logs a message to the browser console when the button is clicked:

```js
function MyComponent() {
  return (
    <button onClick={$c(() => console.log('Clicked!'))}>
      Click me!
    </button>
  );
}
```

As you can see, the function is wrapped in a `$c` call. This is a special function that tells the Seniman compiler that the wrapped function is a client function. The function you write inside the `$c` call will be executed on the client-side, in this case, when the button is clicked.

#### Using the `$s` function

Logging messages are great, but the real fun is notifying the server when the button is clicked. To do that, you can use the `$s` syntax:

```js

import { createHandler } from 'seniman';

function MyComponent() {

  let onClick = createHandler(() => {
    console.log('Server knows the click happened!');
  });

  return (
    <button onClick={$c(() => $s(onClick)())}>
      Click me!
    </button>
  );
}
```

As you can see, we can call a server-defined handler function (the `onClick`) right from the client by wrapping it in a `createHandler` -- marking the function as a client-callable server function -- and then wrapping it in a `$s` call within the `$c` function call.

The `$s` is also another special function that tells the Seniman compiler that the wrapped reference is a server-supplied variable. In this case, the `$s` function is wrapping a handler reference, which is the `onClick` function. When the `$s` function reference is called, the client runtime will send a message to the server, telling it to execute the referred server function.

In Seniman, a `$c` event handler that calls a single `$s` handler without an argument can be rewritten for simplicity by just passing the server function directly, like so:

```js
function MyComponent() {
  let onClick = () => {
    console.log('Server knows the click happened!');
  }

  return (
    <button onClick={onClick}>
      Click me!
    </button>
  );
}
```

Much simpler! You can even pass it as an inline function -- without the `$c` wrapper -- to the `onClick` prop, like so:

```js
function MyComponent() {
  return (
    <button onClick={() => console.log('Clicked!')}>
      Click me!
    </button>
  );
}
```

And we have a simple, server-executed event handler on our hands.

#### Passing arguments to the `$s` function

Next, let's start passing actual data to the server. Let's pick up a different example -- this time, an input:

```js

import { createHandler } from 'seniman';

function MyComponent() {
  ...

  let handleNameChange = createHandler((name) => {
    // do something with the name
  });

  return (
    ...
    <input onChange={$c(e => $s(handleNameChange)(e.target.value))} />
    ...
  );
}
```

In this example, the `onChange` event handler will call the `handleNameChange` function on the server, passing the value of the input as an argument.


#### Using `withValue` helper function

As with the `onClick` handler, we can also simplify the handler declaration. For `$c` functions that passes the event's target value like this one -- which you'll find frequently -- you can use the `withValue` helper function:

```js

import { withValue } from 'seniman';

function MyComponent() {
  ...

  let handleNameChange = (name) => {
    // do something with the name
  }

  return (
    ...
    <input onChange={withValue(handleNameChange)} />
    ...
  );
}
```

The `withValue` helper function takes a server function, and wraps it in a `$c` handler that calls the server function with the event's target value as an argument -- making the component code a bit more readable. It's a pretty small one, so here's the implementation of the `withValue` helper function:

```js
function withValue(fn) {

  // ... verify if fn is a server handler

  return $c(e => $s(fn)(e.target.value));
}
```

### client.exec

Another way to use client functions is by calling them directly from the server. 

To do this, we can use the `client` object's `exec` function. This function takes a function as an argument, and executes it on the client-side. Let's start from a simple example that logs a message to the browser console:

```js
import { useClient } from 'seniman';

function MyComponent() {
  let client = useClient();

  useEffect(() => {
    client.exec($c(() => console.log('Hello from the server!')));
  });

  return (
    <div>
      ...
    </div>
  );
}
```

A server handler is not the only type of server value that can be passed to the client function. You can also pass other types of server values such as strings, numbers, or boolean values. Let's try passing a string to the client function -- also by wrapping it in a `$s` call:

```js

function MyComponent() {
  let client = useClient();

  let onClick = () => {
    let serverString = 'Hello from the server!';

    client.exec($c(() => {
      console.log("This is a server string: " + $s(serverString));
    }));
  };

  return (
    <button onClick={onClick}>
      Click me!
    </button>
  );
}
```

When the user clicks the button, the server will tell the client to execute the client function, passing along the server string. The client function will then log the string to the browser console.