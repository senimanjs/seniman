#!/usr/bin/env node

import { program } from 'commander';
import { develop } from './dev/develop.js';
import { run } from './dev/run.js';
import { build } from './dev/build.js';

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
        build();
        console.log('Build finished.');
    });

program
    .command('run')
    .description('Run the built application code in the target folder.')
    .action(() => {
        run();
    });

program.parse(process.argv);