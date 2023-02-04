
import fs from 'node:fs';

export let build = {};

// TODO: read this from a config file
let buildPath = process.cwd() + '/dist';

build.htmlBuffers = {
  br: fs.readFileSync(buildPath + "/index.html.brotli"),
  gzip: fs.readFileSync(buildPath + "/index.html.gz"),
  uncompressed: fs.readFileSync(buildPath + "/index.html"),
};

try {
  build.globalCss = (await fs.promises.readFile(buildPath + '/global.css')).toString();
} catch (e) {
  console.log('No global CSS detected.');
}

try {
  build.syntaxErrors = JSON.parse(await fs.promises.readFile(buildPath + '/SyntaxErrors.json'));
} catch (e) {
  console.log('No syntax errors.');
}