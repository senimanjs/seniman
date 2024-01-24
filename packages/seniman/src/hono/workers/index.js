import { buildOriginCheckerFunction } from '../../helpers.js';

// TODO: use the `fetch` in the seniman/workers package
async function fetch(req, root, allowedOriginChecker) {
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

    root.applyNewConnection(ws, { url, headers, ipAddress });

    return new Response(null, { status: 101, webSocket: client })
  } else {
    // TODO: have the logic be configurable?
    const isSecure = req.headers.get('x-forwarded-proto') == 'https';
    const response = await root.getHtmlResponse({ url, headers, ipAddress, isSecure });

    return new Response(response.body, { status: response.statusCode, headers: response.headers })
  }
}

export function wrapHono(app, root, options = {}) {

  root.setRateLimit({ disabled: true });
  root.setDisableHtmlCompression();

  let allowedOriginChecker = buildOriginCheckerFunction(options.allowedOrigins);

  app.get('*', async (c) => {
    let req = c.req;

    return fetch(req, root, allowedOriginChecker);
  });
}