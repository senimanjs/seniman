import { throwLegacyEntrypointError } from '../../legacy-entrypoint.js';

export function wrapHono() {
  throwLegacyEntrypointError(
    'seniman/hono/workers',
    'seniman-cloudflare'
  );
}
