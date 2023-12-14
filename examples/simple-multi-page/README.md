## simple-multi-page

In this example, we'll show you a simple, single-file, multi-page application in Seniman -- showing you the basic core API for per-page rendering provided by Seniman.

## Prerequisites
- Node.js 16+

## Installation

Run the following command to install the dependencies:

```bash
npm install
```

## Development

Run the following command to compile the app:

```bash
npx babel src --out-dir dist
```

or with watch:
```bash
npx babel src --out-dir dist --watch
```

And then the following command on another terminal to start the development server:

```bash
node dist/index.js
```

or using nodemon:
```bash
npx nodemon dist/index.js
```