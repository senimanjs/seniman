# seniman-with-tailwind

In this example, we'll show a simple Seniman app with Tailwind CSS for styling.

This example is very lightly adapted from Sonny Lazuardi's Budiman repository here: https://github.com/sonnylazuardi/budiman

## Prerequisites

- Node.js 16+

## Installation

Run the following command to install the dependencies:

```bash
npm install
```

## Development

Run the following command to compile the app (with watch enabled):
```bash
npx babel src --out-dir dist --watch
```

And then the following command on another terminal to start the Tailwind CSS compiler:

```bash
npx tailwindcss -i ./src/style.css -o ./dist/style.css --watch --minify
```

And then the following command on another terminal to start the development server:

```bash
npx nodemon dist/index.js
```
