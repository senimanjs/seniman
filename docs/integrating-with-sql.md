# Integrating with SQL Database

(Almost) no apps are complete without a database. Seniman enables teams to simplify their application stack by allowing direct access to backend databases from component code, directly tying interaction between user events and database operations.

In this tutorial, we will go through the source code of a simple todo list application built with Seniman that stores data in an in-memory SQLite database. The starting code for this tutorial is available [here](https://github.com/senimanjs/seniman/tree/main/examples/sqlite-simple). 

You can easily download the app's code by running `npx clone-seniman-app` and choosing `sqlite-simple` from the list of examples. This will create a new local folder with the app code downloaded into it.

Inside the newly created project, let's install the dependencies:

```bash
npm i
```

Then, run the following command to compile the app using Babel in watch mode:

```bash
npx babel src --out-dir dist --watch
```

And then the following command to start the development server in a different terminal:

```bash
npx nodemon dist/index.js
```

You will see the todo application running at [http://localhost:3002](http://localhost:3002). The page will automatically reload if you make edits to the source code. 

Let's now go through the code of the application parts-by-parts.

```js
...
import { Database } from 'sqlite-async';

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

Now, we'll go through the `Root` component -- the only component in our application -- part-by-part:

```js
import { useState, ... } from 'seniman';

function Root(props) {
  let [getTasks, setTasks] = useState([]);

  ...
```

To maintain our tasks data, we use the `useState` function to get us two functions: `getTasks` and `setTasks`, which are used to get and set the value of the tasks state variable during the lifecycle of this component. 

This function is a close cousin of the `useState` function in React, but with one major difference: in Seniman, the component is only called once -- which is why we're giving you an accessor function (`getTasks`) to get the current value of the state variable, instead of returning the value directly. We also give you a setter function (`setTasks`) to set the value of the state variable. 

Now, let's start populating the tasks state with data from the database inside the component:

```js
...
async function loadTasks() {
  const tasks = await db.all("SELECT id, text FROM tasks");

  setTasks(tasks);
}

loadTasks();
...
```

Here, we define a function called `loadTasks` that loads the tasks from the database and sets the state variable `tasks` to the result. We call this function immediately after we define it to start off task-loading when the component is first rendered.

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

In the delete button, you can see that we're passing an anonymous function to the `onClick` handler, passing the task's `id` as the argument to `deleteTask`. This anonymous function will be called when the user clicks the button on the browser.

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

In the `value` attribute, we use the `inputValue` state getter function to set the `input` element's value to the current value of the `inputValue` state variable. While it is not particularly useful while the user is typing, it is useful when the user clicks the "Add" button, because the `inputValue` state variable will be reset to an empty string -- which in turn will empty the input element.

In the `onChange` handler, we use the `withValue` helper function and the `setInputValue` state setter to set the `inputValue` state variable to the value of the `target.value` property of the event object.

Let's now take a look at the "Add" button:

```js
  <button onClick={() => addTask(inputValue())}>Add Task</button>
```

When the user clicks the Add button, the anonymous function passed to the `onClick` handler will be called, passing the `inputValue()` state value as the argument to the `addTask` function.

Here's the `addTask` function:

```js

let addTask = async (taskText) => {
  if (!taskText) {
    return;
  }

  await db.run("INSERT INTO tasks (text) VALUES (?)", taskText);

  setInputValue('');
  loadTasks();
}

```

Here, we check if the passed task text is empty, and if it's not, we insert the task into the database.

We'll then reset the `inputValue` state variable to an empty string -- emptying the input element -- and then reload the tasks from the database. Your tasks now reflect the changes you've made.

Now, let's close the tutorial by going through to the final server creation lines:

```js
let root = createRoot(Root);
serve(root, 3002);
```

Here, we wrap our `Root` component using the `createRoot` function, which we then pass to the `serve` function to start the server. The `serve` function also takes a port number as its second argument, which is the port number that the server will listen to. When you open the browser, you should see the todo list application running at [http://localhost:3002](http://localhost:3002). 

We've now reached the end of the tutorial. With just one UI component, we've built a todo list application that stores data in an in-memory SQLite database --  tightly integrating user interaction, UI state, and database operations all within the component code, greatly simplifying the application stack.

