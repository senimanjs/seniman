# Integrating with SQL Database

No apps are complete without a database. Seniman enables full-stack teams — many building software that rely on databases — to move faster by simplifying their application stack.

Unlike the traditional two-tier setup where your client and server code are separated by an API over the internet, Seniman allows your client interface code to run completely on the server. This allows your client interface code to run closer to the database, interacting with it faster, without the need of a public API layer. Under the hood, Seniman keeps track of the latest state of your interface on the server and reflects that to the browser through an efficient, low-level binary protocol over WebSocket.

In this tutorial, we will go through the source code of a simple todo list application built with Seniman that stores data in a SQLite database. 

Let's initialize the project template for the todo list application:

```bash
npx new-seniman-app@latest
```

Choose `express-sqlite` for the project template and `sqlite-app` for the project name when prompted. This will create a new directory called `sqlite-app` inside the current folder. Let's move to that directory:

```bash
cd sqlite-app
```

Inside the newly created project, let's install the dependencies:

```bash
npm i
```

Then, run the following command to start the development server:

```bash
npm run dev
```

You will see the todo application running at [http://localhost:3002](http://localhost:3002). The page will automatically reload if you make edits to the source code.

All the source code for the todo list application is located in a single file -- `src/index.js`. We'll go through it in sections, but you can skip to the end of this tutorial to see the full source code.

Let's start by looking at the imports:

```js
import express from 'express';
import { wrapExpress } from 'seniman/express';
import { useState } from 'seniman';
import { Database } from 'sqlite-async';
```

We rely on three different libraries in this project: `express` for the base server, `sqlite-async` to access the SQLite database, and `seniman`. 

From the `seniman` package, we import `wrapExpress`, which is a function that wraps an existing Express application and enables Seniman to run on top of the Express instance. 

We also import `useState`, which is a core state management function in Seniman. You might have seen the function with the same name in other major frameworks like React. The naming isn't coincidental, since their behavior is conceptually similar, with some differences we'll cover in a moment. 


Let's move on to the next lines:

```js
let app = express();

wrapExpress(app, { Head, Body });

app.listen(process.env.PORT || 3002);
```

Here, we create an Express application instance, wrap it with `wrapExpress`, and then start the server. `Head` and `Body` are the two main components that make up your application. We will go through them in a moment.

```js
let db;

try {
  db = await Database.open(':memory:');
} catch (error) {
  throw Error('Could not open database')
}
```

This is where we open the database. We use the `sqlite-async` library to open the database. We use an in-memory database for this tutorial to make things simpler, but you can use a file database as well. 

```js
try {
  await db.run(`CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT
  )`);
} catch (error) {
  throw Error('Could not create table')
}

try {
  const insertString = `INSERT INTO tasks (text) VALUES (?)`;
  await db.run(insertString, "My first task");
  await db.run(insertString, "My second task");
} catch (error) {
  throw Error('Could not insert new task');
}
```

Here, we create a table called `tasks` and insert two tasks into it to start with. 

Let's now go through the `Head` and `Body` components:

