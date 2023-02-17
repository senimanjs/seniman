#!/usr/bin/env node

import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import fsExtra from 'fs-extra';
import { fileURLToPath } from 'url';

inquirer.prompt([
  {
    type: "list",
    name: 'projectTemplate',
    message: "Which project template would you like to use?",
    default: "express-basic",
    choices: ["express-basic", "express-sqlite", "express-todo"]
  },
  {
    name: 'projectName',
    message: 'What is the name of your app?'
  }
]).then(async answers => {
  const projectTemplate = answers.projectTemplate;
  const appName = answers.projectName;

  console.log('Creating application', appName);
  const __dirname = path.dirname(fileURLToPath(new URL(import.meta.url)));

  await fsExtra.copy(__dirname + `/app-template/${projectTemplate}`, process.cwd() + '/' + appName);

  let packageJsonStringTemplate = await fs.promises.readFile(process.cwd() + '/' + appName + '/package.json', 'utf-8');
  let packageJsonString = packageJsonStringTemplate.replace('$APP_NAME', appName);

  await fs.promises.writeFile(process.cwd() + '/' + appName + '/package.json', packageJsonString);

  console.log('Created!');
});