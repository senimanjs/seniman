# Seniman Google Sign-In Integration 

In this example, we'll show you a log-in flow using Google Sign-In in Seniman -- supported by a small session abstraction layer on top of Seniman's `client.cookie()` API, Client Functions, and JWT.

## Prerequisites
- Node.js 16+

## Installation

Run the following command to install the dependencies:

```bash
npm install
```

## Development

Run the following command to compile the app with watch:
```bash
npx babel src --out-dir dist --watch
```

And then the following command on another terminal to start the development server:

```bash
GOOGLE_CLIENT_ID={} npx nodemon dist/index.js
```

Make sure to set the `GOOGLE_CLIENT_ID` environment variable. To get the Google client ID, you can go through the guide here: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid