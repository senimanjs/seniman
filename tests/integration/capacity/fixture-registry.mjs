const fixtureLoaders = {
  'interactive-counters': () => import('./generated/interactive-counters.js'),
};

export async function loadFixture(name) {
  const loader = fixtureLoaders[name];

  if (!loader) {
    throw new Error(`Unknown capacity fixture: ${name}`);
  }

  return loader();
}
