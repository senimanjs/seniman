import { windowManager } from '../v2/window_manager.js';

export function wrapExpress(app, options) {

  windowManager.registerEntrypoint(options);

  app.get('*', async function (req, res) {
    let response = await windowManager.getResponse(req);

    if (response.statusCode) {
      res.status(response.statusCode);
    }

    res.set(response.headers);
    res.end(response.body);
  });

  // capture the existing app.listen function, and wrap it in a new function
  // that will also start the websocket server
  let oldListen = app.listen;

  app.listen = function (port, host, backlog, callback) {
    let server = oldListen.call(app, port, host, backlog, callback);
    windowManager.setServer(server);
    return server;
  }
}