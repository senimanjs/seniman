import { createRoot, useState, useMemo, createChannel, createRef, createHandler, useClient, createContext, useContext, useEffect, createCollection, untrack, onDispose } from "seniman";
//import { serve } from "seniman/server";
import { createServer } from "seniman/workers";
import { Style, Link, Title } from "seniman/head";
import { produce } from "immer";

function List(props) {
  let listId = props.id;
  let client = useClient();
  let [onAddCardEnabled, setOnAddCardEnabled] = useState(false);

  let addTextareaRef = createRef();
  let taskDataHandler = useContext(TaskDataHandler);
  let globalClickUnsub;

  let onAddClick = createHandler(() => {
    setOnAddCardEnabled(true);

    // taskDataHandler.printItem(listId);

    globalClickUnsub = taskDataHandler.listenGlobalClick(() => {
      setOnAddCardEnabled(false);
      globalClickUnsub();
    });

    setTimeout(() => {
      client.exec($c(() => {
        $s(addTextareaRef).get().focus();
      }));
    }, 0);
  });

  let onAddTypeEnter = createHandler((text) => {
    setOnAddCardEnabled(false);
    globalClickUnsub();

    props.taskCollection.push({ id: 8, text });
  });

  return (
    <div
      onDragOver={$c((e) => {
        e.preventDefault();
      })}
      onDrop={() => taskDataHandler.setDragEnd()}
      style={{ background: "#bbb", borderRadius: "5px", width: "250px" }}>
      <div style={{ fontSize: "17px", fontWeight: "bold", padding: "10px 15px" }}>
        {"test"}
      </div>
      <div>
        {props.taskCollection.view(task => {
          let taskId = task.id;

          let onDragStart = createHandler((pixelHeight) => {
            taskDataHandler.setDragStart(listId, taskId, pixelHeight);
          });

          let isDraggedTask = useMemo(() => {
            return taskDataHandler.dragStatus().taskId == taskId;
          });

          return <div
            style={{ padding: "5px 10px" }}
            onDragEnter={() => {
              taskDataHandler.setTaskDragEnter(listId, taskId);
            }}
          >
            <div style={{
              fontSize: "15px",
              padding: "10px",
              borderWidth: "2px",
              borderRadius: "5px",
              background: "#fff",
              opacity: isDraggedTask() ? "0.3" : "1.0"
            }}
              draggable="true"
              onDragStart={$c((e) => {
                // measure the element height and then report it to the server
                let pixelHeight = e.target.offsetHeight;
                $s(onDragStart)(pixelHeight + "px");
              })}
              onDragEnd={() => {
                taskDataHandler.setDragEnd();
              }}
            >
              {task.text}
              <button onClick={() => console.log(task)}>+</button>
            </div>
          </div>
        })}
      </div>
      {onAddCardEnabled() && <div style={{ margin: "10px" }}>
        <textarea
          ref={addTextareaRef}
          onClick={$c(e => {
            e.preventDefault();
          })}
          onKeyDown={$c(e => {
            // if enter is pressed, then run the onAddTypeEnter server handler
            if (e.key === 'Enter') {
              $s(onAddTypeEnter)(e.target.value);
              e.preventDefault();
            }
          })}
          placeholder="Enter a title for this card..."
          style={{ width: "210px", height: "50px", padding: "10px", border: 'none', borderRadius: '5px', fontSize: '15px', resize: "none", fontFamily: 'arial' }}></textarea>
      </div>
      }
      <div onClick={$c(e => {
        e.preventDefault();
        $s(onAddClick)();
      })} style={{ color: "#fff", padding: "10px", borderRadius: "5px", cursor: "pointer" }}>
        + Add Task
      </div>
    </div>
  )
}

let TaskDataHandler = createContext();

