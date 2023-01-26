#!/usr/bin/env node
import { program } from 'commander';
import { watch } from './dev/develop.js';
import { runFullBuild, getConfig } from './compiler/build.js';

program
    .command('watch')
    .description('Run the development process -- run it in the application folder.')
    .action(async () => {
        watch();
    });

program
    .command('build')
    .description('Compile the application code.')
    .action(() => {
        runFullBuild();
        console.log('Build finished.');
    });

program.parse(process.argv);