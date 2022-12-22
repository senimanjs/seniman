#!/usr/bin/env node

import { program } from 'commander';
import { develop } from './dev/develop.js';
import { runFullBuild, getConfig } from './compiler/build.js';

program
    .command('dev')
    .description('Run the development process -- run it in the application folder.')
    .action(async () => {
        // TODO: is there a cleaner way to make sure the CLI uses the application's local seniman installation?
        let senimanModule = await import(process.cwd() + '/node_modules/seniman/index.js');
        develop(senimanModule);
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
    .description('Run the built application code in the target folders.')
    .action(async () => {


        // TODO: is there a cleaner way to make sure the CLI uses the application's local seniman installation?
        let senimanModule = await import(process.cwd() + '/node_modules/seniman/index.js');
        let config = await getConfig();
        let port = parseInt(process.env.PORT) || 3002;

        await senimanModule.createServer({ port: port, buildPath: config.targetDirectory });
    });

program
    .command('create')
    .description('Create application.')
    .action((appName) => {
        console.log('Creating application', appName);
    });

program.parse(process.argv);