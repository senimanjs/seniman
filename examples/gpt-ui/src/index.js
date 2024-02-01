import { serve } from 'seniman/server';
import { createRoot, useState, useClient, createHandler, createCollection, onDispose } from 'seniman';
import { Link, Style } from 'seniman/head';
import { throttle } from 'throttle-debounce';
import { API_requestCompletionStream } from './api.js';
import { Tokenizer } from './token.js';
import { Message } from './message.js';
import mistralTokenizer from 'mistral-tokenizer-js';

const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set');
}

function createTokenizerFromText(text) {

  let tokenizer = new Tokenizer();
  let llmTokens = mistralTokenizer.encode(text);
  let tokenLength = llmTokens.length;

  for (let i = 1; i < tokenLength; i++) {
    let tokenText = mistralTokenizer.decode([llmTokens[i]], false, false);

    tokenizer.feedInputToken(tokenText);
  }

  tokenizer.feedInputToken(null);

  return tokenizer;
}

class Conversation {
  constructor(id, initialMessages) {
    this.id = id;
    this.pastMessages = initialMessages || [];

    this.typingState = useState(false);
    this.collection = null;
  }

  getConversationMessagesContext() {
    return this.pastMessages;
  }

  generate(userText, onToken, onFinished) {
    this.pastMessages.push({
      role: 'user',
      content: userText
    });

    let context = this.getConversationMessagesContext();
    let tokenizer = new Tokenizer();

    let typingSetter = this.typingState[1];
    typingSetter(true);

    let arrivedTokens = [];

    // Assuming API_requestCompletionStream is defined elsewhere
    API_requestCompletionStream(API_KEY, context, (rawToken) => {

      tokenizer.feedInputToken(rawToken);

      onToken();

      if (rawToken == null) {
        this.pastMessages.push({ role: 'assistant', content: arrivedTokens.join('') });

        typingSetter(false);
        onFinished();
      } else {
        arrivedTokens.push(rawToken);
      }
    });

    this.collection.push({
      role: 'user',
      tokenizer: createTokenizerFromText(userText)
    });

    this.collection.push({
      role: 'assistant',
      tokenizer: tokenizer
    });
  }

  getTypingState() {
    return this.typingState[0];
  }

  getCollection() {
    let messageCollection = createCollection([]);

    this.collection = messageCollection;

    this.pastMessages.forEach(message => {
      messageCollection.push({
        role: message.role,
        tokenizer: createTokenizerFromText(message.content)
      });
    });

    return messageCollection;
  }
}


function ConversationThread(props) {
  let [isThreadEmpty, set_isThreadEmpty] = useState(true);
  let conversation = new Conversation(1, []);

  let isBotTyping = conversation.getTypingState();
  let messageCollection = conversation.getCollection();

  let client = useClient();

  let onSubmit = createHandler(async (userText) => {
    scrollToBottom();
    set_isThreadEmpty(false);

    conversation.generate(userText, scrollToBottom, onFinished);
  });

  let onFinished = () => {
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

  setTimeout(() => {
    scrollToBottom();
  }, 100);

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
      {messageCollection.view(message => <Message role={message.role} tokenizer={message.tokenizer} />)}
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