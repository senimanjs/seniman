import fs from 'fs';
import { execa } from 'execa';
import uglifyjs from 'uglify-js';
import zlib from 'zlib';
import crypto from 'crypto';

// throw error if not run in the packages/seniman directory
if (!process.cwd().endsWith('/packages/seniman')) {
  throw new Error('This script must be run in the packages/seniman directory');
}

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

  // get 8 character hash of the minified code
  let versionHash = crypto.createHash('sha256').update(minifiedCode).digest('hex').slice(0, 8);

  // replace $$VERSION$$ with the version hash
  minifiedCode = minifiedCode.replace(/\$\$VERSION\$\$/g, versionHash);

  let htmlString = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1" /><script>${minifiedCode}</script>`;
  let htmlBuffer = Buffer.from(htmlString);
  let brotliBuffer = zlib.brotliCompressSync(htmlBuffer);
  let gzipBuffer = zlib.gzipSync(htmlBuffer);

  console.log('HTML+JS size:');
  console.table([
    {
      algo: 'uncompressed',
      size: minifiedCode.length
    },
    {
      algo: 'gzip',
      size: gzipBuffer.length
    },
    {
      algo: 'brotli',
      size: brotliBuffer.length
    }
  ]);

  let templateBuffersString = `
export default {
  versionHash: "${versionHash}",
  br: Buffer.from("${brotliBuffer.toString('base64')}", 'base64'),
  gzip: Buffer.from("${gzipBuffer.toString('base64')}", 'base64'),
  uncompressed: Buffer.from("${htmlBuffer.toString('base64')}", 'base64')
};
`;

  await fs.promises.writeFile(targetDirectory + '/_htmlBuffers.js', templateBuffersString);
}

// mkdir dist if it doesn't exist
await fs.promises.mkdir(process.cwd() + '/dist', { recursive: true });

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
