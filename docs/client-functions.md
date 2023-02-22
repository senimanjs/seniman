# Client Functions

Using Seniman, being a server-driven UI framework, means your interfaces are generated on the server, derived from values that already exist on the server. It is inevitable, however, that you will need to implement some client-side functionality. At the very least, you will need to know when a user clicks a button -- or when a user types something into a text field, and what they typed, and respond to that event. Seniman provides a way to implement client-side functionality, and it is called client functions.

Client functions allows you to define functions which execute on the client-side, which can be used to implement event handlers, or any other kind of client-side logic. Let's go through the different forms of client functions and how they can be used.

### Event handlers

The most basic form of client functions are event handlers. Here is the most basic example of an event handler that logs a message to the browser console when the button is clicked:

```js
function MyComponent() {
  return (
    <button onClick={$c(() => console.log('Clicked!'))}>Click me!</button>
  );
}
```

As you can see, the function is wrapped in a `$c` call. This is a special function that tells the Seniman compiler that the wrapped function is a client function. The function you write inside the `$c` call will be executed on the client-side, in this case, when the button is clicked.

#### Using the `$s` function

Logging messages are great, but the real fun is notifying the server when the button is clicked. To do that, you can use the `$s` syntax:

```js
function MyComponent() {
  let onClick = () => {
    console.log('Server knows the click happened!');
  }

  return (
    <button onClick={$c(() => $s(onClick)())}>Click me!</button>
  );
}
```

As you can see, we can call a server-defined function (the `onClick`) right from the event handler by wrapping it in a `$s` call. The `$s` is also another special function that tells the Seniman compiler that the wrapped function is a server function. The function identifier inside the `$s` call is the reference to the server function that you want to call. When the `$s` function reference is called, it will send a message to the server, telling it to execute the referred server function.

In Seniman, a `$c` handler that calls a single `$s` function without an argument can be rewritten for simplicity by just passing the server function directly, like so:

```js
function MyComponent() {
  let onClick = () => {
    console.log('Server knows the click happened!');
  }

  return (
    <button onClick={onClick}>Click me!</button>
  );
}
```

Much simpler! You can even pass it as an inline function -- without the `$c` wrapper -- to the `onClick` prop, like so:

```js
function MyComponent() {
  return (
    <button onClick={() => console.log('Clicked!')}>Click me!</button>
  );
}
```

And we have a simple, server-executed event handler on our hands.

#### Passing arguments to the `$s` function

Next, let's start passing actual data to the server. Let's pick up a different example -- this time, an input:

```js
function MyComponent() {
  ...

  let handleNameChange = (name) => {
    // do something with the name
  }

  return (
    ...
    <input onChange={$c(e => $s(handleNameChange)(e.target.value))} />
    ...
  );
}
```

In this example, the `onChange` event handler will call the `handleNameChange` function on the server, passing the value of the input as an argument.

### clientExec

Another way to use client functions is by calling them directly from the server. 

To do this, we can use the `window` object's `clientExec` function. This function takes a function as an argument, and executes it on the client-side. Let's start from a simple example that logs a message to the browser console:

```js
import { clientExec } from 'seniman';

function MyComponent() {
  let window = useWindow();

  useEffect(() => {
    window.clientExec($c(() => console.log('Hello from the server!')));
  });

  return (
    <button onClick={onClick}>Click me!</button>
  );
}
```

You can also pass arguments to the client function:

```js

function MyComponent() {
  let window = useWindow();

  useEffect(() => {
    window.clientExec($c((name) => console.log(`Hello ${name} from the server!`), ['John']));
  });

  return (
    <button onClick={onClick}>Click me!</button>
  );
}
```

