const DOCS_URL = 'https://seniman.dev/docs/references/server';

export function throwLegacyEntrypointError(entrypoint, replacement) {
  throw new Error(
    `${entrypoint} has been replaced by ${replacement}. See ${DOCS_URL}`
  );
}
