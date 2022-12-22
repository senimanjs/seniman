import { createServer } from '../runtime_v2/server.js';


export async function run() {

    let cwd = process.cwd();
    let configPath = cwd + '/config.js';

    let config = (await import(configPath)).default;
    let target_directory = cwd + '/' + config.targetFolder;
    let port = parseInt(process.env.PORT) || 3002;

    await createServer({ port: port, buildPath: target_directory });
}