import express from 'express';
import { useState, withValue } from 'seniman';
import { Style } from 'seniman/head';
import { wrapExpress } from 'seniman/express';
import { Database } from 'sqlite-async';

let app = express();
let port = process.env.PORT || 3002;
wrapExpress(app, { Body });

app.listen(port);

console.log('Listening on port', port);

let db;

try {
  db = await Database.open(':memory:');

} catch (error) {
  throw Error('Could not open database')
}

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

const cssText = `
  body, * {
    padding: 0;
    margin: 0;
    font-family: sans-serif;
  }
  body { padding: 10px; background:#444; }
`;


function Body() {
  let [getTasks, setTasks] = useState([]);
  let [inputValue, setInputValue] = useState('');

  async function loadTasks() {
    const tasks = await db.all("SELECT id, text FROM tasks");

    setTasks(tasks);
  }

  loadTasks();

  let addTask = async (taskText) => {
    if (!taskText) {
      return;
    }

    await db.run("INSERT INTO tasks (text) VALUES (?)", taskText);

    setInputValue('');
    loadTasks();
  }

  let deleteTask = (taskId) => {
    db.run("DELETE FROM tasks WHERE id = ?", taskId);

    loadTasks();
  };

  return <div>
    <Style text={cssText} />
    <div>
      {getTasks().map(task => {
        return <div style={{ width: "300px", background: "#eee", padding: "5px" }}>
          {task.text}
          <button onClick={() => deleteTask(task.id)} style={{ float: "right" }}>Delete</button>
        </div>
      })}
    </div>
    <div>
      <input
        type="text"
        value={inputValue()}
        onChange={withValue(setInputValue)} />
      <button onClick={() => addTask(inputValue())}>+ Task</button>
    </div>
  </div>;
}