import { throwLegacyEntrypointError } from '../legacy-entrypoint.js';

export function wrapExpress() {
  throwLegacyEntrypointError('seniman/express', 'seniman/node');
}
