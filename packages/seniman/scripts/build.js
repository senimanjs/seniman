import fs from 'fs';
import path from 'path';
import { execa } from 'execa';
import uglifyjs from 'uglify-js';
import zlib from 'zlib';

async function buildClientScaffolding(config) {

  let targetDirectory = config.targetDirectory;

  await fs.promises.mkdir(targetDirectory, { recursive: true });

  let jsCode = await fs.promises.readFile(process.cwd() + '/frontend/browser.js');

  let jsCodeString = jsCode.toString();
  var options = {
    toplevel: true,
    mangle: {
      properties: {
        regex: /^_/
      }
    },
    output: {
      beautify: false
    }
  };

  let minifiedCode = uglifyjs.minify(jsCodeString, options).code;
  let htmlString = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1" /><script>${minifiedCode}</script>`;
  let htmlBuffer = Buffer.from(htmlString);

  let frontendBundlePath = targetDirectory + '/frontend-bundle';

  await fs.promises.mkdir(frontendBundlePath, { recursive: true });

  let brotliBuffer = zlib.brotliCompressSync(htmlBuffer);
  await fs.promises.writeFile(frontendBundlePath + '/index.html.brotli.bin', brotliBuffer);

  let gzipBuffer = zlib.gzipSync(htmlBuffer);
  await fs.promises.writeFile(frontendBundlePath + '/index.html.gz.bin', gzipBuffer);

  await fs.promises.writeFile(frontendBundlePath + '/index.html', htmlBuffer);
}

// mkdir dist if it doesn't exist
await fs.promises.mkdir(process.cwd() + '/dist', { recursive: true });

// copy README.md to dist
await fs.promises.copyFile(path.normalize(process.cwd() + '/../../README.md'), process.cwd() + '/dist/README.md');

// copy babel plugin folder to dist
let babelFolderPath = process.cwd() + '/babel';
let babelFolderDistPath = process.cwd() + '/dist';

await fs.promises.mkdir(babelFolderDistPath, { recursive: true });
await execa('cp', ['-r', babelFolderPath, babelFolderDistPath]);

await buildClientScaffolding({
  targetDirectory: process.cwd() + '/dist'
});

// run child process for babel
await execa('./node_modules/.bin/babel', [
  'src',
  '--out-dir',
  './dist'
], {
  stdio: 'inherit'
});