```js
const cssText = `
  body, * {
    padding: 0;
    margin: 0;
    font-family: sans-serif;
  }
  body { padding: 10px; background:#444; }
`;

function Head() {
  return <>
    <style>{cssText}</style>
  </>;
}
```

The `Head` component's pretty standard; tags that you usually put in the `<head>` element of the HTML document, you can put here. You can see there's a single `style` already there to set minimum styling for the application.

```js
function Body(props) {
  return <TodoList />;
}
```

The `Body` component is where you put the main content of your application. You can see we have a `TodoList` component inside it. 

Now, we'll go through the `TodoList` component part-by-part:

```js
function TodoList(props) {
  let [getTasks, setTasks] = useState([]);

  ...
```

To maintain our tasks data, we use the `useState` function to get us two functions: `getTasks` and `setTasks`, which are used to get and set the value of the tasks state variable during the lifecycle of this component. 

This function is a close cousin of the `useState` function in React, but with one major difference: in Seniman, the component is only called once -- which is why we're giving you an accessor function (`getTasks`) to get the current value of the state variable, instead of returning the value directly. In React, value updates are achieved through re-running the component function, after which the returned value of `useState` changes. In Seniman, value updates are achieved by re-executing only the specific contexts in which `getTasks()` is called, which can be places like an element's inner content or attributes, among many others.

We will cover the state reactivity system deeper in a later post (add link). Now, let's start populating the tasks state with data from the database:

```js
...
async function loadTasks() {
  const tasks = await db.all("SELECT id, text FROM tasks");

  setTasks(tasks);
}

loadTasks();
...
```

Here, we define a function called `loadTasks` that loads the tasks from the database and sets the state variable `tasks` to the result. We call this function immediately after we define it to start off task-loading.

```js
  ...
  return <div>
    {getTasks().map(task => {
      return <div style={...}>
        {task.text}
        ...
      </div>
    })}
    ...
  </div>;
}
```

Here, we render the list of tasks. We use the `getTasks` function to get the current value of the `tasks` state variable, then mapping over the tasks and render them. 


Now, let's take a look at the delete functionality within each task:

```js
{getTasks().map(task => {
  return <div style={...}>
    {task.text}
    <button onClick={() => deleteTask(task.id)} style={...}>Delete</button>
  </div>
})}
```

In the delete button, you can see that we're passing an anonymous function to the `onClick` handler, passing the task's `id` as the argument to `deleteTask`. Now, you might be wondering: the user will interact with the button in the client, but the anonymous function is defined on the server. How will this work?

The answer is that when you pass an anonymous function as an event handler, Seniman will automatically assign an ID to the function instance, and then send the ID to the client. When the event (`onClick`) is triggered in the corresponding element in the browser, Seniman's client runtime will re-send the ID back to the server, triggering Seniman to execute the original anonymous function. This is the basic working principle behind Seniman's remote event handling mechanism.

Next, let's take a look at the implementation `deleteTask` we're calling from the handler:

```js
let deleteTask = (taskId) => {
  db.run("DELETE FROM tasks WHERE id = ?", taskId);

  loadTasks();
};

```

We tell the database to delete the task with the given `id`, and then we reload the tasks from the database. The list will be re-rendered accordingly.


Next, let's take a look at the add task functionality:

```js
return <div>
  {getTasks().map(task => {
    ...
  })}
  ...
  <div>
    <input
      type="text"
      value={inputValue()}
      onChange={withValue(setInputValue)} />
    ...
  </div>
</div>;
```

Here, we have an input element that allows the user to type in the text of the new task. We use the `value` attribute to set the value of the input, and the `onChange` handler to set the value of the input. 

In the `value` attribute, we use the `inputValue` state getter function to set the `input` element's value to the current value of the `inputValue` state variable. While it is not particularly useful while the user is typing, it is useful when the user clicks the "Add" button, because the `inputValue` state variable will be reset to an empty string, and the `input` element's value will be reset to an empty string as well.

In the `onChange` handler, we use the `withValue` helper function (and the `setInputValue` state setter to set the `inputValue` state variable to the value of the `target.value` property of the event object.

Let's now take a look at the "Add" button:

```js
<div>
  <input type="text" onBlur={onBlurClientHandler} />
  <button onClick={() => addTask(newTaskDraft)}>+ Add Task</button>
</div>
```

The "Add" button is pretty straightforward. When the user clicks the button, the anonymous function passed to the `onClick` handler will be called, passing the value of the `newTaskDraft` variable as the argument to the `addTask` function.

Here's the `addTask` function:

```js

let addTask = async (taskText) => {
  if (!taskText) {
    return;
  }

  await db.run("INSERT INTO tasks (text) VALUES (?)", taskText);

  loadTasks();
}

```

Here, we check if the task text is empty, and if it's not, we insert the task into the database, and then reload the tasks from the database. Your tasks now reflect the changes you've made.

Congratulations! We've just built a simple Todo List application using Seniman! Hope you enjoyed this tutorial. If you have any questions, feel free to ask in the (add discord server).
