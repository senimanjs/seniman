import { throwLegacyEntrypointError } from '../legacy-entrypoint.js';

function removed() {
  throwLegacyEntrypointError('seniman/workers', 'seniman-cloudflare');
}

export function useEnv() {
  removed();
}

export function runFetch() {
  removed();
}

export function serve() {
  removed();
}

export function createServer() {
  removed();
}
