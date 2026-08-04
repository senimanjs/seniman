import assert from 'node:assert/strict';
import test from 'node:test';
import { createConfig } from '../dist/config.js';
import { createRoot } from '../dist/window_manager.js';

test('createConfig returns Seniman defaults', () => {
  let config = createConfig({});

  assert.equal(config.enableCrawlerRenderer, false);
  assert.equal(config.maxInputEventBufferSize, 65536);
  assert.equal(config.rateLimitWindowInputThreshold, 32);
});

test('createConfig resolves values from the supplied environment', () => {
  let config = createConfig({
    SENIMAN_ENABLE_CRAWLER_RENDERER: '1',
    SENIMAN_MAX_INPUT_EVENT_BUFFER_SIZE: '2048',
    SENIMAN_RATELIMIT_WINDOW_INPUT_THRESHOLD: '12',
  });

  assert.equal(config.enableCrawlerRenderer, true);
  assert.equal(config.maxInputEventBufferSize, 2048);
  assert.equal(config.rateLimitWindowInputThreshold, 12);
});

test('createRoot configures itself from process.env', () => {
  let previousValue = process.env.SENIMAN_ENABLE_CRAWLER_RENDERER;

  try {
    process.env.SENIMAN_ENABLE_CRAWLER_RENDERER = '1';

    let root = createRoot(() => null);

    assert.equal(root.config.enableCrawlerRenderer, true);
    assert.equal(root.crawlerRenderingEnabled, true);
  } finally {
    if (previousValue == null) {
      delete process.env.SENIMAN_ENABLE_CRAWLER_RENDERER;
    } else {
      process.env.SENIMAN_ENABLE_CRAWLER_RENDERER = previousValue;
    }
  }
});

test('root configuration preserves a disabled rate limiter', () => {
  let root = createRoot(() => null);

  root.setRateLimit({ disabled: true });
  let messageLimiter = root.messageLimiter;
  let windowCreationLimiter = root.windowCreationLimiter;

  root.configure({
    SENIMAN_ENABLE_CRAWLER_RENDERER: '1',
    SENIMAN_RATELIMIT_WINDOW_INPUT_THRESHOLD: '12',
  });

  assert.equal(root.rateLimitDisabled, true);
  assert.equal(root.messageLimiter, messageLimiter);
  assert.equal(root.windowCreationLimiter, windowCreationLimiter);
  assert.equal(root.crawlerRenderingEnabled, true);
});
