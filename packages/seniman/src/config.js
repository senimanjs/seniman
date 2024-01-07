function readConfigValue(key, defaultValue) {
  // if in CloudFlare worker (Service Worker syntax)
  if (globalThis[key]) {
    return globalThis[key];
  } else if (process.env[key]) {
    return process.env[key];
  }

  return defaultValue;
}

function readConfigValueAsInt(key, defaultValue) {
  let value = readConfigValue(key, defaultValue);

  if (value) {
    return parseInt(value);
  }

  return value;
}

// config.js
// get ram limit from env var
export const RSS_LOW_MEMORY_THRESHOLD = readConfigValueAsInt("SENIMAN_RSS_LOW_MEMORY_THRESHOLD", 0);
export const RSS_LOW_MEMORY_THRESHOLD_ENABLED = RSS_LOW_MEMORY_THRESHOLD > 0;

if (RSS_LOW_MEMORY_THRESHOLD_ENABLED) {
  console.log('RSS_LOW_MEMORY_THRESHOLD enabled: ', RSS_LOW_MEMORY_THRESHOLD + 'MB');
}

export const RATELIMIT_WINDOW_INPUT_THRESHOLD = readConfigValueAsInt("SENIMAN_RATELIMIT_WINDOW_INPUT_THRESHOLD", 32);
export const RATELIMIT_WINDOW_INPUT_TTL_SECONDS = readConfigValueAsInt("SENIMAN_RATELIMIT_WINDOW_INPUT_TTL_SECONDS", 2);

// set default max input event buffer size to 64KB
export const MAX_INPUT_EVENT_BUFFER_SIZE = readConfigValueAsInt("SENIMAN_MAX_INPUT_EVENT_BUFFER_SIZE", 65536);
export const RATELIMIT_WINDOW_CREATION_THRESHOLD = readConfigValueAsInt("SENIMAN_RATELIMIT_WINDOW_CREATION_THRESHOLD", 8);
export const RATELIMIT_WINDOW_CREATION_TTL_SECONDS = readConfigValueAsInt("SENIMAN_RATELIMIT_WINDOW_CREATION_TTL_SECONDS", 1);

export const ENABLE_CRAWLER_RENDERER = readConfigValueAsInt("SENIMAN_ENABLE_CRAWLER_RENDERER", 0) == 1;
