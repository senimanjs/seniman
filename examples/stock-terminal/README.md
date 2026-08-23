# Northstar Markets

A Bloomberg-inspired live market terminal built with Seniman. A single shared
market feed updates quotes for every connected window, while each stock row
subscribes only to its own symbol.

This example demonstrates:

- server-driven live updates;
- shared-data fanout across windows;
- fine-grained reactive table rows;
- window-specific watchlists and sorting;
- sustained output suitable for exercising Seniman's ACK and page recycling.

```bash
npm install
npm run typecheck
npm run dev
```

Open [http://localhost:3025](http://localhost:3025).

For local concurrency tests, explicitly disable the per-IP creation limiter:

```bash
LOAD_TEST=1 npm start
```
