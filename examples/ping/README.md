# Seniman + CloudFlare Workers + DigitalOcean Ping

Measures the latency from your local Cloudflare Workers POP to DigitalOcean's NYC3 region.

Live instance at: https://ping.examples.seniman.dev

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

Run the following command to deploy the app to CloudFlare Workers with its free tier:

```bash
npx wrangler deploy
```

You might be asked to login to your Cloudflare account if you haven't already.
