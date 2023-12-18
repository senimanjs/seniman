# Infinite Scroll Example

In this example, we'll show you an application that implements infinite scroll using Seniman. The app is a Twitter-like app that loads tweets as you scroll down the page, and maintains the scroll position as you navigate between pages.

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

And then the following command to start the development server:

```bash
npx nodemon dist/index.js
```

You can access the live instance deployed on Cloudflare Workers at https://test-scroller.garindra.workers.dev