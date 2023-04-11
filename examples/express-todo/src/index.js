import express from 'express';

import { Style, Title } from 'seniman/head';
import { onCleanup, useWindow, createHandler, useState, useMemo } from 'seniman';
import { wrapExpress } from 'seniman/express';
import produce from 'immer';

const app = express();
wrapExpress(app, { Body });

const port = process.env.PORT || 3002;
app.listen(port);

console.log('Listening on port', port);

const cssText = `
body,
* {
  padding: 0;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
}

body {
  padding: 10px;
  height: 100vh;
  background: #444;
  color: #fff;
}

.todo-item {
  padding: 5px;
  border: 1px solid #ccc;
  width: 300px;
  margin-bottom: 10px;
}`;

function Head() {
  let window = useWindow();

  return <>
    <title>{window.pageTitle}</title>
    <style>{cssText}</style>
  </>;
}

function Body() {
  let [firstName, setFirstName] = useState("James");
  let [lastName, setLastName] = useState("Bond");

  let fullName = useMemo(() => {
    return `${firstName()} ${lastName()}`;
  });

  let window = useWindow();

  let [todoList, setTodoList] = useState([
    { text: "Learn Seniman" },
    { text: "Build a Todo App" },
    { text: "???" },
  ]);

  let newTaskDraft = '';

  let onBlur = createHandler((value) => {
    newTaskDraft = value;
  });

  let addTask = (taskText) => {
    if (!taskText) {
      return;
    }

    setTodoList(todoList => [...todoList, { text: taskText }]);
  }

  let deleteTask = (task) => {
    setTodoList(produce(todoList => {
      let index = todoList.findIndex(t => t.text === task.text);
      todoList.splice(index, 1);
    }));
  };

  let onBlurClientHandler = $c(e => {
    $s(onBlur)(e.target.value);
    e.target.value = '';
  });

  let [realtimeCount, setRealtimeCount] = useState(0);

  let interval = setInterval(() => {
    setRealtimeCount(realtimeCount => realtimeCount + 1);
  }, 1000);

  onCleanup(() => {
    clearInterval(interval);
  });

  return <div>
    <Style text={cssText} />
    <Title text={`${fullName()} has ${todoList().length} tasks`} />
    <div style={{ padding: "20px" }}>
      <div style={{ fontSize: "24px", marginBottom: "10px" }}>{fullName}'s Todo List</div>
      <div style={{ paddingTop: "10px", marginTop: "10px", borderTop: "1px solid #ccc" }}>
        {todoList().map(task => {
          return <div class="todo-item">
            {task.text}
            <button onClick={() => deleteTask(task)} style={{ float: "right" }}>Delete</button>
          </div>;
        })}
      </div>
      <div>
        <input type="text" onBlur={onBlurClientHandler} />
        <button onClick={() => addTask(newTaskDraft)}>+ Task</button>
      </div>
      <div style={{ fontSize: "10px" }}>Elapsed Window Time: {realtimeCount}</div>
    </div>
  </div>;
}