// Encoder/decoder cross-check.
//
// Random JSX trees are compiled with the real babel plugin, rendered by the real server
// Window, and the identical command stream is fed to BOTH client decoders:
//
//   - frontend/browser.js (run against jsdom, so <template>.innerHTML parses like a browser)
//   - src/crawler/html.js (its HTML output is re-parsed with jsdom, as a crawler would)
//
// Each resulting DOM is compared with the DOM the generator says it should be, built directly
// with DOM APIs (no HTML parsing involved). Any encoder/decoder desync -- wrong anchor
// position, wrong target element, mangled text/attribute bytes -- shows up as a DOM mismatch.
//
// Every dynamic value is backed by state. After the first render, a few update rounds change
// random values and the comparison runs again, so update commands are covered too.
//
// The comparison is purely on the final DOM, so these tests stay valid across intentional
// wire-format changes. To reproduce a failure, the failing case prints its seed and JSX.

import assert from 'node:assert/strict';
import test from 'node:test';
import { transformSync } from '@babel/core';
import { JSDOM } from 'jsdom';
import seniman from '../babel/index.js';
// The runtime contains JSX, so it is loaded from the build (`npm test` builds first via pretest;
// when running this file directly, run `npm run build` after changing src/).
import * as autogenRuntime from '../dist/autogen-v1/index.js';
import { _createComponent, createRef, Window } from '../dist/window.js';
import { HtmlRenderingContext } from '../dist/crawler/html.js';
import { deregisterWindow, registerWindow, runInWindow, useDisposableEffect, useState } from '../dist/state.js';
import { createBrowserRuntime } from './helpers/browser-runtime.js';

const CASE_COUNT = Number(process.env.CROSSCHECK_CASES || 150);
const BASE_SEED = Number(process.env.CROSSCHECK_SEED || 1);
const UPDATE_ROUNDS = 2;

////////////////////////////////////////////////////////////////////////////////
// Deterministic random tree generator
////////////////////////////////////////////////////////////////////////////////

function createRandom(seed) {
  // mulberry32
  let state = seed >>> 0;

  let next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let int = (n) => Math.floor(next() * n);
  let chance = (p) => next() < p;
  let pick = (list) => list[int(list.length)];

  return { int, chance, pick };
}

// Tags chosen so the HTML parser never restructures them (no <p>, <a>, <li>, tables, ...).
const CONTAINER_TAGS = ['div', 'span', 'section', 'b', 'em', 'strong', 'label'];
const VOID_TAGS = ['input', 'br'];
const SAFE_TEXT_CHARS = 'abcdefghij XYZ0123456789éü日本✓';
// Characters that must survive encoding as data, never be interpreted as markup.
const SPECIAL_CHARS = ['<', '>', '&', '"', "'", '<b>', '&amp;', '</div>', '{', '}'];
// Only values jsdom's CSS parser accepts, so expected and actual styles are comparable.
const STYLE_PROPS = {
  width: ['1px', '2px', '10px', '50%'],
  color: ['red', 'blue', 'green'],
  margin: ['0px', '4px'],
  'font-weight': ['bold', '400']
};
const STYLE_KEYS = Object.keys(STYLE_PROPS);

function createValueGenerators(random) {
  let safeText = (min = 1, max = 12) => {
    let length = min + random.int(max - min + 1);
    let text = '';

    for (let i = 0; i < length; i++) {
      let ch = random.pick([...SAFE_TEXT_CHARS]);
      // JSX collapses runs of whitespace and we never want leading/trailing spaces.
      if (ch == ' ' && (i == 0 || i == length - 1 || text.endsWith(' '))) {
        ch = 'x';
      }
      text += ch;
    }

    return text;
  };

  let mixedText = () => {
    let parts = [safeText(1, 4)];
    let count = 1 + random.int(3);

    for (let i = 0; i < count; i++) {
      parts.push(random.pick(SPECIAL_CHARS), safeText(1, 4));
    }

    return parts.join('');
  };

  let anyText = () => random.chance(0.5) ? mixedText() : safeText();

  let styleObject = () => {
    let object = {};
    for (let key of STYLE_KEYS) {
      if (random.chance(0.4)) {
        object[key] = random.pick(STYLE_PROPS[key]);
      }
    }
    return object;
  };

  // How each kind of dynamic value is (re)generated. null / '' / false exercise the
  // remove-attribute, remove-style and unmount paths.
  let valueOf = {
    text: () => anyText(),
    attr: () => random.chance(0.15) ? null : anyText(),
    class: () => random.chance(0.15) ? '' : safeText(1, 8).replace(/ /g, '-'),
    styleValue: (key) => random.chance(0.2) ? '' : random.pick(STYLE_PROPS[key]),
    multiStyle: () => styleObject(),
    show: () => random.chance(0.6)
  };

  return { safeText, mixedText, anyText, valueOf };
}

