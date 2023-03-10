import express from 'express';
import { useState, onCleanup, useStream, useCallback, useWindow, wrapPromise } from 'seniman';
import { wrapExpress } from 'seniman/express';
import { chatService } from './chat-service.js';

let app = express();
wrapExpress(app, { Head, Body });

let port = process.env.PORT || 3014;
app.listen(port);

console.log('Listening on port', port);

const cssText = `
body,
* {
  padding: 0;
  margin: 0;
  font-family: sans-serif;
}

body {
  padding: 10px;
}
`;

function Head() {
  return <>
    <style>{cssText}</style>
  </>;
}

function Message(props) {
  let id = props.id;
  let [message, setMessage] = useState({});

  chatService.getMessage(id).then((message) => {
    setMessage(message);
  });

  return <div
    style={{ position: 'relative', padding: "5px", marginTop: "10px", border: "1px solid #ccc", background: "#eee", borderRadius: '5px', maxWidth: '250px' }}>
    <div style={{ fontSize: "11px", fontWeight: "bold", marginBottom: '5px  ' }}>{message().user}</div>
    <div style={{ fontSize: "14px" }}>{message().text}</div>
    <div style={{ cursor: 'pointer', position: 'absolute', right: '5px', top: '4px' }}>
      <div onClick={() => props.onDeleteClick(props.id)}>×</div>
    </div>
  </div>
}

function ChatStream() {
  let window = useWindow();
  let [startOffset, setStartOffset] = useState(0);
  let [getUsername, setUsername] = useState('User2');

  let messageIdStream = useStream([]);

  // load last 10 messages
  chatService
    .loadLastNMessageIds(10)
    .then((ids) => {
      setStartOffset(ids[0]);
      messageIdStream.push(...ids);
    });

  // listen to incoming new message ids
  const unsubNewMessageId = chatService.listenNewMessageId((id) => {
    messageIdStream.push(id);
  });

  // make sure to unsubscribe when client disconnects
  onCleanup(() => {
    unsubNewMessageId();
  });

  let onLoadEarlierClick = () => {
    let _startOffset = startOffset();
    let _updatedStartOffset = Math.max(0, _startOffset - 10);

    chatService
      .loadMessageIdsFromOffset(_updatedStartOffset, _startOffset)
      .then((ids) => {
        setStartOffset(_updatedStartOffset);
        messageIdStream.unshift(...ids);
      });
  }

  let onDeleteClick = async (item) => {
    await wrapPromise(chatService.deleteMessage(item));

    let index = messageIdStream.indexOf(item);
    messageIdStream.remove(index, 1);
  }

  let onSubmit = useCallback(async (value) => {
    await chatService.submitMessage(getUsername(), value);

    // scroll to bottom
    window.clientExec(scrollToBottomClientFn);
  });

  let scrollToBottomClientFn = $c(() => {
    setTimeout(() => {
      let streamEl = document.getElementById('stream');
      streamEl.scrollTop = streamEl.scrollHeight;
    }, 70);
  });

  window.clientExec(scrollToBottomClientFn);

  return <div style={{ width: "300px" }}>
    <div id="stream" style={{ height: "300px", overflow: "scroll", border: "1px solid #ccc", padding: '10px' }}>
      {startOffset() > 0 ?
        <button onClick={onLoadEarlierClick}>Load earlier</button> :
        null
      }
      <div>
        {messageIdStream.view(id => <Message id={id} onDeleteClick={onDeleteClick} />)}
      </div>
    </div>
    <div style={{ padding: '10px', background: '#f7f7f7', }}>
      <textarea style={{ width: '90%', padding: '5px' }} onKeyDown={$c(e => {
        // get value from textarea with whitespace trimmed
        let value = e.target.value.trim();

        // submit on enter
        if (e.key === 'Enter' && value !== '') {
          $s(onSubmit)(value);
          e.target.value = '';
          e.preventDefault();
        }
      })}></textarea>
      <div style={{ fontSize: "9px", color: "#888" }}>
        {getUsername()} &bull; Press Enter to submit
      </div>
    </div>
  </div>;
}

function Body() {
  return <div>
    <div style={{ marginBottom: "10px", fontWeight: "bold" }}>SenimanChat</div>
    <ChatStream />
  </div>;
}