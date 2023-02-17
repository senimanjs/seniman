import express from 'express';
import { useState } from 'seniman';
import { wrapExpress } from 'seniman/express';
import { Database } from 'sqlite-async';

let app = express();

wrapExpress(app, { Head, Body });

app.listen(process.env.PORT || 3002);

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

function Head() {
  return <>
    <style>{cssText}</style>
  </>;
}

function Body() {
  let [getTasks, setTasks] = useState([]);

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

    loadTasks();
  }

  let deleteTask = (taskId) => {
    db.run("DELETE FROM tasks WHERE id = ?", taskId);

    loadTasks();
  };


  let newTaskDraft = '';

  let onBlur = (value) => {
    newTaskDraft = value;
  }

  let onBlurClientHandler = $c(e => {
    $s(onBlur)(e.target.value);

    e.target.value = '';
  });

  return <div>
    {getTasks().map(task => {
      return <div style={{ width: "300px", background: "#eee", padding: "5px" }}>
        {task.text}
        <button onClick={() => deleteTask(task.id)} style={{ float: "right" }}>Delete</button>
      </div>
    })}
    <div>
      <input type="text" onBlur={onBlurClientHandler} />
      <button onClick={() => addTask(newTaskDraft)}>+ Task</button>
    </div>
  </div>;
}