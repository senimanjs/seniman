import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot, _createBlock, _declareBlock } from '../dist/index.js';

function declareTokenFiller(group) {
  let attributes = {};

  for (let index = 0; index < 60; index++) {
    attributes[`data-token-${group}-${index}`] = '';
  }

  return _declareBlock({
    v: '2.0',
    root: { type: 'div', attributes, children: [] }
  });
}

test('dynamic attributes can reference global token IDs above 255', async () => {
  let fillerTemplateIds = Array.from({ length: 5 }, (_, group) =>
    declareTokenFiller(group)
  );
  let dynamicTemplateId = _declareBlock({
    v: '2.0',
    root: { type: 'div', target: true, attributes: {}, children: [] }
  });
  let wrapperTemplateId = _declareBlock({
    v: '2.0',
    root: {
      type: 'main',
      attributes: {},
      children: Array.from({ length: 6 }, () => ({ type: '$anchor' }))
    }
  });

  function App() {
    let blocks = fillerTemplateIds.map(templateId =>
      _createBlock(templateId, null, null, null, null, null)
    );

    blocks.push(_createBlock(
      dynamicTemplateId,
      null,
      null,
      [{
        targetId: 255,
        effectFn(elRef) {
          elRef.setAttribute('data-specialized-status', 'ready');
        }
      }],
      null,
      null
    ));

    return _createBlock(
      wrapperTemplateId,
      blocks,
      null,
      null,
      null,
      null
    );
  }

  let root = createRoot(App);
  root.configure({ SENIMAN_ENABLE_CRAWLER_RENDERER: '1' });

  let response = await root.getHtmlResponse({
    url: '/',
    headers: new Headers({ 'user-agent': 'Googlebot' }),
    ipAddress: '127.0.0.1',
    isSecure: false,
  });

  assert.match(response.body, /data-specialized-status="ready"/);
});
