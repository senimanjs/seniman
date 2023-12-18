# Seniman Routing & Session Example

In this example, we'll show a  Seniman app showing implementation of session management (with login and logout) and some basic routing.

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

Use `admin@admin.com` and `admin` as the username and password respectively to log in. You can add your own authentication logic on `src/index.js`.
