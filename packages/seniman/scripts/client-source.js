import fs from 'fs';

// frontend/browser.js is a plain script with no bundler, so shared modules are inlined at the
// marker line `// @include <path relative to the package root>`, with their `export`
// keywords removed. Used by the build and by the test runtime, so tests run what ships.
const packageRoot = new URL('..', import.meta.url);

export async function loadClientSource() {
  let source = await fs.promises.readFile(new URL('frontend/browser.js', packageRoot), 'utf8');
  let includes = [...source.matchAll(/^[ \t]*\/\/ @include (\S+)[ \t]*$/gm)];

  for (let [line, path] of includes) {
    let module = await fs.promises.readFile(new URL(path, packageRoot), 'utf8');

    if (/^\s*import\b/m.test(module)) {
      throw new Error(`${path} is inlined into the client script, so it cannot import anything`);
    }

    source = source.replace(line, () => module.replace(/^export /gm, ''));
  }

  return source;
}
