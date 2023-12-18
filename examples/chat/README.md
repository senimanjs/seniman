# seniman-chat

In this example, we'll show a simple chat application in Seniman, built using the Collection API -- which allows for efficient rendering of large lists of items. 

Note: The API is also used to implement infinite scroll in the infinite-scroll Twitter example.

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
