import { buildOriginCheckerFunction } from '../../helpers.js';
import { runFetch } from '../../workers/index.js';

export function wrapHono(app, root, options = {}) {

  root.setRateLimit({ disabled: true });
  root.setDisableHtmlCompression();

  let allowedOriginChecker = buildOriginCheckerFunction(options.allowedOrigins);

  app.get('*', async (c) => {
    let req = c.req;

    return runFetch(req, root, allowedOriginChecker);
  });
}