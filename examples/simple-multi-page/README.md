# simple-multi-page

In this example, we'll show you a simple multi-page application in Seniman, showing basic per-route rendering logic enabled by the `client.path()` API.

<img width="225" alt="Screenshot 2023-12-14 at 8 59 15 PM" src="https://github.com/senimanjs/seniman/assets/510503/31abedd4-94a9-4c2f-818e-c8b8eada13fd">

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
