import { serve } from 'seniman/server';
import { createRoot, useState, useClient, createHandler, createCollection } from 'seniman';
import { Link, Style } from 'seniman/head';
import { throttle } from 'throttle-debounce';
import { API_requestCompletionStream } from './api.js';
import { Tokenizer } from './token.js';
import { createContainer } from './containers.js';

const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set');
}

async function fetchMessageHistory() {
  // TODO: actually fetch message history
  return [];
}

function Message(props) {
  let { role, tokenizer } = props;
  let [isWaiting, setIsWaiting] = useState(true);

  let rootContainer = createContainer('root');
  let activeContainer = rootContainer;
  let containerParentStack = [];

  // What we do here is basically handle incoming (properly buffer-tokenized) tokens
  // and route it to "containers" that handle different types of content, such as 
  // code blocks, paragraphs, etc. with their own internal state and rendering logic.
  tokenizer.onResultTokens(tokens => {
    setIsWaiting(false);

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] == '[DONE]') {
        break;
      }

      let result = activeContainer.pushToken(tokens[i]);

      // the active container can return a non-null result to indicate that it wants to
      // exit or enter a new container (establishing new levels of nesting)
      if (result) {
        if (result.type == 'enter') {
          let newContainer = result.container;
          containerParentStack.push(activeContainer);
          activeContainer = newContainer;
        } else if (result.type == 'exit') {
          activeContainer = containerParentStack.pop();
        }
      }
    }
  });

  return <div style={{ fontSize: '13px', color: '#fff', background: role == "assistant" ? "#555" : "#444", lineHeight: '1.5' }}>
    <div style={{ padding: "0 15px", margin: "0 auto", maxWidth: "600px", color: "#ddd" }}>
      {isWaiting() ? <div style={{ padding: "15px 0" }}>...</div> : <rootContainer.componentFn />}
    </div>
  </div>;
}

function* iterateCodePoints(str) {
  for (let i = 0; i < str.length; ++i) {
    const charCode = str.codePointAt(i);
    if (charCode === undefined) {
      break;
    }
    yield String.fromCodePoint(charCode);
    if (charCode > 0xFFFF) {
      i++; // Skip the trailing surrogate pair.
    }
  }
}

function createTokenizerFromText(text) {
  let tokenizer = new Tokenizer();

  for (const character of iterateCodePoints(text)) {
    tokenizer.feedInputToken(character);
  }

  tokenizer.feedInputToken('[DONE]');
  return tokenizer;
}

function ConversationThread(props) {
  let [isThreadEmpty, set_isThreadEmpty] = useState(true);
  let [isBotTyping, set_isBotTyping] = useState(false);
  let messageCollection = createCollection([]);
  let conversationMessagesContext = [];
  let client = useClient();

  let onSubmit = createHandler(async (userText) => {
    scrollToBottom();
    set_isThreadEmpty(false);
    set_isBotTyping(true);

    conversationMessagesContext.push({
      role: 'user',
      content: userText
    })

    let assistantMessageContext = {
      role: 'assistant',
      content: ''
    };

    let tokenizer = new Tokenizer();

    API_requestCompletionStream(API_KEY, conversationMessagesContext, (rawToken) => {
      tokenizer.feedInputToken(rawToken);

      scrollToBottom();

      if (rawToken != '[DONE]') {
        assistantMessageContext.content += rawToken;
      } else {
        onFinished();
      }
    });

    conversationMessagesContext.push(assistantMessageContext);

    // add the user message to the stream
    messageCollection.push({
      role: 'user',
      tokenizer: createTokenizerFromText(userText)
    });

    // add the bot message to the stream
    messageCollection.push({
      role: 'assistant',
      tokenizer: tokenizer
    });
  });

  let onFinished = () => {
    set_isBotTyping(false);

    // TODO: do this in a post-render hook of the setState above (so we don't need the setTimeout)
    client.exec($c(() => {
      setTimeout(() => {
        document.getElementById("textbox").focus();
      }, 10);
    }));
  }

  // create a debounced function that scrolls the window to the bottom
  let scrollToBottom = throttle(300, () => {
    client.exec($c(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth",
      });
    }));
  });

  return <>
    <div style={{ background: "#555" }}>
      <div style={{ margin: "0 auto", width: "100%", maxWidth: "600px", padding: '10px' }}>
        <div style={{ color: "#aaa", fontSize: "12px", fontWeight: "600" }}>SenimanGPT</div>
      </div>
    </div>
    {isThreadEmpty() ? <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: -1 }}>
      <div style={{ fontSize: "30px", color: '#777' }}>
        SenimanGPT
      </div>
    </div> : null}
    <div style={{ paddingBottom: "120px" }}>
      {messageCollection.map(message => <Message role={message.role} tokenizer={message.tokenizer} />)}
    </div>
    <div style={{ width: "100%", maxWidth: "600px", margin: '0 auto', position: 'fixed', bottom: '0px', left: '50%', transform: 'translateX(-50%)' }}>
      <div style={{
        padding: '10px',
      }}>
        <textarea id="textbox" disabled={isBotTyping()} placeholder={isBotTyping() ? "Bot is writing..." : "Write a message to the bot.."} onKeyDown={$c(e => {
          // get value from textarea with whitespace trimmed
          let value = e.target.value.trim();

          // submit on enter (make sure Shift isn't pressed)
          if (e.key === 'Enter' && !e.shiftKey && value) {
            $s(onSubmit)(value);
            e.target.value = '';
            e.preventDefault();
          }
        })}
          style={{ opacity: isBotTyping() ? '0.3' : '1.0', borderRadius: '5px', padding: '10px', height: 'auto', background: '#666', border: 'none', width: '100%', color: '#fff', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '13px', resize: 'none' }}
        ></textarea>
        <div style={{ fontSize: '10px', color: '#666', paddingTop: '5px' }}>Press Enter to Submit</div>
      </div>
    </div>
  </>;
}

function App() {
  return <div>
    <Link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reset.css@2.0.2/reset.min.css" />
    <Link rel="stylesheet" href="https://unpkg.com/prismjs@0.0.1/themes/prism-tomorrow.css" />
    <Link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300..700&display=swap" />
    <Style text={`
        body {
          background:#444;
          font-family: Inter;
        }

        textarea::-webkit-input-placeholder {
          color: #999;
        }

        textarea:focus {
          outline: none;
        }
      `} />
    <ConversationThread />
  </div>
}

let root = createRoot(App);
serve(root, 3020);