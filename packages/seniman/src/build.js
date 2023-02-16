
import fs from 'node:fs';

export let build = {};

// TODO: read this from a config file
let buildPath = process.cwd() + '/dist';

let senimanLibraryPath = process.cwd() + '/node_modules/seniman/dist';
let frontendBundlePath = senimanLibraryPath + '/frontend-bundle';

build.htmlBuffers = {
  br: fs.readFileSync(frontendBundlePath + "/index.html.brotli"),
  gzip: fs.readFileSync(frontendBundlePath + "/index.html.gz"),
  uncompressed: fs.readFileSync(frontendBundlePath + "/index.html"),
};

try {
  //build.globalCss = (fs.readFileSync(buildPath + '/global.css')).toString();
} catch (e) {
  console.log('No global CSS detected.');
}

try {
  build.syntaxErrors = JSON.parse(fs.readFileSync(buildPath + '/SyntaxErrors.json'));
} catch (e) {
  console.log('No syntax errors.');
}