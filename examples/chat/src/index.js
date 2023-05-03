import express from 'express';
import { Style } from 'seniman/head';
import { useState, onCleanup, createCollection, createHandler, useClient, wrapPromise } from 'seniman';
import { wrapExpress } from 'seniman/express';
import { chatService } from './chat-service.js';

let app = express();
wrapExpress(app, { Body });

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
  //let window = useWindow();
  let client = useClient();
  let [startOffset, setStartOffset] = useState(0);
  let [getUsername, setUsername] = useState('User2');

  let messageIdCollection = createCollection([]);

  // load last 10 messages
  chatService
    .loadLastNMessageIds(10)
    .then((ids) => {
      setStartOffset(ids[0]);
      messageIdCollection.push(...ids);
    });

  // listen to incoming new message ids
  const unsubNewMessageId = chatService.listenNewMessageId((id) => {
    messageIdCollection.push(id);
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
        messageIdCollection.unshift(...ids);
      });
  }

  let onDeleteClick = async (item) => {
    await wrapPromise(chatService.deleteMessage(item));

    let index = messageIdCollection.indexOf(item);
    messageIdCollection.remove(index, 1);
  }

  let onSubmit = createHandler(async (value) => {
    await chatService.submitMessage(getUsername(), value);

    // scroll to bottom
    client.exec(scrollToBottomClientFn);
  });

  let scrollToBottomClientFn = $c(() => {
    setTimeout(() => {
      let streamEl = document.getElementById('stream');
      streamEl.scrollTop = streamEl.scrollHeight;
    }, 70);
  });

  client.exec(scrollToBottomClientFn);

  return <div style={{ width: "300px" }}>
    <div id="stream" style={{ height: "300px", overflow: "scroll", border: "1px solid #ccc", padding: '10px' }}>
      {startOffset() > 0 ?
        <button onClick={onLoadEarlierClick}>Load earlier</button> :
        null
      }
      <div>
        {messageIdCollection.view(id => <Message id={id} onDeleteClick={onDeleteClick} />)}
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
    <Style text={cssText} />
    <div style={{ marginBottom: "10px", fontWeight: "bold" }}>SenimanChat</div>
    <ChatStream />
  </div>;
}