import chokidar from 'chokidar';

import { buildClientScaffolding, compileAll, recompile, compileGlobalCSS, copyPublicFiles, addFilesToCompile, getConfig } from '../compiler/build.js';

export async function develop(senimanModule) {

    let { createServer, updateBuildDev } = senimanModule;
    let config = await getConfig();

    await compileAll({ config, throwErrorOnSyntaxError: false });
    await buildClientScaffolding(config);
    await copyPublicFiles(config);
    await compileGlobalCSS(config);

    await createServer({ port: 3002, buildPath: config.targetDirectory });

    const sleep = (s) =>
        new Promise((p) => setTimeout(p, s));

    const watcher = chokidar.watch(config.componentDirectory, { persistent: true })
        .on('change', async path => {

            let fileName = path.split(config.componentDirectory + '/')[1];
            console.log(`File ${fileName} has been changed`);

            // exit the current worker, and start compilation.
            // currently connected development browser tabs will
            // websocket-reconnect quickly -- the development server 
            // is set up to have the new connection wait until the build is complete
            // before having the Window start issuing commands to the connection.
            addFilesToCompile([fileName]);

            await sleep(10);
            await recompile(config);
            updateBuildDev();
        });
}
