#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import fsExtra from 'fs-extra';
import { fileURLToPath } from 'url';

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
    .command('create <appName>')
    .description('Create application.')
    .action(async (appName) => {
        console.log('Creating application', appName);
        const __dirname = path.dirname(fileURLToPath(new URL(import.meta.url)));

        await fsExtra.copy(__dirname + '/new-app-template', process.cwd() + '/' + appName);

        let targetSenimanVersion = '0.0.7';

        let packageJsonStringTemplate = await fs.promises.readFile(process.cwd() + '/' + appName + '/package.json', 'utf-8');
        let packageJsonString = packageJsonStringTemplate.replace('$APP_NAME', appName).replace('$SENIMAN_VERSION', '^' + targetSenimanVersion);

        await fs.promises.writeFile(process.cwd() + '/' + appName + '/package.json', packageJsonString);

        console.log('Created!');
    });

program.parse(process.argv);