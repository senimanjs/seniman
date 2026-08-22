# Seniman with Hono, Node.js, and TypeScript

This example uses Hono for Node HTTP routing and forwards the remaining HTTP and WebSocket traffic to Seniman.

Requires Node.js 20 or newer.

```bash
npm install
npm run typecheck
npm run dev
```

The app is available at [http://localhost:3002](http://localhost:3002), with a health endpoint at [http://localhost:3002/api/health](http://localhost:3002/api/health).
