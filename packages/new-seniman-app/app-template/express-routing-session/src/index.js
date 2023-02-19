import express from 'express';
import { useState, useEffect } from 'seniman';
import { createRouting, Link, RouterRoot } from "seniman/router";
import { wrapExpress } from 'seniman/express';
import { db } from './db.js';
import { SessionProvider, useSession } from './session.js';

let app = express();

wrapExpress(app, { Head, Body });

app.listen(process.env.PORT || 3002);


const cssText = `
  body, * {
    padding: 0;
    margin: 0;
    font-family: sans-serif;
  }
`;

function Head() {
  return <>
    <style>{cssText}</style>
  </>;
}

// Replace this with your own authentication logic
async function authenticate(email, password) {

  if (email == 'admin@admin.com' && password == 'admin') {
    return {
      email,
      name: 'Admin'
    }
  } else {
    return null;
  }
}

function Body() {
  return <SessionProvider>
    {() => {
      let session = useSession();

      if (session.loggedIn()) {
        return <RouterRoot routing={routing} />;
      } else {
        return <LoginPage />;
      }
    }}
  </SessionProvider>;
}

function LoginPage() {

  let email, password;
  let session = useSession();

  let setEmail = (value) => {
    email = value;
  }

  let setPassword = (value) => {
    password = value;
  }

  let onLoginClick = async () => {
    let loginData = await authenticate(email, password);

    if (loginData) {
      session.login(loginData);
    }
  }

  return <div style={{ padding: "10px" }}>
    <div>Example App Login</div>
    <div style={{ marginTop: "10px" }}>
      <input type="text" placeholder="Email" onBlur={$c(e => $s(setEmail)(e.target.value))} />
      <input type="password" placeholder="Password" onBlur={$c(e => $s(setPassword)(e.target.value))} />
      <button onClick={onLoginClick}>Login</button>
    </div>
  </div>
}

function Header(props) {

  let session = useSession();

  let onLogoutClick = () => {
    session.logout();
  }

  return <div style={{ padding: "10px", position: "relative", background: "#444" }}>
    <div>Example App</div>
    <div style={{ position: "absolute", top: "10px", right: "10px" }}>
      <button onClick={onLogoutClick}>Logout</button>
    </div>
  </div>;
}

let routing = createRouting();

routing.on('/', 'home', () => {
  return <div>
    <Header />
    <div style={{ padding: "10px" }}>
      <Link to="/todo">Todo</Link>
    </div>
  </div>;
});

routing.on('/todo', 'todo', () => {
  let [getTasks, setTasks] = useState([]);

  useEffect(() => {
    loadTasks();
  });

  async function loadTasks() {
    const tasks = await db.all("SELECT id, text FROM tasks");

    setTasks(tasks);
  }

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
    <Header />
    <div style={{ padding: "10px" }}>
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
    </div>
  </div>;
});
