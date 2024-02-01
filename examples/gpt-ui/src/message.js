import { useState, Sequence, getActiveScope, runInScope, onDispose } from 'seniman';
import Prism from 'prismjs';
import loadLanguages from 'prismjs/components/index.js';
import { lowlight } from 'lowlight/lib/common.js';

setTimeout(() => {
  loadLanguages(['js', 'jsx', 'typescript', 'bash', 'html', 'css', 'python', 'java', 'php', 'sql', 'arduino', 'cpp']);

  let codeString = `
    import React from 'react';

    function MyComponent(props) {
        return (
            <div>
                <h1>{props.heading}</h1>
                <p>{props.content}</p>
            </div>
        );
    }

    export default MyComponent;`;

  // warm up code path (brings down 100ms first call to <10ms)
  lowlight.highlightAuto(codeString).data;
}, 10);

function CodeBlock(props) {

  let [language, setLanguage] = useState('');
  let [highlightTokens, setHighlightTokens] = useState(null);

  let seq = new Sequence();
  let seqCount = 0;

  let hasContentStarted = false;
  let prebuffer = '';
  let codeBuffer = '';

  let container = props.container;

  container.onToken(token => {

    // handle newline (creation of new paragraph)
    if (token == '```') {
      // handle the case where the codeblock contents finishes without a newline
      if (!hasContentStarted && prebuffer) {
        seq.insert(seqCount++, [prebuffer]);
      }

      // detect language using lowlight
      let language = lowlight.highlightAuto(codeBuffer).data.language;

      if (language == "javascript") {
        language = "jsx";
      } else if (language == "php-template") {
        language = "html";
      }

      // tokenize using prism (what would I do to have just a single library to do both :( )
      if (Prism.languages.hasOwnProperty(language)) {
        let grammar = Prism.languages[language];
        let tokens = Prism.tokenize(codeBuffer, grammar, language);

        setHighlightTokens(tokens);

        // TODO: would be nice to do this in a worker since it's quite 
        // a CPU-intensive operation and we don't want to hog this thread
        // used for UI rendering
      }

      container.pop();
    } else if (token == '\n') {
      if (hasContentStarted) {
        seq.insert(seqCount++, [token]);
        codeBuffer += token;
      } else {
        setLanguage(prebuffer);
        hasContentStarted = true;
      }
    } else {
      if (hasContentStarted) {
        seq.insert(seqCount++, [token]);
        // gather codeBuffer for syntax highlighting
        codeBuffer += token;
      } else {
        prebuffer += token;
      }
    }
  });

  return (
    <div style={{ margin: '0px 0' }}>
      <div style={{ borderRadius: '5px 5px 0 0', padding: '5px 15px', fontSize: '11px', background: "#888", color: "#fff" }}>
        {language() == '' ? 'Code' : language()}
      </div>
      <div class="codeblock" style={{ borderRadius: '0 0 5px 5px', padding: '10px 15px', fontSize: '12px', background: "#000", color: "#fff", overflowX: 'scroll' }}>
        <pre style={{ fontFamily: 'monospace', color: '#ddd' }}>
          <code>
            {
              highlightTokens() ?
                highlightTokens().map(token => <CodeSyntaxToken token={token} />) :
                seq
            }
          </code>
        </pre>
      </div>
    </div>
  );
}

function CodeSpan(props) {
  let seq = new Sequence();
  let seqCount = 0;

  let firstBacktickEncountered = false;
  let container = props.container;

  container.onToken(token => {
    seq.insert(seqCount++, [token]);

    if (token == '`') {
      if (firstBacktickEncountered) {
        container.pop();
      } else {
        firstBacktickEncountered = true;
      }
    }
  });

  return (
    <code style={{ fontFamily: 'monospace', fontWeight: '600', fontSize: '12px' }}>
      {seq}
    </code>
  );
}

function Paragraph(props) {

  let seq = new Sequence();
  let seqCount = 0;
  let isNonEmpty = false;
  let container = props.container;

  container.onToken(token => {

    if (token == '```') {
      let newContainer = container.push();
      seq.insert(seqCount++, [<span><CodeBlock container={newContainer} /></span>]);
    } else if (token == '`') {
      let newContainer = container.push(token);
      seq.insert(seqCount++, [<span><CodeSpan container={newContainer} /></span>]);
    } else if (token == '\n') {
      if (isNonEmpty) {
        container.pop();
      }
      return;
    } else {
      seq.insert(seqCount++, [token]);
    }

    isNonEmpty = true;
  });

  return <p style={{ padding: '10px 0' }}>{seq}</p>;
}

function createContainer(root) {

  let container = {
    onTokenFn: null,

    onToken: (fn) => {
      container.onTokenFn = bindScope(fn);
      root.notifyReady();
    },

    pushToken: (token) => {
      container.onTokenFn(token, root.push, root.pop);
    },

    isReady: () => {
      return container.onTokenFn != null;
    },

    push: root.push,
    pop: root.pop
  };

  return container;
}

