import express from 'express';
import { wrapExpress, onCleanup, useWindow, useEffect, useState, useMemo } from 'seniman';
import { ErrorHandler } from './errors.js';
import produce from 'immer';

let app = express();
wrapExpress(app, { Head, Body });

app.listen(process.env.PORT || 3002);

function Head(props) {
  return <>
    <title>{props.window.pageTitle}</title>
    <style>{props.cssText}</style>
  </>;
}

function Body(props) {
  let [firstName, setFirstName] = useState("James");
  let [lastName, setLastName] = useState("Bond");

  let fullName = useMemo(() => {
    return `${firstName()} ${lastName()}`;
  });

  let window = useWindow();

  useEffect(() => {
    window.setPageTitle(`${fullName()} has ${todoList().length} tasks`);
  });

  let [todoList, setTodoList] = useState([
    { text: "Learn Seniman" },
    { text: "Build a Todo App" },
    { text: "???" },
  ]);

  let newTaskDraft = '';

  let onBlur = (value) => {
    newTaskDraft = value;
  }

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

  return <ErrorHandler syntaxErrors={props.syntaxErrors}>
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
  </ErrorHandler>;
}