export function createWebSocketServerOptions(options = {}) {
  return {
    noServer: true,
    perMessageDeflate:
      options.perMessageDeflate === true
        ? {
            serverNoContextTakeover: true,
            clientNoContextTakeover: true,
            threshold: 1024,
            concurrencyLimit: 10,
            zlibDeflateOptions: {
              level: 3,
              memLevel: 7,
            },
          }
        : false,
  };
}
