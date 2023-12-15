# simple-multi-page

In this example, we'll show you a simple multi-page application in Seniman. 

This is intended to show the absolute minimum implementation of differential rendering based on the route of the page using `client.path()` and `client.navigate()` APIs provided by Seniman. 

<img width="604" alt="Screenshot 2023-12-15 at 10 02 37 AM" src="https://github.com/senimanjs/seniman/assets/510503/d38cbe95-bd45-413d-badf-fd76679a0203">


For a more full-featured approach, you can explore the [`seniman/router`](https://senimanjs.org/docs/routing) package.



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