function Board(props) {

  let [lists, setLists] = useState([
    { id: 1 },
    { id: 2 },
  ]);

  let [dragStatus, setDragStatus] = useState({
    height: "0px",
    taskId: 0
  });

  let DB = {
    lists: {
      1: {
        id: 1,
        name: "List 1",
        tasks: [{ id: 1, text: "Task 1" }, { id: 2, text: "Task 2" }, { id: 3, text: "Task 3" }, { id: 4, text: "Task 4" }, { id: 5, text: "Task 5" }, { id: 6, text: "Task 6" }, { id: 7, text: "Task 7" }]
      },
      2: {
        id: 2,
        name: "List 2",
        tasks: [{ id: 8, text: "Task 8" }, { id: 9, text: "Task 9" }, { id: 10, text: "Task 10" }, { id: 11, text: "Task 11" }, { id: 12, text: "Task 12" }, { id: 13, text: "Task 13" }, { id: 14, text: "Task 14" }]
      }
    }
  };

  let taskCollections = untrack(() => {
    return lists().map(list => {
      return createCollection(DB.lists[list.id].tasks);
    });
  })

  let dropzoneIndex = 0;
  let draggedTask = null;
  let activeListId = null;
  let isDragging = false;
  let lastDragEnterTaskId = null;

  let globalClickHandler = () => { };

  let taskDataHandlerContextValue = {
    dragStatus,
    listenGlobalClick: (cb) => {
      globalClickHandler = cb;

      return () => {
        globalClickHandler = () => { };
      }
    },

    printItem: (listId) => {
      console.log('PRINT ITEM listId', listId, taskCollections[listId - 1].items);
    },

    setDragStart: (listId, taskId, pixelHeight) => {

      if (isDragging) {
        return;
      }

      isDragging = true;

      activeListId = listId;

      setDragStatus(produce(dragStatus => {
        dragStatus.height = pixelHeight;
        dragStatus.taskId = taskId;
      }));

      // remove the task from the collection
      let tasks = DB.lists[listId].tasks;

      let taskIndex = tasks.findIndex(task => task.id == taskId);
      draggedTask = tasks[taskIndex];// tasks[taskIndex];

      dropzoneIndex = taskIndex;
    },

    setTaskDragEnter: (listId, taskId) => {

      if (!isDragging || lastDragEnterTaskId == taskId) {
        return;
      }

      lastDragEnterTaskId = taskId;

      let isJumpingList = activeListId != listId;

      // start inserting the dropzone entry into the new list
      let tasks = DB.lists[listId].tasks;

      let taskCollection = taskCollections[listId - 1];
      let taskIndex = tasks.findIndex(task => task.id == taskId);

      if (isJumpingList) {

        // remove the dropzone entry from the previous list
        DB.lists[activeListId].tasks.splice(dropzoneIndex, 1);

        let oldTaskCollection = taskCollections[activeListId - 1];
        oldTaskCollection.splice(dropzoneIndex, 1);

        taskCollection.splice(taskIndex, 0, draggedTask);
        tasks.splice(taskIndex, 0, draggedTask);
      } else {
        let targetTask = tasks[taskIndex];

        tasks.splice(dropzoneIndex, 1, targetTask);
        tasks.splice(taskIndex, 1, draggedTask);

        taskCollection.splice(dropzoneIndex, 1, targetTask);
        taskCollection.splice(taskIndex, 1, draggedTask);
      }

      activeListId = listId;
      dropzoneIndex = taskIndex;
    },

    setDragEnd: () => {

      if (!isDragging) {
        return;
      }

      setDragStatus(produce(dragStatus => {
        dragStatus.height = "0px";
        dragStatus.taskId = 0;
      }));

      draggedTask = null;
      isDragging = false;
    }
  }

  return (
    <div style={{ height: '100%' }} onClick={() => globalClickHandler()}>
      <Link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reset.css@2.0.2/reset.min.css" />
      <Link rel="stylesheet" href="https://unpkg.com/prismjs@0.0.1/themes/prism-tomorrow.css" />
      <Title text="Senimanello" />
      <Style text={`
        body {
          background:#444;
          font-family: arial;
          height: 800px;
        }

        textarea::-webkit-input-placeholder {
          color: #999;
        }

        textarea:focus {
          outline: none;
        }
      `} />
      <div style={{ padding: '10px', background: '#888', color: "#fff" }}>Seniman</div>
      <TaskDataHandler.Provider value={taskDataHandlerContextValue}>
        <div style={{ padding: '10px' }}>
          {lists().map(list => <div style={{ float: "left", marginRight: "15px" }}>
            <List id={list.id} taskCollection={taskCollections[list.id - 1]} />
          </div>
          )}
        </div>
      </TaskDataHandler.Provider>
    </div>
  );
}

let root = createRoot(Board);
//serve(root, 3016);

export default createServer(root);