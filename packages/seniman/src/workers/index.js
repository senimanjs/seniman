import { createRoot } from '../window_manager.js';

import htmlBuffer from "../frontend-bundle/index.html";
import { buildOriginCheckerFunction } from '../helpers.js';

const htmlBuffers = {
  uncompressed: Buffer.from(htmlBuffer)
};

export function createServer(root, options = {}) {

  // check if root is the old { Body } parameter
  // if yes, then ask to wrap it in createRoot before passing it in
  if (typeof root == "object" && root.Body) {
    console.log(`
    Calling createServer({ Body }) is deprecated in seniman@0.0.133. 
    Please wrap your root component in createRoot(Body) from the \`seniman\` package before passing it to createServer(root).
    We've wrapped it internally for you in this version.
    `);

    root = createRoot(root.Body);
  }

  root.setRateLimit({ disabled: true });

  let allowedOriginChecker = buildOriginCheckerFunction(options.allowedOrigins);

  return {
    fetch: async (req) => {
      const upgradeHeader = req.headers.get("Upgrade");
      const url = req.url;
      const headers = req.headers;
      const ipAddress = headers.get('x-forwarded-for') || headers.get('CF-Connecting-IP');

      if (upgradeHeader == "websocket") {
        if (!allowedOriginChecker(headers.get("Origin"))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const [client, websocket] = Object.values(new WebSocketPair())

        websocket.accept();

        const ws = {
          send: (data) => {
            websocket.send(data);
          },
          close: (code) => {
            websocket.close(code);
          },
          on: (event, callback) => {
            if (event === "message") {
              websocket.addEventListener(event, (e) => {
                callback(e.data);
              });
            } else if (event === "close") {
              websocket.addEventListener(event, callback);
            }
          }
        };

        root.applyNewConnection(ws, { url, headers, ipAddress, htmlBuffers });

        return new Response(null, { status: 101, webSocket: client })
      } else {
        // TODO: have the logic be configurable?
        const isSecure = req.headers.get('x-forwarded-proto') == 'https';
        const response = await root.getHtmlResponse({ url, headers, ipAddress, isSecure, htmlBuffers });;

        return new Response(response.body, { status: response.statusCode, headers: response.headers })
      }
    }
  }
}