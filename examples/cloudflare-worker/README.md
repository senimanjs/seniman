# Seniman @ Cloudflare Workers

In this example, we'll show you how to deploy a simple Seniman app to Cloudflare Workers.

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
npx wrangler dev
```

## Deployment

Run the following command to deploy the app to CloudFlare Workers:

```bash
npx wrangler deploy
```

You might be asked to login to your Cloudflare account if you haven't already.