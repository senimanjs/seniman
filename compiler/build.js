import fs from 'node:fs';
import zlib from 'node:zlib';

import path from 'path';
import fsExtra from 'fs-extra';
import { getCompiledCompressionMap, processFile } from '../compiler/compiler.js';
import { fileURLToPath } from 'url';
import uglifyjs from 'uglify-js';
import CleanCSS from 'clean-css';

let cwd = process.cwd();
let configPath = cwd + '/config.js';

let config = (await import(configPath)).default;

export let directory_name = cwd + '/' + config.componentFolder;
export let target_directory = cwd + '/' + config.targetFolder;

const __dirname = path.dirname(fileURLToPath(new URL(import.meta.url)));

// directory path
if (!fs.existsSync(target_directory)) {
    fs.mkdirSync(target_directory);
}

export async function runFullBuild() {
    await compileAll({ throwErrorOnSyntaxError: true });
    await buildClientScaffolding();
    await copyPublicFiles();
    await compileGlobalCSS();
}

export async function buildClientScaffolding() {
    let jsCode = await fs.promises.readFile(__dirname + '/frontend/index-entry.js');

    let jsCodeString = jsCode.toString();
    var options = {
        toplevel: true,
        output: {
            beautify: false
        }
    };

    let minifiedCode = uglifyjs.minify(jsCodeString, options).code;
    let htmlString = `<!doctype html><script>${minifiedCode}</script>`;
    let htmlBuffer = Buffer.from(htmlString);
    //

    //console.log(htmlString);

    let brotliBuffer = zlib.brotliCompressSync(htmlBuffer);
    await fs.promises.writeFile(target_directory + '/index.html.brotli', brotliBuffer);

    let gzipBuffer = zlib.gzipSync(htmlBuffer);
    await fs.promises.writeFile(target_directory + '/index.html.gz', gzipBuffer);

    await fs.promises.writeFile(target_directory + '/index.html', htmlBuffer);
}

export async function compileFile(fileName) {
    let full_path = path.join(directory_name, fileName);
    let fileString = await fs.promises.readFile(full_path);
    let code = processFile(fileName, fileString);

    await fs.promises.writeFile(target_directory + '/' + fileName, code);
}

export async function compileCompressionMap() {
    //let decodeCompressionMap = getDecodeCompressionMap();
    //console.log('decodeCompressionMap', decodeCompressionMap);
    // await fs.promises.writeFile(target_directory + '/decode-map.json', JSON.stringify(decodeCompressionMap));

    await fs.promises.writeFile(target_directory + '/compression-command.bin', getCompiledCompressionMap());
}

let fileNames = new Set();
let trackedSyntaxErrors = {};

export function addFilesToCompile(newFileNames) {
    newFileNames.forEach(fileName => {
        fileNames.add(fileName);
    })
}

export async function recompile() {
    let fileName;
    let combinedFileNames = [...fileNames, ...new Set(Object.keys(trackedSyntaxErrors))];

    try {
        for (fileName of combinedFileNames) {
            await compileFile(fileName);
            delete trackedSyntaxErrors[fileName];
            fileNames.delete(fileName);
        }
        await fs.promises.rm(target_directory + '/SyntaxErrors.json', { force: true });

        return { success: true };
    } catch (err) {

        if (err.name == 'SyntaxError') {
            trackedSyntaxErrors[fileName] = {
                file: 'file://' + directory_name + '/' + fileName,
                name: err.name,
                message: err.message,
                lineNumber: err.loc.line,
                column: err.loc.column
            };

            await fs.promises.writeFile(target_directory + '/SyntaxErrors.json', JSON.stringify(trackedSyntaxErrors));

            return { success: false };
        } else {
            throw err;
        }
    } finally {
        await compileCompressionMap();
    }
}

export async function compileAll({ throwErrorOnSyntaxError }) {
    let fileNames = fs.readdirSync(directory_name).reverse(); // need _reverse() so _platform file comes first.

    addFilesToCompile(fileNames);

    let { success } = await recompile();

    if (success) {
        console.log('compiling', fileNames, 'finished');
    } else {
        console.error(trackedSyntaxErrors);

        if (throwErrorOnSyntaxError) {
            throw new Error('Compilation error');
        }
    }
}

export async function copyPublicFiles() {
    return fsExtra.copy(`${cwd}/public`, `${cwd}/dist/public`);
}

export async function compileGlobalCSS() {
    let originalCss = await fs.promises.readFile(`${cwd}/global.css`, 'utf-8');
    let output = new CleanCSS({}).minify(originalCss);

    await fs.promises.writeFile(`${cwd}/dist/global.css`, output.styles);
}