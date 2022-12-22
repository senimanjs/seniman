import { runFullBuild } from '../compiler/build.js';

export async function build() {
    await runFullBuild();
}