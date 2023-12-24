import { useState, createCollection } from 'seniman';
import Prism from 'prismjs';
import loadLanguages from 'prismjs/components/index.js';
import { lowlight } from 'lowlight/lib/common.js'

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

function createCodeblockContainer() {
  let hasContentStarted = false;
  let prebuffer = '';
  let _setLanguageFn = null;
  let _setHighlightTokens = null;

  let codeBuffer = '';

  let codeContainer = {
    childCollection: createCollection([]),

    pushToken: (token) => {
      if (token === '```') {
        // handle the case where the codeblock contents finishes without a newline
        if (!hasContentStarted && prebuffer) {
          codeContainer.childCollection.push(prebuffer);
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

          _setHighlightTokens(tokens);

          // TODO: would be nice to do this in a worker since it's quite 
          // a CPU-intensive operation and we don't want to hog this thread
          // used for UI rendering
        }

        return { type: 'exit' };
      } else if (token == '\n') {
        if (hasContentStarted) {
          codeContainer.childCollection.push(token);
          codeBuffer += token;
        } else {
          _setLanguageFn && _setLanguageFn(prebuffer);
          hasContentStarted = true;
        }
      } else {
        if (hasContentStarted) {
          codeContainer.childCollection.push(token);
          // gather codeBuffer for syntax highlighting
          codeBuffer += token;
        } else {
          prebuffer += token;
        }
      }
    },

    componentFn: () => {
      let [language, setLanguage] = useState('');
      let [highlightTokens, setHighlightTokens] = useState(null);

      // assign the setter to the outer scope to be set when we fully receive 
      // the language identifier up in the pushToken function
      _setLanguageFn = setLanguage;

      _setHighlightTokens = setHighlightTokens;

      return <div style={{ margin: '10px 0' }}>
        <div style={{ borderRadius: '5px 5px 0 0', padding: '5px 15px', fontSize: '11px', background: "#888", color: "#fff" }}>
          {language() == '' ? 'Code' : language()}
        </div>


        <div class="codeblock" style={{ borderRadius: '0 0 5px 5px', padding: '10px 15px', fontSize: '12px', background: "#000", color: "#fff", overflowX: 'scroll' }}>
          <pre style={{ fontFamily: 'monospace', color: '#ddd' }}>
            <code>
              {
                highlightTokens() ?
                  highlightTokens().map(token => <Token token={token} />) :
                  codeContainer.childCollection.view(token => token)
              }
            </code>
          </pre>
        </div>

      </div>;
    }
  };

  return codeContainer;
}

function createCodespanContainer() {
  let codespanContainer = {
    childCollection: createCollection([]),

    pushToken: (token) => {
      codespanContainer.childCollection.push(token);

      if (token === '`') {
        return { type: 'exit' };
      }
    },

    componentFn: () => {
      return <code style={{ fontFamily: 'monospace', fontWeight: '600' }}>
        {codespanContainer.childCollection.view(token => token)}
      </code>;
    }
  };

  codespanContainer.pushToken('`'); // show the first backtick

  return codespanContainer;
}

export function createContainer(type) {
  let c = {
    type,
    childCollection: createCollection([]),

    pushToken: (token) => {
      if (token === '```') {
        let container = createCodeblockContainer();
        c.childCollection.push(container);

        return { type: 'enter', container: container };
      } else if (token === '`') {
        let container = createCodespanContainer();
        c.childCollection.push(container);

        return { type: 'enter', container: container };
      } else if (token === '\n') {

        // exit the paragraph container
        if (c.type == 'p') {
          return { type: 'exit' };
        }

      } else {
        if (c.type === 'root') {
          let container = createContainer('p');
          container.pushToken(token);
          c.childCollection.push(container);

          return { type: 'enter', container };
        } else {
          c.childCollection.push(token);
        }
      }
    },

    componentFn: () => {
      return <p style={{ padding: '10px 0' }}>
        {c.childCollection.map((container => {
          if (typeof container == 'string') {
            return container;
          } else {
            return <container.componentFn />;
          }
        }))}
      </p>;
    }
  };

  return c;
}

function Token(props) {
  let token = props.token;

  if (typeof token === "string") {
    return token;
  }

  function getChildren() {
    if (Array.isArray(token.content)) {
      return token.content.map(token => <Token token={token} />);
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