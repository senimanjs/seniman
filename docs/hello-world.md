# Hello World

After [installation](/docs/install), let's start building a simple app. This is a minimal, working Seniman application:

```js
import { createRoot } from "seniman";
import { serve } from "seniman/server";

function App() {
  return <div>Hello World</div>;
}

let root = createRoot(App);
serve(root, 3002);
```

In the root of your project, copy the code above into a file at `src/index.js`. Then, run the following command:

```bash
npx babel src --out-dir dist
```

Your compiled application will be available at `dist/index.js`. You can run it using Node.js:

```bash
node dist/index.js
```

You will now be able to see the `Hello World` text by opening [http://localhost:3002](http://localhost:3002). Congratulations! You have just created your first Seniman application. 

Next, let's start handling some events at the [next tutorial](/docs/event-handling).