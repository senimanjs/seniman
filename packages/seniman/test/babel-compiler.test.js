import assert from 'node:assert/strict';
import test from 'node:test';
import { transformSync } from '@babel/core';
import presetTypeScriptImport from '@babel/preset-typescript';
import seniman from '../babel/index.js';

const presetTypeScript = presetTypeScriptImport.default;

function compile(source, options = {}) {
  let plugins = [
    ...(options.pluginsBefore || []),
    seniman,
    ...(options.pluginsAfter || [])
  ];
  let presets = options.transformTypeScript
    ? [[presetTypeScript, {
        allExtensions: true,
        isTSX: true,
        onlyRemoveTypeImports: true
      }]]
    : [];

  return transformSync(source, {
    filename: options.filename || 'fixture.jsx',
    babelrc: false,
    configFile: false,
    parserOpts: options.parseTypeScript
      ? { plugins: ['typescript', 'jsx'] }
      : undefined,
    plugins,
    presets
  }).code;
}

test('compiler lowers JavaScript JSX without project presets', () => {
  let code = compile(`
    function Greeting(props) {
      return <p class="greeting">Hello {props.name}</p>;
    }
  `);

  assert.match(code, /from "seniman\/_autogen\/v1"/);
  assert.match(code, /type: "p"/);
  assert.match(code, /props\.name/);
  assert.doesNotMatch(code, /<p/);
});

test('compiler traverses TypeScript wrappers without owning module erasure', () => {
  let code = compile(`
    interface Props {
      name: string;
    }

    function Greeting(props: Props) {
      return (<p>{props.name}</p>) satisfies JSX.Element;
    }
  `, {
    filename: 'fixture.tsx',
    parseTypeScript: true
  });

  assert.match(code, /interface Props/);
  assert.match(code, /props: Props/);
  assert.match(code, /satisfies JSX\.Element/);
  assert.match(code, /_senimanCreateBlock/);
  assert.doesNotMatch(code, /<p/);
});

test('compiler composes with the Babel TypeScript transform', () => {
  let code = compile(`
    import type { GreetingData } from './types.js';

    interface Props {
      name: GreetingData;
    }

    function Greeting(props: Props) {
      return (<p>{props.name}</p>) as JSX.Element;
    }
  `, {
    filename: 'fixture.tsx',
    transformTypeScript: true
  });

  assert.doesNotMatch(code, /interface Props/);
  assert.doesNotMatch(code, /\.\/types\.js/);
  assert.doesNotMatch(code, /props: Props/);
  assert.doesNotMatch(code, /as JSX\.Element/);
  assert.doesNotMatch(code, /<p/);
  assert.match(code, /_senimanCreateBlock/);
});

test('compiler erases TypeScript from serialized client functions', () => {
  let code = compile(`
    function Input() {
      let report = (value: string) => value;

      return <button onClick={$c((event: MouseEvent) => {
        type ButtonValue = string;
        let button = event.currentTarget as HTMLButtonElement;
        let value = button.value satisfies ButtonValue;
        $s(report)(value);
      })}>Send</button>;
    }
  `, {
    filename: 'fixture.tsx',
    transformTypeScript: true
  });

  assert.match(code, /argNames: \["event"\]/);
  assert.match(code, /const|let/);
  assert.match(code, /this\.serverFunctions/);
  assert.match(code, /serverBindFns: \(\) => \[report\]/);
  assert.doesNotMatch(code, /MouseEvent/);
  assert.doesNotMatch(code, /HTMLButtonElement/);
  assert.doesNotMatch(code, /ButtonValue/);
  assert.doesNotMatch(code, /value: string/);
});

test('compiler finds JSX through unowned JavaScript and TypeScript nodes', () => {
  let code = compile(`
    async function App() {
      return await Promise.resolve(
        (<section>Ready</section>) as JSX.Element
      );
    }
  `, {
    filename: 'fixture.tsx',
    transformTypeScript: true
  });

  assert.doesNotMatch(code, /<section/);
  assert.doesNotMatch(code, /as JSX\.Element/);
  assert.match(code, /Promise\.resolve\(_senimanCreateBlock/);
});

test('compiler rejects unsupported client function parameters', () => {
  assert.throws(() => compile(`
    const handler = $c(({ value }) => value);
  `), /\$c parameters must be identifiers/);
});

test('compiler-generated bindings do not collide with application bindings', () => {
  let code = compile(`
    const _senimanCreateBlock = 'application value';
    const _senimanBlock = 'application block';

    function App() {
      return <main>{_senimanCreateBlock}{_senimanBlock}</main>;
    }
  `);

  assert.match(code, /_createBlock as _senimanCreateBlock2/);
  assert.match(code, /const _senimanBlock2 =/);
  assert.match(code, /const _senimanCreateBlock = 'application value'/);
  assert.match(code, /const _senimanBlock = 'application block'/);
});

test('compiler composes with sibling Babel visitors', () => {
  let observedBefore = 0;
  let observedAfter = 0;
  let observerBefore = () => ({
    visitor: {
      JSXElement: {
        enter() {
          observedBefore++;
        }
      }
    }
  });
  let observerAfter = () => ({
    visitor: {
      JSXElement: {
        enter() {
          observedAfter++;
        }
      },
      StringLiteral(path) {
        if (path.node.value == 'before') {
          path.node.value = 'after';
        }
      }
    }
  });

  let code = compile(`
    function App() {
      return <main title="before"><span>Visible to sibling visitors</span></main>;
    }
  `, {
    pluginsBefore: [observerBefore],
    pluginsAfter: [observerAfter]
  });

  assert.equal(observedBefore, 2);
  assert.equal(observedAfter, 2);
  assert.match(code, /"title": "after"/);
  assert.doesNotMatch(code, /<main/);
});

test('compiler distinguishes template children from expression JSX roots', () => {
  let code = compile(`
    function Child(props) {
      return props.children;
    }

    function App(props) {
      return <main>
        <span>template child</span>
        {props.visible && <em>expression root</em>}
        <Child><b>component child</b></Child>
      </main>;
    }
  `);

  assert.equal(code.match(/v: "2\.0"/g)?.length, 3);
  assert.doesNotMatch(code, /<(main|span|em|Child|b)/);
});
