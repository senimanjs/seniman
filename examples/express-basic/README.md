# express-basic

In this example, Seniman's Node entrypoint is mounted as an Express fallback while the returned HTTP server owns WebSocket upgrades.

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

And then the following command on another terminal to start the development server:

```bash
npx nodemon dist/index.js
```
