import fs from 'node:fs';
import zlib from 'node:zlib';

import path from 'path';
import fsExtra from 'fs-extra';
import { getCompiledCompressionMap, processFile } from './compiler.js';
import { fileURLToPath } from 'url';
import uglifyjs from 'uglify-js';
import CleanCSS from 'clean-css';

const __dirname = path.dirname(fileURLToPath(new URL(import.meta.url)));

export async function getConfig() {
    let cwd = process.cwd();
    let configPath = cwd + '/config.js';
    let config = (await import(configPath)).default;

    return {
        appDirectory: cwd,
        componentDirectory: cwd + '/' + config.componentFolder,
        targetDirectory: cwd + '/' + config.targetFolder
    };
}

export async function runFullBuild() {

    let config = await getConfig();

    await compileAll({ config, throwErrorOnSyntaxError: true });
    await buildClientScaffolding(config);
    await copyPublicFiles(config);
    await compileGlobalCSS(config);
}

export async function buildClientScaffolding(config) {

    let targetDirectory = config.targetDirectory;

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

    let brotliBuffer = zlib.brotliCompressSync(htmlBuffer);
    await fs.promises.writeFile(targetDirectory + '/index.html.brotli', brotliBuffer);

    let gzipBuffer = zlib.gzipSync(htmlBuffer);
    await fs.promises.writeFile(targetDirectory + '/index.html.gz', gzipBuffer);

    await fs.promises.writeFile(targetDirectory + '/index.html', htmlBuffer);
}

export async function compileFile(config, fileName) {
    let full_path = fileName == '_platform.js' ?
        path.join(__dirname, '/files/_platform.js') :
        path.join(config.componentDirectory, fileName);

    let fileString = await fs.promises.readFile(full_path);
    let code = processFile(fileName, fileString);

    let fullPath = path.join(config.targetDirectory, fileName);
    let directoryPath = path.dirname(fullPath);

    await fs.promises.mkdir(directoryPath, { recursive: true })
    await fs.promises.writeFile(fullPath, code);
}

export async function compileCompressionMap(config) {

    await fs.promises.writeFile(config.targetDirectory + '/compression-command.bin', getCompiledCompressionMap());
}

let fileNames = new Set();
let trackedSyntaxErrors = {};

export function addFilesToCompile(newFileNames) {
    newFileNames.forEach(fileName => {
        fileNames.add(fileName);
    })
}

export async function recompile(config) {
    let fileName;
    let combinedFileNames = [...fileNames, ...new Set(Object.keys(trackedSyntaxErrors))];

    try {
        for (fileName of combinedFileNames) {
            await compileFile(config, fileName);
            delete trackedSyntaxErrors[fileName];
            fileNames.delete(fileName);
        }
        await fs.promises.rm(config.targetDirectory + '/SyntaxErrors.json', { force: true });

        return { success: true };
    } catch (err) {

        if (err.name == 'SyntaxError') {
            trackedSyntaxErrors[fileName] = {
                file: 'file://' + config.componentDirectory + '/' + fileName,
                name: err.name,
                message: err.message,
                lineNumber: err.loc.line,
                column: err.loc.column
            };

            await fs.promises.writeFile(config.targetDirectory + '/SyntaxErrors.json', JSON.stringify(trackedSyntaxErrors));

            return { success: false };
        } else {
            throw err;
        }
    } finally {
        await compileCompressionMap(config);
    }
}

const readdirRecursive = async dir => {
    const files = await fs.promises.readdir(dir, { withFileTypes: true });

    const paths = files.map(async file => {
        const _path = path.join(dir, file.name);

        if (file.isDirectory()) return await readdirRecursive(_path);

        return _path;
    });

    return (await Promise.all(paths)).flat(Infinity);
}

export async function compileAll({ config, throwErrorOnSyntaxError }) {

    if (!fs.existsSync(config.targetDirectory)) {
        fs.mkdirSync(config.targetDirectory);
    }

    let fileNames = (await readdirRecursive(config.componentDirectory))
        .map(fileName => fileName.split(config.componentDirectory + '/')[1]);

    addFilesToCompile(['_platform.js']);
    addFilesToCompile(fileNames);

    let { success } = await recompile(config);

    if (success) {
        console.log('compiling', fileNames, 'finished');
    } else {
        console.error(trackedSyntaxErrors);

        if (throwErrorOnSyntaxError) {
            throw new Error('Compilation error');
        }
    }
}

export async function copyPublicFiles(config) {
    return fsExtra.copy(`${config.appDirectory}/public`, `${config.targetDirectory}/public`);
}

export async function compileGlobalCSS(config) {
    let originalCss = await fs.promises.readFile(`${config.appDirectory}/global.css`, 'utf-8');
    let output = new CleanCSS({}).minify(originalCss);

    await fs.promises.writeFile(`${config.targetDirectory}/global.css`, output.styles);
}