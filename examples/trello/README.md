# Trello <> Seniman

In this example, we'll show you a Trello sample app built with Seniman. We use Tailwind CSS for styling & Cloudflare Workers for deployment.

Live instance at: [trello.examples.seniman.dev](https://trello.examples.seniman.dev)

<img width="835" alt="Screenshot 2024-01-17 at 4 44 19 PM" src="https://github.com/senimanjs/seniman/assets/510503/b35f432e-7ddc-4680-9e86-8937299cc2b2">

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
