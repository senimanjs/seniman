# SENIMAN
[![npm version](https://badge.fury.io/js/seniman.svg)](https://badge.fury.io/js/seniman)
![downloads](https://img.shields.io/npm/dm/seniman)


![1500x500](https://github.com/senimanjs/seniman/assets/510503/8eee96ef-09bf-422d-9fd4-dd1633c841bb)


Seniman is a server-driven UI framework for Node.JS that allows you to run your JSX components on the server, enabling your UI to operate without sending your component & business logic code to the client.

Seniman synchronizes the latest UI server state with the browser using custom binary protocol over WebSocket and a thin ~3KB browser runtime, allowing fast-loading, low-latency user interfaces.

Here's an example of a simple counter app built with Seniman, using Redis as data storage, running on port 3002:

```js
import redis from "redis";
import { createRoot } from "seniman";
import { serve } from "seniman/server";

let redisClient = redis.createClient();

function App() {
  let onClick = () => redisClient.incr('count');

  return (
    <button onClick={onClick}>
      Add +
    </button>
  );
}

let root = createRoot(App);
serve(root, 3002);
```

Since the component runs on the server, you can directly access your database and other backend services from your component code. You can also modify the UI state directly based on the result of your database queries, like so:

```js
import { createRoot, useState } from "seniman";

...

function App() {
  let [latestCount, setLatestCount] = useState(0);

  let onClick = async () => {
    let count = await redisClient.incr('count');
    setLatestCount(count);
  }

  return (
    <button onClick={onClick}>
      Add to {latestCount()}
    </button>
  );
}
...
```

## Table of Contents
- [How it Works](#how-it-works)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Example Apps](#example-apps)
- [FAQ](#faq)

## How it Works

At a high-level, the Seniman runtime is divided into the server and client-side runtimes. Here's how the rough architecture looks like:

<img width="747" alt="Screenshot 2023-12-24 at 5 25 41 AM" src="https://github.com/senimanjs/seniman/assets/510503/73f977e0-e714-4775-a430-559c8420cfbd">


Seniman's server-side includes a custom runtime that manages the lifecycle of your JSX component tree, tracks state changes, and handles connections to multiple browser windows. It generates UI update commands to ensure the latest state is rendered in the browser, and also implements a remote event system to allow server-side code to react to client-triggered events.

To optimize network efficiency, Seniman's server communicates with clients using a custom binary protocol over WebSocket. A lightweight (~3kb) browser runtime interprets these commands into actual DOM operations. The result is a low-latency, quick-loading, remotely-driven user interface that feels local even on a standard 4G connection.

## Installation

To use Seniman, the packages you need to install are Seniman itself, and the Babel packages that will transform your Seniman JSX code. 

Run the following command to install Seniman:
```sh
npm install seniman
```

And the following for the Babel packages:

```sh
npm install --save-dev @babel/cli @babel/plugin-syntax-jsx
```

##### Note: Seniman supports Node.JS v16 or above.

## Basic Usage

First, initialize your project's `package.json` and make sure to enable ES modules with the following line in the file:

```json
"type": "module"
```

To start off simple, let's create a simple counter component. Create a new file called `src/index.js` with the following contents:

```js
import { createRoot, useState } from "seniman";
import { serve } from "seniman/server";

function App(props) {
  let [getCount, setCount] = useState(0);
  let onClick = () => setCount((count) => count + 1);

  return (
    <div>
      {props.name} counted: {getCount()}
      <button onClick={onClick}>Add +</button>
    </div>
  );
}

let root = createRoot(() => <App name={"Eka"} />);
serve(root, 3002);
```

To set up Seniman, you need to configure Babel to use Seniman's internal Babel plugin. You can do this by adding a `babel.config.json` file with the following contents:

```json
{
  "plugins": ["seniman/babel"]
}
```

Then, you can run the babel compiler-watcher by running `babel` through `npx`:

```sh
npx babel src --out-dir dist
```

This will compile the code in `src` to the `dist` directory. You can then run your code using Node.js:

```sh
node dist/index.js
```

Open up your browser and navigate to `http://localhost:3002`, and you should see a counter that increments when you click the button. 

## Example Apps

- Our documentation site at [seniman.dev](https://seniman.dev)
- Mini e-Commerce ([Source](examples/mini-ecommerce), [Demo](https://mini-ecommerce.examples.seniman.dev/))
- OpenAI GPT UI ([Source](examples/gpt-ui))
- Simple Autocomplete ([Source](examples/autocomplete), [Demo](https://seniman-autocomplete.garindra.workers.dev/))
- [Hello World](examples/hello-world) - Simplest possible Seniman app

For (many) more examples, check out the [examples](examples) directory.

## FAQ

### What happens when the user clicks a button? How does the server know what to update?

When the user clicks the button, the browser runtime will send a `click` event to the server. The server will then execute the `onClick` handler assigned to the element's live representation on the server, which will then update the UI state, depending on your logic. If there is any change to the UI state, the server will generate a set of DOM operations to update the UI and send it to the client. The client will then apply the DOM operations, updating the UI. 

This round trip might sound slow, but in most cases, 4G connections are now low-latency enough for the users to not notice the delay. In addition, Seniman is designed to be efficient in terms of network usage -- only the necessary DOM operations are sent to the client. You can feel the latency for yourself, live at our docs page: [seniman.dev](https://seniman.dev/), and decide if it is acceptable for your use case.

### This looks pretty stateful -- what happens when a client loses its connection to the server, or a server goes down?

Seniman is designed to be resilient to network failures. When a client loses its connection to the server, the client will automatically execute connection retries -- and upon reconnection to the existing window session, the server will re-stream the command buffers that are not yet acknowledged by the client, getting the client up to speed with the latest state.

When a server goes down, the client will similarly automatically reconnect to a different server in the cluster -- albeit restarting the session and losing any state that is not persisted to a database. If there is any important UI state you cannot afford to lose to a server crash -- say, a long, multi-page form -- you can persist the draft state to a database and re-load it when the client reconnects to a different window.

### What happens to the components running on the server when the user loses its connection to the server? 

By default, there is a grace period (of one minute) when Seniman will keep your component tree in memory while the browser tab's WebSocket connection is disconnected for unreliable network reasons.

When the user connects back within the grace period, there will be re-pairing of the new WebSocket connection to the existing tree, and any UI updates queued during the disconnection will be sent to the browser and executed.

When the user connects back after the grace period, a new component tree will be created for the user, and the existing tab will be reloaded to render the new component tree from a fresh state. There will be APIs in the future for you to choose the specific upon-late-reconnection behavior other than reloading to create a smoother experience for your users.

### This looks pretty stateful -- do I get to deploy this normally? How do I scale it up?

Seniman can be deployed like any other Node.JS application. You can use a process manager like PM2 to manage your Seniman processes, and a reverse proxy like Nginx to horizontally-scale your Seniman app instances.

In order for your users to have better experience during network reconnection, however, it is helpful to set up client-IP sticky sessions in your reverse proxy. This will help ensure that a client that has disconnected will reconnect to the same server instance when it comes back online, allowing the client to resume its session without losing any state, leading to a smoother user experience.

### Is my actual component code downloaded to the client?

No, only the resulting DOM operations are sent to the client -- your component code is never downloaded to the client. This  means you can safely implement sensitive logic (like loading data from a database) or use sensitive data (like secret tokens) within the component code.  

### I have some logic I need running on the client. How do I do that?

While most UI patterns are entirely implementable server-side with Seniman, Seniman also supports running custom logic on the client. Things that naturally need to run on the client like Google Single Sign-On, or custom analytics can be implemented using the `$c` and `$s` syntax -- explained in [this](https://seniman.dev/docs/client-functions) docs page.

### Any example of this framework running somewhere? I want to see how a remotely-driven UI feels like.

Yes -- the documentation site for Seniman is built using Seniman itself! You can access the (currently in-development) site at [seniman.dev](https://seniman.dev/).


### TypeScript support?
Some early users are using TypeScript to build with Seniman -- official support coming soon!

### How about SEO support?
There is a separate HTML renderer that can be activated specifically when a request is coming from a search engine crawler. This will allow you to implement SEO support for your Seniman app. We're already using this for our docs site at senimanjs.org -- documentation will also be coming soon!

### Is this production ready?
Not yet, but APIs are starting to stabilize and are already in active use in internal projects of some of our users.
