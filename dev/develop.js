import chokidar from 'chokidar';

import { buildClientScaffolding, compileAll, recompile, compileGlobalCSS, copyPublicFiles, target_directory, directory_name, addFilesToCompile } from '../compiler/build.js';
import { createServer, updateBuildDev } from '../runtime_v2/server.js';

await compileAll({ throwErrorOnSyntaxError: false });
await buildClientScaffolding();
await copyPublicFiles();
await compileGlobalCSS();

console.log('start server');
await createServer({ port: 3002, buildPath: target_directory });

const sleep = (s) =>
    new Promise((p) => setTimeout(p, s));

const watcher = chokidar.watch(directory_name, { persistent: true })
    .on('change', async path => {

        let fileName = path.split(directory_name + '/')[1];
        console.log(`File ${fileName} has been changed`);

        // exit the current worker, and start compilation.
        // currently connected development browser tabs will
        // websocket-reconnect quickly -- the development server 
        // is set up to have the new connection wait until the build is complete
        // before having the Window start issuing commands to the connection.
        addFilesToCompile([fileName]);

        await sleep(10);
        await recompile();
        updateBuildDev();
    });
