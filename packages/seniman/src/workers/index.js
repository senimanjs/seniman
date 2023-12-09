import { windowManager } from '../window_manager.js';

import htmlBuffer from "../frontend-bundle/index.html";

const htmlBuffers = {
  uncompressed: Buffer.from(htmlBuffer)
};

export function createServer(options) {
  windowManager.registerEntrypoint(options);

  return {
    fetch: async (req) => {
      const upgradeHeader = req.headers.get("Upgrade");
      const url = req.url;
      const headers = req.headers;
      const ipAddress = headers.get('x-forwarded-for') || headers.get('CF-Connecting-IP');

      if (upgradeHeader == "websocket") {
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

        windowManager.applyNewConnection(ws, { url, headers, ipAddress, htmlBuffers });

        return new Response(null, { status: 101, webSocket: client })
      } else {
        const response = await windowManager.getResponse({ url, headers, ipAddress, htmlBuffers });;

        return new Response(response.body, { status: response.statusCode, headers: response.headers })
      }
    }
  }
}