import { execFile } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const capacityDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(capacityDirectory, '../../..');
const senimanDirectory = process.env.SENIMAN_CAPACITY_PACKAGE_DIR
  ? path.resolve(process.env.SENIMAN_CAPACITY_PACKAGE_DIR)
  : path.join(repositoryRoot, 'packages/seniman');
const babelBinary = path.join(senimanDirectory, 'node_modules/.bin/babel');
const babelPlugin = path.join(senimanDirectory, 'dist/babel/index.js');
const source = path.join(capacityDirectory, 'fixtures/interactive-counters.jsx');
const outputDirectory = path.join(capacityDirectory, 'generated');
const output = path.join(outputDirectory, 'interactive-counters.js');

for (const requiredPath of [babelBinary, babelPlugin]) {
  try {
    await access(requiredPath);
  } catch {
    throw new Error(
      `Missing ${requiredPath}. Run \`npm install && npm run build\` in packages/seniman first.`
    );
  }
}

await mkdir(outputDirectory, { recursive: true });
await execFileAsync(babelBinary, [
  source,
  '--out-file', output,
  '--plugins', babelPlugin,
]);

// The compiler intentionally emits the public package import. Integration
// fixtures run directly against this checkout, so point that one generated
// import at the local build without creating another node_modules tree.
const compiled = await readFile(output, 'utf8');
await writeFile(
  output,
  compiled.replace(
    '"seniman/_autogen/v1"',
    JSON.stringify(pathToFileURL(
      path.join(senimanDirectory, 'dist/autogen-v1/index.js')
    ).href)
  )
);
