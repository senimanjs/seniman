
import fs from 'node:fs';

export let build = {};

let senimanLibraryPath = process.cwd() + '/node_modules/seniman/dist';
let frontendBundlePath = senimanLibraryPath + '/frontend-bundle';

build.htmlBuffers = {
  br: fs.readFileSync(frontendBundlePath + "/index.html.brotli"),
  gzip: fs.readFileSync(frontendBundlePath + "/index.html.gz"),
  uncompressed: fs.readFileSync(frontendBundlePath + "/index.html"),
};