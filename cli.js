#!/usr/bin/env node

import { program } from 'commander';
import { develop } from './dev/develop.js';
//import { build } from './dev/build.js';

import { runFullBuild, getConfig } from './compiler/build.js';
import { createServer } from './runtime_v2/server.js';

program
    .command('dev')
    .description('Run the development process -- run it in the application folder.')
    .action(() => {
        develop();
    });

program
    .command('build')
    .description('Compile the application code.')
    .action(() => {
        runFullBuild();
        console.log('Build finished.');
    });

program
    .command('run')
    .description('Run the built application code in the target folder.')
    .action(async () => {
        let config = await getConfig();
        let port = parseInt(process.env.PORT) || 3002;

        await createServer({ port: port, buildPath: config.targetDirectory });
    });

program
    .command('create')
    .description('Create application.')
    .action((appName) => {
        console.log('Creating application', appName);
    });

program.parse(process.argv);