import { createRoot, useState, useMemo, preventDefault, createRef, createHandler, useClient, createContext, useContext, useEffect, createCollection, untrack } from "seniman";
import { createServer } from "seniman/workers";
import { Style, Title } from "seniman/head";

// import tailwind css from .txt extension so we can read it as a string @ cloudflare worker
import tailwindCssText from "./style.txt";
import initialData from "./data.json";

function TaskModal(props) {

  // hold additional data from database
  let [taskData, setTaskData] = useState({
    description: null,
    comments: []
  });

  // simulate a 10ms DB call to fetch the extra task data
  setTimeout(() => {
    setTaskData({
      description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
      comments: [
        { id: 1, text: "Looks good!" },
        { id: 2, text: "Needs more je ne sais quoi" }
      ]
    });
  }, 10);

  return <div class="fixed z-20 top-1/2 left-1/2 w-[600px] h-[400px] bg-gray-300 p-4 rounded transform -translate-x-1/2 -translate-y-1/2">
    <div class="font-bold text-lg mb-2.5">
      #{props.task.id}: {props.task.text}
    </div>
    <div>
      {taskData().description}
    </div>
    <div class="mt-2.5">
      <div class="font-bold text-md mb-2.5">Comments</div>
      {taskData().comments.map(comment => <div class="bg-white p-2.5 rounded mb-2.5 w-[300px]">
        {comment.text}
      </div>)}
    </div>
  </div>;
}

function List(props) {
  let listId = props.id;
  let client = useClient();
  let [onAddCardEnabled, setOnAddCardEnabled] = useState(false);

  let addTextareaRef = createRef();
  let taskDataHandler = useContext(TaskDataHandler);
  let globalClickUnsub;

  let onAddClick = createHandler(() => {
    setOnAddCardEnabled(true);

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
    if (text.length == 0) {
      return;
    }
    setOnAddCardEnabled(false);
    globalClickUnsub();

    taskDataHandler.addTask(listId, text);
  });

  let onDragEndHandler = createHandler(() => taskDataHandler.setDragEnd());

  let onDragStartHandler = createHandler((listId, taskId) => {
    taskDataHandler.setDragStart(listId, taskId);
  });

  return (
    <div class="bg-gray-600 rounded"
      onDragEnter={() => {
        if (props.taskCollection.items.length == 0) {
          taskDataHandler.setDraggedTaskToEndOfList(listId);
        }
      }}
    >
      <div class="text-lg text-white font-bold px-4 py-2.5">{props.name}</div>
      <div>
        {props.taskCollection.map(task => {
          let taskId = untrack(() => task().id);

          let isDraggedTask = useMemo(() => {
            return taskDataHandler.draggedTaskId() == taskId;
          });

          let [isInlineEditMode, setIsInlineEditMode] = useState(false);

          let onAddTypeEnter = createHandler((text) => {
            if (text.length == 0) {
              return;
            }
            taskDataHandler.editTaskText(listId, taskId, text);
            setIsInlineEditMode(false);
          });

          let onEditButtonClick = () => {
            setIsInlineEditMode(true);
            setTimeout(() => {
              client.exec($c(() => {
                let textarea = $s(editTextAreaRef).get()
                textarea.focus();
                // move the cursor to the end of the text
                var length = textarea.value.length;
                textarea.setSelectionRange(length, length);
              }));
            }, 0);
          }

          let editTextAreaRef = createRef();

          let [modalEnabled, setModalEnabled] = useState(false);

          return <div
            class="relative px-2.5 py-1.5"
            onDragEnter={() => {
              taskDataHandler.setTaskDragEnter(listId, taskId);
            }}
          >
            <div
              onClick={() => {
                taskDataHandler.setDragEnd();
                setModalEnabled(true);
              }}
              class="group text-sm p-2.5 border-2 rounded bg-white cursor-pointer hover:border-yellow-500"
              style={{
                opacity: isDraggedTask() ? "0.3" : "1.0"
              }}
              draggable="true"
              onDragStart={$c(() => {
                // I'm leaving this client debugging code here for posterity https://twitter.com/ryanflorence/status/1750005151719657683
                console.log("------ onDragStartHandler ------");
                $s(onDragStartHandler)($s(listId), $s(taskId));
              })}
              onDragEnd={$c(() => {
                // I'm leaving this client debugging code here for posterity https://twitter.com/ryanflorence/status/1750005151719657683
                console.log("onDragEndHandler");
                $s(onDragEndHandler)();
              })}
            >
              {task().text}
              <div onClick={preventDefault(onEditButtonClick)} class="opacity-0 bg-white group-hover:opacity-100 hover:bg-gray-300 p-1 rounded-sm cursor-pointer absolute top-4 right-5">
                <EditIcon />
              </div>
            </div>
            {isInlineEditMode() && <div>
              <div class="absolute z-20 top-1 left-2.5">
                <textarea
                  class="w-[230px] h-[70px] p-2.5 border-0 rounded text-sm font-sans"
                  ref={editTextAreaRef}
                  onClick={$c(e => {
                    e.preventDefault();
                  })}
                  onKeyDown={$c(e => {
                    // if enter is pressed, then run the onAddTypeEnter server handler
                    if (e.key === 'Enter') {
                      $s(onAddTypeEnter)(e.target.value);
                      e.preventDefault();
                    }
                  })}>{task().text}</textarea>
              </div>
              <div
                class="fixed top-0 left-0 z-10 w-full h-full bg-black opacity-50"
                onClick={() => {
                  taskDataHandler.setDragEnd();
                  setIsInlineEditMode(false);
                }}></div>
            </div>
            }
            {modalEnabled() && <div>
              <TaskModal task={task()} />
              <div
                class="fixed top-0 left-0 z-10 w-full h-full bg-black opacity-50"
                onClick={() => setModalEnabled(false)}></div>
            </div>
            }
          </div>
        })}
      </div>
      {onAddCardEnabled() && <div class="m-2.5">
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
          class="w-[230px] h-[70px] p-2.5 border-0 rounded text-sm font-sans"></textarea>
      </div>
      }
      <div onDragEnter={() => taskDataHandler.setDraggedTaskToEndOfList(listId)} onClick={$c(e => {
        e.preventDefault();
        $s(onAddClick)();
      })} class="text-white p-2.5 rounded cursor-pointer">
        + Add Task
      </div>
    </div>
  )
}

