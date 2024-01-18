# Trello <> Seniman

A Trello clone app built with Seniman, Tailwind CSS for styling, and Cloudflare Workers for deployment.

All rendering including task reordering while dragging are driven by the server in realtime via WebSocket. All data access are delayed by 10ms to simulate DB calls.

Live instance at: [trello.examples.seniman.dev](https://trello.examples.seniman.dev)

https://github.com/senimanjs/seniman/assets/510503/b59a7c47-3997-407b-983e-4c843b98fe35


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

Copy the sample data `data.json` into `dist/data.json`:

```bash
cp src/data.json dist
```

Run the Tailwind  command on another terminal to start the Tailwind CSS compiler on watch mode:
```bash
npx tailwindcss -i ./src/style.css -o ./dist/style.txt --watch --minify
```

###### Note: we're using .txt extension for the CSS output file so we can read it within Cloudflare Workers & inject it into the `<Style>` tag.

Lastly, run the following command to start the development server:

```bash
npx wrangler dev
```

## Deployment

Run the following command to deploy the app to CloudFlare Workers with its free tier:

```bash
npx wrangler deploy
```

You might be asked to login to your Cloudflare account if you haven't already.