function generateCase(seed) {
  let random = createRandom(seed);
  let { safeText, mixedText, valueOf } = createValueGenerators(random);

  // name -> { kind, key?, value }
  let props = {};
  let propCounter = 0;
  let refCount = 0;

  let newProp = (kind, key) => {
    let name = `p${propCounter++}`;
    props[name] = { kind, key, value: valueOf[kind](key) };
    return name;
  };

  // Node shapes:
  //   { kind: 'element', tag, attrs: [[name, value, asExpression]], style: [[k, v]],
  //     dynamicStyle: [[k, prop]], multiStyle: prop | null, dynamicClass: prop | null,
  //     dynamicAttr: [name, prop] | null, onClick, ref, children }
  //   { kind: 'text', value }              static JSX text
  //   { kind: 'stringExpr', value }        {"literal"} child
  //   { kind: 'dynamicText', prop }        {props.pN()}
  //   { kind: 'nestedBlock', element }     {<el/>} -- a separate block in an anchor
  //   { kind: 'conditional', prop, element } {props.pN() ? <el/> : null}
  //   { kind: 'component', child }         <Box>child</Box>
  //   { kind: 'svg', paths: [d], nestedPath: d | null }
  let newElement = (tag) => ({
    kind: 'element', tag, attrs: [], style: [], dynamicStyle: [], multiStyle: null,
    dynamicClass: null, dynamicAttr: null, onClick: false, ref: false, children: []
  });

  let genElement = (depth, budget) => {
    let isVoid = random.chance(0.08);
    let el = newElement(isVoid ? random.pick(VOID_TAGS) : random.pick(CONTAINER_TAGS));

    if (random.chance(0.15)) {
      el.dynamicClass = newProp('class');
    } else if (random.chance(0.3)) {
      el.attrs.push(['class', safeText(1, 8).replace(/ /g, '-'), false]);
    }

    if (random.chance(0.25)) {
      // non-ASCII and markup-like characters in static attribute values
      el.attrs.push(['title', random.chance(0.5) ? mixedText() : safeText(), true]);
    }

    if (random.chance(0.1)) {
      el.multiStyle = newProp('multiStyle');
    } else if (random.chance(0.3)) {
      for (let key of STYLE_KEYS) {
        if (!random.chance(0.3)) continue;

        if (random.chance(0.4)) {
          el.dynamicStyle.push([key, newProp('styleValue', key)]);
        } else {
          el.style.push([key, random.pick(STYLE_PROPS[key])]);
        }
      }
    }

    if (random.chance(0.2)) {
      el.dynamicAttr = ['data-t', newProp('attr')];
    }

    el.onClick = random.chance(0.1);

    if (random.chance(0.08)) {
      el.ref = `r${refCount++}`;
    }

    if (isVoid) {
      return el;
    }

    // Occasionally generate a very wide sibling list to cross the 255 index boundary.
    let wide = depth == 1 && random.chance(0.1);
    let childCount = wide ? 200 + random.int(150) : random.int(depth > 4 ? 2 : 5);
    let lastWasText = false;

    for (let i = 0; i < childCount; i++) {
      let roll = wide ? random.int(100) * 0.9 : random.int(100);
      let child;
      let canNest = depth < 6 && budget.elements > 0;

      if (roll < 28 && depth < 7 && budget.elements-- > 0) {
        child = genElement(depth + 1, budget);
      } else if (roll < 40 && !lastWasText) {
        // two static texts can't be adjacent in JSX source -- they'd merge
        child = { kind: 'text', value: safeText() };
      } else if (roll < 55) {
        child = { kind: 'dynamicText', prop: newProp('text') };
      } else if (roll < 63) {
        child = { kind: 'stringExpr', value: mixedText() };
      } else if (roll < 71 && canNest && budget.elements-- > 0) {
        child = { kind: 'nestedBlock', element: genElement(depth + 1, budget) };
      } else if (roll < 78 && canNest && budget.elements-- > 0) {
        child = { kind: 'conditional', prop: newProp('show'), element: genElement(depth + 1, budget) };
      } else if (roll < 83 && canNest && budget.elements-- > 0) {
        child = { kind: 'component', child: genElement(depth + 1, budget) };
      } else if (roll < 86) {
        child = {
          kind: 'svg',
          paths: Array.from({ length: random.int(3) }, () => `M${random.int(9)} 0L${random.int(9)} 9`),
          nestedPath: random.chance(0.5) ? `M0 ${random.int(9)}L9 0` : null
        };
      } else {
        child = newElement('span');
      }

      lastWasText = child.kind == 'text';
      el.children.push(child);
    }

    return el;
  };

  let root = genElement(1, { elements: 60 + random.int(200) });

  // A schedule of updates: for each round, the new value of a random subset of props.
  let updates = [];

  for (let round = 0; round < UPDATE_ROUNDS; round++) {
    let changes = {};

    for (let [name, prop] of Object.entries(props)) {
      if (random.chance(0.5)) {
        changes[name] = valueOf[prop.kind](prop.key);
      }
    }

    updates.push(changes);
  }

  return { root, props, refCount, updates };
}