let TaskDataHandler = createContext();

function Board(props) {

  let [lists, setLists] = useState([
    { id: 1, name: "To Do" },
    { id: 2, name: "Doing" },
    { id: 3, name: "Done" }
  ]);

  let [draggedTaskId, setDraggedTaskId] = useState(0);

  // initialize the task collections (just 3 statically for now)
  let taskCollections = untrack(() => {
    return lists().map(list => {
      return createCollection([]);
    });
  })

  // emulate a 10ms DB call to fetch the initial tasks
  setTimeout(() => {
    taskCollections.forEach((taskCollection, index) => {
      let tasks = initialData.lists[index + 1].tasks;
      taskCollection.push(...tasks);
    });
  }, 10);

  let dragVars = { dropzoneIndex: 0, draggedTask: null, activeListId: 0, isDragging: false, lastDragEnterTaskId: 0 };
  let _incrementId = 17;

  let globalClickHandler = () => { };

  let taskDataHandlerContextValue = {
    draggedTaskId,
    listenGlobalClick: (cb) => {
      globalClickHandler = cb;

      return () => {
        globalClickHandler = () => { };
      }
    },

    addTask: (listId, text) => {
      let taskCollection = taskCollections[listId - 1];
      let id = _incrementId++;

      taskCollection.push({ id, text });
    },

    editTaskText: (listId, taskId, text) => {
      let taskCollection = taskCollections[listId - 1];
      let taskIndex = taskCollection.items.findIndex(task => task.id == taskId);

      taskCollection.set(taskIndex, task => {
        // set the new text
        return { ...task, text };
      });
    },

    setDragStart: (listId, taskId) => {

      if (dragVars.isDragging) {
        return;
      }

      setDraggedTaskId(taskId);

      let taskCollection = taskCollections[listId - 1];
      let taskIndex = taskCollection.items.findIndex(task => task.id == taskId);

      dragVars.isDragging = true;
      dragVars.activeListId = listId;
      dragVars.draggedTask = taskCollection.items[taskIndex];
      dragVars.dropzoneIndex = taskIndex;
    },

    setDraggedTaskToEndOfList: (listId) => {

      if (!dragVars.isDragging || dragVars.activeListId == listId) {
        return;
      }

      let taskCollection = taskCollections[listId - 1];
      let taskIndex = taskCollection.items.length;

      let oldTaskCollection = taskCollections[dragVars.activeListId - 1];
      oldTaskCollection.splice(dragVars.dropzoneIndex, 1);
      taskCollection.splice(taskIndex, 0, dragVars.draggedTask);

      dragVars.activeListId = listId;
      dragVars.dropzoneIndex = taskIndex;
    },

    setTaskDragEnter: (listId, taskId) => {

      if (!dragVars.isDragging || dragVars.lastDragEnterTaskId == taskId) {
        return;
      }

      let isJumpingList = dragVars.activeListId != listId;

      // start inserting the dropzone entry into the new list
      let taskCollection = taskCollections[listId - 1];
      let taskIndex = taskCollection.items.findIndex(task => task.id == taskId);

      if (isJumpingList) {
        let oldTaskCollection = taskCollections[dragVars.activeListId - 1];
        oldTaskCollection.splice(dragVars.dropzoneIndex, 1);
        taskCollection.splice(taskIndex, 0, dragVars.draggedTask);
      } else {
        let targetTask = taskCollection.items[taskIndex];
        taskCollection.splice(dragVars.dropzoneIndex, 1, targetTask);
        taskCollection.splice(taskIndex, 1, dragVars.draggedTask);
      }

      dragVars.lastDragEnterTaskId = taskId;
      dragVars.activeListId = listId;
      dragVars.dropzoneIndex = taskIndex;
    },

    setDragEnd: () => {
      if (!dragVars.isDragging) {
        return;
      }

      setDraggedTaskId(0);

      dragVars.draggedTask = null;
      dragVars.isDragging = false;
    }
  }

  let onDragEndHandler = createHandler(() => {
    taskDataHandlerContextValue.setDragEnd();
  });

  return (
    <div class="flex flex-col bg-gray-400 h-screen"
      onClick={() => globalClickHandler()}
      onDragOver={$c((e) => {
        e.preventDefault();
      })}
      onDrop={$c(() => {
        // I'm leaving this client debugging code here for posterity https://twitter.com/ryanflorence/status/1750005151719657683
        $s(onDragEndHandler)();
      })}
    >
      <Title text="Senimanello" />
      <Style text={tailwindCssText} />
      <div class="p-2.5 bg-gray-700 text-white text-lg font-bold">SENIMAN</div>
      <TaskDataHandler.Provider value={taskDataHandlerContextValue}>
        <div class="flex-grow overflow-auto flex items-start overflow-x-scroll p-3 h-screen">
          {lists().map(list => (
            <div class="w-[250px] mr-4 shrink-0">
              <List id={list.id} name={list.name} taskCollection={taskCollections[list.id - 1]} />
            </div>
          ))}
        </div>
      </TaskDataHandler.Provider>
    </div>
  );
}

function EditIcon() {
  return <svg width="1em" height="1em" viewBox="64 64 896 896" focusable="false" fill="currentColor" >
    <path d="M257.7 752c2 0 4-.2 6-.5L431.9 722c2-.4 3.9-1.3 5.3-2.8l423.9-423.9a9.96 9.96 0 000-14.1L694.9 114.9c-1.9-1.9-4.4-2.9-7.1-2.9s-5.2 1-7.1 2.9L256.8 538.8c-1.5 1.5-2.4 3.3-2.8 5.3l-29.5 168.2a33.5 33.5 0 009.4 29.8c6.6 6.4 14.9 9.9 23.8 9.9zm67.4-174.4L687.8 215l73.3 73.3-362.7 362.6-88.9 15.7 15.6-89zM880 836H144c-17.7 0-32 14.3-32 32v36c0 4.4 3.6 8 8 8h784c4.4 0 8-3.6 8-8v-36c0-17.7-14.3-32-32-32z"></path>
  </svg>
}

let root = createRoot(Board);

// run cloudflare worker on ES mode
export default createServer(root);