export function Message(props) {
  let { role, tokenizer } = props;
  let [isWaiting, setIsWaiting] = useState(true);

  let seq = new Sequence();
  let seqCount = 0;

  let root = {
    containerStack: [],
    buffered: [],

    notifyReady: () => {

      while (root.buffered.length > 0) {

        let container = root.containerStack[root.containerStack.length - 1];

        if (container.isReady()) {
          let token = root.buffered.shift();
          container.pushToken(token);
        } else {
          break;
        }
      }
    },

    pushToken: (token) => {
      let container = root.containerStack[root.containerStack.length - 1];

      if (container.isReady()) {
        container.pushToken(token);
      } else {
        root.buffered.push(token);
      }
    },

    push: (initialToken) => {

      let container = createContainer(root);

      root.containerStack.push(container);

      if (initialToken) {
        // reinsert the token at the start of the buffer so the child container can process it
        root.buffered.unshift(initialToken);
      }

      return container;
    },

    pop: () => {
      root.containerStack.pop();
    }
  };

  let rootContainer = createContainer(root);

  rootContainer.onToken(token => {
    let container = rootContainer.push(token);
    seq.insert(seqCount++, [<span><Paragraph container={container} /></span>]);
  });

  root.containerStack.push(rootContainer);

  // What we do here is basically handle incoming (properly buffer-tokenized) tokens
  // and route it to "containers" that handle different types of content, such as 
  // code blocks, paragraphs, etc. with their own internal state and rendering logic.
  let unsubscribe = tokenizer.onToken(token => {

    if (token == null) {
      return;
    }

    setIsWaiting(false);
    root.pushToken(token);
  });

  onDispose(() => {
    unsubscribe();
  });

  return <div style={{ fontSize: '13px', color: '#fff', background: role == "assistant" ? "#555" : "#444", lineHeight: '1.75' }}>
    <div style={{ padding: "15px", margin: "0 auto", maxWidth: "600px", color: "#ddd" }}>
      {isWaiting() ? <div>...</div> : seq}
    </div>
  </div>;
}

function bindScope(fn) {
  let scope = getActiveScope();

  return (...args) => {
    runInScope(scope, () => {
      fn(...args);
    });
  }
}

function CodeSyntaxToken(props) {
  let token = props.token;

  if (typeof token === "string") {
    return token;
  }

  function getChildren() {
    if (Array.isArray(token.content)) {
      return token.content.map(token => <CodeSyntaxToken token={token} />);
    } else {
      return token.content;
    }
  }

  // TODO: we're doing this with a switch statement for perf reasons since this is a hot path -- we create a LOT of tokens.
  // we'll move to a regular direct-to-class mapping once we optimize class creation in the compiler & runtime more

  // a small docs page would be 7.1KB of websocket messages with this method -- vs 9KB with direct-to-class mapping
  // so it seems worth it to do this for now
  switch (token.type) {
    case 'comment':
      return <span class="token comment">{getChildren()}</span>;
    case 'keyword':
      return <span class="token keyword">{getChildren()}</span>;
    case 'function':
      return <span class="token function">{getChildren()}</span>;
    case 'function-variable':
      return <span class="token function-variable">{getChildren()}</span>;
    case 'string':
      return <span class="token string">{getChildren()}</span>;
    case 'number':
      return <span class="token number">{getChildren()}</span>;
    case 'operator':
      return <span class="token operator">{getChildren()}</span>;
    case 'punctuation':
      return <span class="token punctuation">{getChildren()}</span>;
    case 'tag':
      return <span class="token tag">{getChildren()}</span>;
    case 'script-punctuation':
      return <span class="token script-punctuation">{getChildren()}</span>;
    case 'boolean':
      return <span class="token boolean">{getChildren()}</span>;
    case 'entity':
      return <span class="token entity">{getChildren()}</span>;
    case 'class-name':
      return <span class="token class-name">{getChildren()}</span>;
    case 'literal-property':
      return <span class="token literal-property">{getChildren()}</span>;
    case 'constant':
      return <span class="token constant">{getChildren()}</span>;
    case 'builtin':
      return <span class="token builtin">{getChildren()}</span>;
    case 'attr-name':
      return <span class="token attr-name">{getChildren()}</span>;
    case 'attr-value':
      return <span class="token attr-value">{getChildren()}</span>;
    case 'script':
      return <span class="token script">{getChildren()}</span>;
    case 'parameter':
      return <span class="token parameter">{getChildren()}</span>;
    case 'style':
      return <span class="token style">{getChildren()}</span>;
    case 'language-css':
      return <span class="token language-css">{getChildren()}</span>;
    case 'template-string':
      return <span class="token template-string">{getChildren()}</span>;
    case 'template-punctuation':
      return <span class="token template-punctuation">{getChildren()}</span>;
  }

  return <span>{getChildren()}</span>;
}