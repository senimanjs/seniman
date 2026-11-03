// Golden snapshot of the whole compilation pipeline: JSX -> babel plugin -> _declareBlock
// encoding (template + ELSCRIPT bytes). Any change to compiled output, encoded bytes, or
// encoded sizes shows up as a snapshot diff.
//
// After an intentional change, regenerate and review the diff:
//   node --test --test-update-snapshots test/compiler-snapshot.test.js

import test from 'node:test';
import { createHash } from 'node:crypto';
import { transformSync } from '@babel/core';
import seniman from '../babel/index.js';
import { _declareBlock, blockDefinitions } from '../src/declare.js';

// Large outputs are recorded as size + hash to keep the snapshot reviewable.
const INLINE_LIMIT = 4096;

const range = (count, fn) => Array.from({ length: count }, (_, i) => fn(i)).join('');

const fixtures = {
  'static text, attributes, inline style and class': `
    function A() {
      return <div id="main" class="card big" style={{ color: 'red', padding: '4px' }}>Hello <b>world</b></div>;
    }
  `,
  'dynamic text, attribute, class and style': `
    function A(props) {
      return <div title={props.title()} class={props.kind()} style={{ width: props.width() }}>
        Count: {props.count()}
      </div>;
    }
  `,
  'events, refs and onMount': `
    function A(props) {
      return <section>
        <button onClick={() => props.go()}>Go</button>
        <input ref={props.inputRef} onMount={$c(() => {})} />
      </section>;
    }
  `,
  'client function with server bindings': `
    function A(props) {
      let save = props.save;
      return <button onClick={$c((event) => { $s(save)(event.type); })}>Save</button>;
    }
  `,
  'components, children and nested blocks': `
    function A(props) {
      return <main>
        <Header title="hi" />
        <List>{props.items().map(item => <li>{item}</li>)}</List>
        {props.open() && <aside>Open</aside>}
      </main>;
    }
  `,
  'anchors at start, middle and end with markers': `
    function A(props) {
      return <ul>{props.a()}<li>one</li>{props.b()}{props.c()}<li>two</li>{props.d()}</ul>;
    }
  `,
  'deep nesting with target at the bottom': `
    function A(props) {
      return <div><div><div><div><div><span onClick={() => props.x()}>deep</span></div></div></div></div></div>;
    }
  `,
  'svg path': `
    function A(props) {
      return <path d="M0 0L10 10" stroke={props.stroke()} />;
    }
  `,
  'non-ASCII text and attribute': `
    function A() {
      return <p title="héllo ✓">Ünïcödé — 日本語</p>;
    }
  `,
  '255 static siblings': `
    function A() { return <div>${range(255, () => '<span></span>')}</div>; }
  `,
  '256 static siblings (root sentinel boundary)': `
    function A() { return <div>${range(256, () => '<span></span>')}</div>; }
  `,
  'static run before an expression (ELSCRIPT chain limit)': `
    function A(props) { return <div>${range(300, () => '<span></span>')}{props.x()}<span></span></div>; }
  `,
  // tokens = div, style, width + one per distinct value: 60 values -> 63 tokens (ok), 61 -> 64 (throws)
  '63 vs 64 block tokens via distinct inline style values': `
    function A() { return <div>${range(60, i => `<div style={{ width: '${i}px' }}></div>`)}</div>; }
    function B() { return <div>${range(61, i => `<div style={{ width: '${i}px' }}></div>`)}</div>; }
  `,
  '1000 rows (larger than the initial 2KB buffer)': `
    function A() { return <div>${range(1000, i => `<div class="row">Hello row number ${i}</div>`)}</div>; }
  `,
  '5000 rows (exceeds max page size)': `
    function A() { return <div>${range(5000, i => `<div class="row">Hello row number ${i}</div>`)}</div>; }
  `,
};

function compile(source) {
  return transformSync(source, {
    filename: 'fixture.jsx',
    babelrc: false,
    configFile: false,
    plugins: [seniman]
  }).code;
}

// Runs the compiled module's top level with stubbed runtime imports, collecting the
// block definitions it declares. Component bodies are never invoked.
function collectBlockDefinitions(code) {
  let importPattern = /^import \{([^}]*)\} from "seniman\/_autogen\/v1";$/m;
  let specifiers = code.match(importPattern)[1].split(',').map(spec => {
    let [imported, local] = spec.trim().split(/\s+as\s+/);
    return { imported, local: local || imported };
  });

  let defs = [];
  let runtime = {
    _declareBlock: def => defs.push(def),
    _declareClientFunction: () => 0
  };

  let body = code.replace(importPattern, '');
  let fn = new Function(...specifiers.map(s => s.local), body);
  fn(...specifiers.map(s => runtime[s.imported] || (() => { })));

  return defs;
}

function summarize(text) {
  let hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
  return `<${text.length} chars, sha256:${hash}>`;
}

function hexLines(buffer) {
  let hex = buffer.toString('hex');

  if (hex.length > INLINE_LIMIT) {
    return '  ' + summarize(hex);
  }

  return hex.match(/.{1,64}/g).map(line => '  ' + line).join('\n');
}

function describeBlock(def, index) {
  let block;

  try {
    block = blockDefinitions.get(_declareBlock(structuredClone(def)));
  } catch (error) {
    return `--- block ${index} ---\nthrows: ${error.message}`;
  }

  let el = block.elScriptBuffer;
  let refs = el[0];
  let anchors = el[1 + 2 * refs];
  let targets = el[2 + 2 * refs + 2 * anchors];

  return [
    `--- block ${index} ---`,
    `tokens (${block.tokens.length}): ${summarizeIfLong(JSON.stringify(block.tokens))}`,
    `template: ${block.templateBuffer.length} bytes`,
    hexLines(block.templateBuffer),
    `elscript: ${el.length} bytes (${refs} refs, ${anchors} anchors, ${targets} targets)`,
    hexLines(el)
  ].join('\n');
}

function summarizeIfLong(text) {
  return text.length > INLINE_LIMIT ? summarize(text) : text;
}

for (let [name, source] of Object.entries(fixtures)) {
  test(`compiler snapshot: ${name}`, (t) => {
    let code = compile(source);
    let defs = collectBlockDefinitions(code);

    let output = [
      '--- compiled ---',
      code.length > INLINE_LIMIT ? summarize(code) : code,
      ...defs.map(describeBlock)
    ].join('\n');

    t.assert.snapshot(output, { serializers: [value => value] });
  });
}
