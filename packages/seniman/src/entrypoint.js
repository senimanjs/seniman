import { buildOriginCheckerFunction } from './helpers.js';

function getRequestContext(request, runtime = {}) {
  let headers = request.headers;
  let forwardedProtocol = headers.get('x-forwarded-proto');
  let url = new URL(request.url);

  return {
    url: request.url,
    headers,
    ipAddress: runtime.ipAddress ||
      headers.get('x-forwarded-for') ||
      headers.get('CF-Connecting-IP'),
    isSecure: forwardedProtocol
      ? forwardedProtocol === 'https'
      : url.protocol === 'https:',
    auxContext: runtime.context || null,
  };
}

export function createCoreEntrypoint(root, options = {}) {
  let allowedOriginChecker = buildOriginCheckerFunction(
    options.allowedOrigins
  );

  function configure(runtime) {
    if (runtime?.env != null) {
      root.configure(runtime.env);
    }
  }

  function accepts(request) {
    return allowedOriginChecker(request.headers.get('Origin'));
  }

  async function render(request, runtime = {}) {
    configure(runtime);

    return root.getHtmlResponse(
      getRequestContext(request, runtime)
    );
  }

  return {
    accepts,
    render,

    async fetch(request, runtime = {}) {
      let response = await render(request, runtime);

      return new Response(response.body, {
        status: response.statusCode,
        headers: response.headers,
      });
    },

    connect(request, socket, runtime = {}) {
      if (!accepts(request)) {
        return false;
      }

      configure(runtime);

      let requestContext = getRequestContext(request, runtime);
      root.applyNewConnection(
        socket,
        requestContext,
        requestContext.auxContext
      );
      return true;
    },
  };
}
