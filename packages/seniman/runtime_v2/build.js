
import fs from 'node:fs';

export let build = {};

// TODO: read this from a config file
let buildPath = process.cwd() + '/dist';

build.compressionCommandBuffer = await fs.promises.readFile(buildPath + '/compression-command.bin');
build.reverseIndexMap = JSON.parse(await fs.promises.readFile(buildPath + '/reverse-index-map.json'));
build.globalCss = (await fs.promises.readFile(buildPath + '/global.css')).toString();
build.htmlBuffers = {
  br: fs.readFileSync(buildPath + "/index.html.brotli"),
  gzip: fs.readFileSync(buildPath + "/index.html.gz"),
  uncompressed: fs.readFileSync(buildPath + "/index.html"),
};

try {
  build.syntaxErrors = JSON.parse(await fs.promises.readFile(buildPath + '/SyntaxErrors.json'));
} catch (e) {
  console.log('No syntax errors.');
}