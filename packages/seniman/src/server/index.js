import { throwLegacyEntrypointError } from '../legacy-entrypoint.js';

function removed() {
  throwLegacyEntrypointError('seniman/server', 'seniman/node');
}

export function createServer() {
  removed();
}

export function serve() {
  removed();
}
