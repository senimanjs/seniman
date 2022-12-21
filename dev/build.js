import { buildClientScaffolding, compileAll, compileGlobalCSS, copyPublicFiles } from './shared.js';

await compileAll({ throwErrorOnSyntaxError: true });
await buildClientScaffolding();
await copyPublicFiles();
await compileGlobalCSS();

console.log('Build finished.');