////////////////////////////////////////////////////////////////////////////////
// Tree -> JSX source
////////////////////////////////////////////////////////////////////////////////

function toJsx(node) {
  switch (node.kind) {
    case 'text':
      return node.value;
    case 'stringExpr':
      return `{${JSON.stringify(node.value)}}`;
    case 'dynamicText':
      return `{props.${node.prop}()}`;
    case 'nestedBlock':
      return `{${toJsx(node.element)}}`;
    case 'conditional':
      return `{props.${node.prop}() ? ${toJsx(node.element)} : null}`;
    case 'component':
      return `<Box>${toJsx(node.child)}</Box>`;
    case 'svg': {
      let paths = node.paths.map(d => `<path d="${d}" />`).join('');
      let nested = node.nestedPath ? `{<path d="${node.nestedPath}" />}` : '';
      return `<svg width="10" height="10">${paths}${nested}</svg>`;
    }
    case 'element': {
      let attrs = '';

      for (let [name, value, asExpression] of node.attrs) {
        attrs += asExpression ? ` ${name}={${JSON.stringify(value)}}` : ` ${name}="${value}"`;
      }

      if (node.dynamicClass) {
        attrs += ` class={props.${node.dynamicClass}()}`;
      }

      if (node.multiStyle) {
        attrs += ` style={props.${node.multiStyle}()}`;
      } else if (node.style.length || node.dynamicStyle.length) {
        let entries = [
          ...node.style.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`),
          ...node.dynamicStyle.map(([k, prop]) => `${JSON.stringify(k)}: props.${prop}()`)
        ];
        attrs += ` style={{ ${entries.join(', ')} }}`;
      }

      if (node.dynamicAttr) {
        attrs += ` ${node.dynamicAttr[0]}={props.${node.dynamicAttr[1]}()}`;
      }

      if (node.onClick) {
        attrs += ` onClick={() => 0}`;
      }

      if (node.ref) {
        attrs += ` ref={props.${node.ref}}`;
      }

      if (VOID_TAGS.includes(node.tag)) {
        return `<${node.tag}${attrs} />`;
      }

      return `<${node.tag}${attrs}>${node.children.map(toJsx).join('')}</${node.tag}>`;
    }
  }
}

const BOX_SOURCE = 'function Box(props) { return <em class="box">{props.children}</em>; }';

////////////////////////////////////////////////////////////////////////////////
// Tree -> expected DOM (built with DOM APIs, no parsing)
////////////////////////////////////////////////////////////////////////////////

const SVG_NS = 'http://www.w3.org/2000/svg';

// Returns a node, or null when nothing should be rendered.
function buildExpected(document, node, values) {
  switch (node.kind) {
    case 'text':
    case 'stringExpr':
      return document.createTextNode(node.value);
    case 'dynamicText':
      return document.createTextNode(values[node.prop]);
    case 'nestedBlock':
      return buildExpected(document, node.element, values);
    case 'conditional':
      return values[node.prop] ? buildExpected(document, node.element, values) : null;
    case 'component': {
      let em = document.createElement('em');
      em.setAttribute('class', 'box');
      em.appendChild(buildExpected(document, node.child, values));
      return em;
    }
    case 'svg': {
      let svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('width', '10');
      svg.setAttribute('height', '10');

      for (let d of [...node.paths, ...(node.nestedPath ? [node.nestedPath] : [])]) {
        let path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
      }

      return svg;
    }
    case 'element': {
      let el = document.createElement(node.tag);

      for (let [name, value] of node.attrs) {
        el.setAttribute(name, value);
      }

      // setClassName('') goes through setAttribute with a string, so it leaves class="".
      if (node.dynamicClass) {
        el.setAttribute('class', values[node.dynamicClass]);
      }

      for (let [k, v] of node.style) {
        el.style.setProperty(k, v);
      }

      for (let [k, prop] of node.dynamicStyle) {
        if (values[prop]) {
          el.style.setProperty(k, values[prop]);
        }
      }

      if (node.multiStyle) {
        for (let [k, v] of Object.entries(values[node.multiStyle])) {
          el.style.setProperty(k, v);
        }
      }

      if (node.dynamicAttr && values[node.dynamicAttr[1]] != null) {
        el.setAttribute(node.dynamicAttr[0], values[node.dynamicAttr[1]]);
      }

      for (let child of node.children) {
        let childNode = buildExpected(document, child, values);
        if (childNode) {
          el.appendChild(childNode);
        }
      }

      return el;
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// Canonical DOM form for comparison
////////////////////////////////////////////////////////////////////////////////

// Adjacent text nodes are merged and empty ones dropped (sequence markers are empty text
// nodes, and HTML serialization merges adjacent text anyway). Attributes are sorted, an
// empty style attribute is the same as none, and style is compared as parsed properties.
function canonical(node, indent = '') {
  let lines = [];
  let pendingText = null;

  let flushText = () => {
    if (pendingText) {
      lines.push(`${indent}${JSON.stringify(pendingText)}`);
    }
    pendingText = null;
  };

  for (let child of node.childNodes) {
    if (child.nodeType == 3) {
      pendingText = (pendingText || '') + child.data;
      continue;
    }

    if (child.nodeType != 1) {
      continue;
    }

    flushText();

    let attrs = [...child.attributes]
      .filter(attr => attr.name != 'style')
      .map(attr => `${attr.name}=${JSON.stringify(attr.value)}`)
      .sort();

    let style = [];
    for (let i = 0; i < (child.style?.length || 0); i++) {
      let prop = child.style[i];
      style.push(`${prop}:${child.style.getPropertyValue(prop)}`);
    }

    if (style.length) {
      attrs.push(`style=${JSON.stringify(style.sort().join(';'))}`);
    }

    lines.push(`${indent}<${child.tagName.toLowerCase()}${attrs.length ? ' ' + attrs.join(' ') : ''}>`);
    lines.push(...canonical(child, indent + '  '));
  }

  flushText();

  return lines;
}

////////////////////////////////////////////////////////////////////////////////
// Compile + render + decode
////////////////////////////////////////////////////////////////////////////////

function compileApp(source) {
  let code = transformSync(source, {
    filename: 'crosscheck.jsx',
    babelrc: false,
    configFile: false,
    plugins: [seniman]
  }).code;

  let importPattern = /^import \{([^}]*)\} from "seniman\/_autogen\/v1";$/m;
  let specifiers = code.match(importPattern)[1].split(',').map(spec => {
    let [imported, local] = spec.trim().split(/\s+as\s+/);
    return { imported, local: local || imported };
  });

  let body = code.replace(importPattern, '') + '\nreturn App;';
  let fn = new Function(...specifiers.map(s => s.local), body);

  return fn(...specifiers.map(s => autogenRuntime[s.imported]));
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

// Output is flushed on microtasks/timers; give it a few turns.
async function settle() {
  for (let i = 0; i < 5; i++) {
    await tick();
  }
}

async function createSession(App, generated) {
  let dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
  let browser = await createBrowserRuntime({
    document: dom.window.document,
    Text: dom.window.Text
  });

  let crawler = new HtmlRenderingContext();
  crawler.onRenderComplete(() => { });

  let chunkIndex = 0;
  let decoderErrors = { browser: null, crawler: null };

  let window = new Window(
    { lowMemoryMode: false },
    {
      windowId: '123456789012345678901',
      href: 'http://localhost/',
      viewportSize: [800, 600],
      cookieString: ''
    },
    null,
    null,
    buffer => {
      let copy = Buffer.from(buffer);
      chunkIndex++;

      // The Window swallows exceptions thrown from its output callback, so decoder
      // failures must be captured here or they silently turn into a wrong DOM.
      if (!decoderErrors.browser) {
        try {
          browser.send(copy);
        } catch (error) {
          decoderErrors.browser = { chunkIndex, error };
        }
      }

      if (!decoderErrors.crawler) {
        try {
          crawler.feedBuffer(copy);
        } catch (error) {
          decoderErrors.crawler = { chunkIndex, error };
        }
      }
    }
  );

  registerWindow(window);
  window.onDestroy(() => deregisterWindow(window));

  let setters = {};

  // Root owns one state per dynamic prop so the test can drive updates from outside.
  function Root() {
    let appProps = {};

    for (let [name, prop] of Object.entries(generated.props)) {
      let [get, set] = useState(prop.value);
      appProps[name] = get;
      setters[name] = set;
    }

    for (let i = 0; i < generated.refCount; i++) {
      appProps[`r${i}`] = createRef();
    }

    return _createComponent(App, appProps);
  }

  runInWindow(window.id, () => {
    window.rootDisposer = useDisposableEffect(() => {
      window._attach(2, 0, _createComponent(Root, {}));
    });
  });

  await settle();

  return {
    document: dom.window.document,
    decoderErrors,

    browserBody: () => dom.window.document.body,

    crawlerBody: () => {
      if (decoderErrors.crawler) {
        return null;
      }

      try {
        return new JSDOM(crawler.renderHtml()).window.document.body;
      } catch (error) {
        decoderErrors.crawler = { chunkIndex: 'renderHtml', error };
        return null;
      }
    },

    async update(changes) {
      runInWindow(window.id, () => {
        for (let [name, value] of Object.entries(changes)) {
          setters[name](value);
        }
      });

      await settle();
    },

    destroy() {
      window.destroy();
    }
  };
}

////////////////////////////////////////////////////////////////////////////////
// Tests
////////////////////////////////////////////////////////////////////////////////

const VERBOSE = process.env.CROSSCHECK_VERBOSE == '1';
const CONTEXT_LINES = 4;

class CrossCheckFailure extends Error { }

function failCase(seed, source, summary, detail = '') {
  let jsx = VERBOSE || source.length <= 1500
    ? source
    : source.slice(0, 1500) + `\n... (${source.length} chars; CROSSCHECK_VERBOSE=1 prints all)`;

  throw new CrossCheckFailure(
    `[seed ${seed}] ${summary}\n` +
    (detail ? `\n${detail}\n` : '') +
    `\nReproduce: npm run build && CROSSCHECK_SEED=${seed} CROSSCHECK_CASES=1 node --test test/encode-decode-crosscheck.test.js\n` +
    `\nJSX:\n${jsx}`
  );
}

// Compact first-difference report. assert.equal's full diff of large DOM dumps is
// effectively unbounded in time, so it must not be used here.
function firstDifference(actualLines, expectedLines) {
  let length = Math.max(actualLines.length, expectedLines.length);

  for (let i = 0; i < length; i++) {
    if (actualLines[i] === expectedLines[i]) {
      continue;
    }

    let from = Math.max(0, i - CONTEXT_LINES);
    let to = i + CONTEXT_LINES + 1;
    let show = (lines) => lines.slice(from, to)
      .map((line, j) => `${from + j == i ? '>' : ' '} ${String(from + j + 1).padStart(5)} | ${line}`)
      .join('\n');

    return `first difference at line ${i + 1} of ${length}\n` +
      `-- expected --\n${show(expectedLines)}\n` +
      `-- actual --\n${show(actualLines)}`;
  }

  return null;
}

function compareDecoders(seed, source, session, generated, values, phase) {
  for (let [decoder, failure] of Object.entries(session.decoderErrors)) {
    if (failure) {
      failCase(seed, source,
        `${decoder} decoder threw on output chunk ${failure.chunkIndex} (${phase}): ${failure.error.message}`,
        failure.error.stack);
    }
  }

  let expectedBody = session.document.createElement('body');
  expectedBody.appendChild(buildExpected(session.document, generated.root, values));
  let expected = canonical(expectedBody);

  for (let [decoder, body] of [['browser.js', session.browserBody()], ['crawler', session.crawlerBody()]]) {
    if (!body) {
      continue; // a decoder error was recorded; reported on the next check
    }

    let difference = firstDifference(canonical(body), expected);

    if (difference) {
      failCase(seed, source, `${decoder} decoder produced a different DOM than expected (${phase})`, difference);
    }
  }

  // renderHtml may have recorded a crawler error just now
  if (session.decoderErrors.crawler) {
    let failure = session.decoderErrors.crawler;
    failCase(seed, source, `crawler decoder threw (${phase}): ${failure.error.message}`, failure.error.stack);
  }
}

async function checkCase(seed) {
  let generated = generateCase(seed);
  let source = `${BOX_SOURCE}\nfunction App(props) { return ${toJsx(generated.root)}; }`;
  let App;

  try {
    App = compileApp(source);
  } catch (error) {
    // Blocks over a documented encoding limit are rejected at declare time -- that is the
    // expected outcome, not a desync. Anything else is a real failure.
    if (/Seniman template limit reached/.test(error.message)) {
      return { skipped: true };
    }
    failCase(seed, source, `compiling/declaring the module threw: ${error.message}`, error.stack);
  }

  let session;

  try {
    session = await createSession(App, generated);
  } catch (error) {
    failCase(seed, source, `server render threw: ${error.message}`, error.stack);
  }

  try {
    let values = Object.fromEntries(Object.entries(generated.props).map(([name, prop]) => [name, prop.value]));

    compareDecoders(seed, source, session, generated, values, 'initial render');

    for (let round = 0; round < generated.updates.length; round++) {
      let changes = generated.updates[round];
      Object.assign(values, changes);

      try {
        await session.update(changes);
      } catch (error) {
        failCase(seed, source, `server update threw (update round ${round + 1}): ${error.message}`, error.stack);
      }

      compareDecoders(seed, source, session, generated, values, `after update round ${round + 1}`);
    }
  } finally {
    session.destroy();
  }

  return { checked: true };
}

const SLOW_CASE_MS = 2000;

test(`browser and crawler decoders reproduce the encoded DOM (${CASE_COUNT} random blocks, seed ${BASE_SEED})`, { timeout: 120000 }, async () => {
  let checked = 0;
  let skipped = 0;
  let failures = [];

  for (let i = 0; i < CASE_COUNT; i++) {
    let seed = BASE_SEED + i;
    let startedAt = Date.now();

    try {
      let result = await checkCase(seed);
      result.checked ? checked++ : skipped++;
    } catch (error) {
      if (!(error instanceof CrossCheckFailure)) {
        throw error; // a bug in the harness itself
      }
      failures.push({ seed, error });
    }

    let elapsed = Date.now() - startedAt;

    if (elapsed > SLOW_CASE_MS) {
      failures.push({ seed, error: new Error(`[seed ${seed}] case took ${elapsed}ms (limit ${SLOW_CASE_MS}ms)`) });
    }
  }

  if (failures.length) {
    let summary = failures
      .map(({ error }) => '  ' + error.message.split('\n')[0])
      .join('\n');

    assert.fail(
      `${failures.length} of ${CASE_COUNT} cases failed (${checked} passed, ${skipped} skipped at documented limits):\n` +
      `${summary}\n\n` +
      `First failure in full:\n${failures[0].error.message}`
    );
  }

  // Guard against the generator drifting into producing mostly-skipped cases.
  assert.ok(checked >= CASE_COUNT * 0.8, `only ${checked}/${CASE_COUNT} cases were checked (${skipped} skipped at limits)`);
});
