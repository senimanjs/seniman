function readConfigValue(env, key, defaultValue) {
  if (env && env[key] != null) {
    return env[key];
  }

  // Cloudflare Service Worker syntax exposes bindings on globalThis.
  if (globalThis[key] != null) {
    return globalThis[key];
  }

  return defaultValue;
}

function readConfigValueAsInt(env, key, defaultValue) {
  let value = readConfigValue(env, key, defaultValue);

  if (value) {
    return parseInt(value, 10);
  }

  return value;
}

export function createConfig(env = null) {
  let rssLowMemoryThreshold = readConfigValueAsInt(env, "SENIMAN_RSS_LOW_MEMORY_THRESHOLD", 0);

  return Object.freeze({
    rssLowMemoryThreshold,
    rssLowMemoryThresholdEnabled: rssLowMemoryThreshold > 0,
    maxUnacknowledgedOutputBytes: readConfigValueAsInt(env, "SENIMAN_MAX_UNACKNOWLEDGED_OUTPUT_BYTES", 256 * 1024),
    maxUnacknowledgedPublications: readConfigValueAsInt(env, "SENIMAN_MAX_UNACKNOWLEDGED_PUBLICATIONS", 256),
    // Amortize acknowledgement traffic while keeping finalized 8 KiB pages
    // moving back to the shared pool in four-page batches.
    recyclingAcknowledgementBytes: readConfigValueAsInt(env, "SENIMAN_RECYCLING_ACKNOWLEDGEMENT_BYTES", 4 * 8 * 1024),
    maxRetainedOutputBytes: readConfigValueAsInt(env, "SENIMAN_MAX_RETAINED_OUTPUT_BYTES", 256 * 1024 * 1024),
    outputStallTimeoutMs: readConfigValueAsInt(env, "SENIMAN_OUTPUT_STALL_TIMEOUT_MS", 30 * 1000),
    outputPressureGraceMs: readConfigValueAsInt(env, "SENIMAN_OUTPUT_PRESSURE_GRACE_MS", 5 * 1000),
    windowMaintenanceTickMs: readConfigValueAsInt(env, "SENIMAN_WINDOW_MAINTENANCE_TICK_MS", 250),
    staleOutputAcknowledgementMs: readConfigValueAsInt(env, "SENIMAN_STALE_OUTPUT_ACKNOWLEDGEMENT_MS", 30 * 1000),
    idleProbeIntervalMs: readConfigValueAsInt(env, "SENIMAN_IDLE_PROBE_INTERVAL_MS", 60 * 1000),
    idleProbeJitterMs: readConfigValueAsInt(env, "SENIMAN_IDLE_PROBE_JITTER_MS", 15 * 1000),
    idleProbeTimeoutMs: readConfigValueAsInt(env, "SENIMAN_IDLE_PROBE_TIMEOUT_MS", 10 * 1000),
    disconnectedWindowDestroyMs: readConfigValueAsInt(env, "SENIMAN_DISCONNECTED_WINDOW_DESTROY_MS", 60 * 1000),
    rateLimitWindowInputThreshold: readConfigValueAsInt(env, "SENIMAN_RATELIMIT_WINDOW_INPUT_THRESHOLD", 32),
    rateLimitWindowInputTtlSeconds: readConfigValueAsInt(env, "SENIMAN_RATELIMIT_WINDOW_INPUT_TTL_SECONDS", 2),
    maxInputEventBufferSize: readConfigValueAsInt(env, "SENIMAN_MAX_INPUT_EVENT_BUFFER_SIZE", 65536),
    rateLimitWindowCreationThreshold: readConfigValueAsInt(env, "SENIMAN_RATELIMIT_WINDOW_CREATION_THRESHOLD", 8),
    rateLimitWindowCreationTtlSeconds: readConfigValueAsInt(env, "SENIMAN_RATELIMIT_WINDOW_CREATION_TTL_SECONDS", 1),
    enableCrawlerRenderer: readConfigValueAsInt(env, "SENIMAN_ENABLE_CRAWLER_RENDERER", 0) == 1,
  });
}

let processEnv = globalThis.process && globalThis.process.env;
const defaultConfig = createConfig(processEnv);

// Preserve the existing named exports for compatibility.
export const RSS_LOW_MEMORY_THRESHOLD = defaultConfig.rssLowMemoryThreshold;
export const RSS_LOW_MEMORY_THRESHOLD_ENABLED = defaultConfig.rssLowMemoryThresholdEnabled;
export const MAX_UNACKNOWLEDGED_OUTPUT_BYTES = defaultConfig.maxUnacknowledgedOutputBytes;
export const MAX_UNACKNOWLEDGED_PUBLICATIONS = defaultConfig.maxUnacknowledgedPublications;
export const MAX_RETAINED_OUTPUT_BYTES = defaultConfig.maxRetainedOutputBytes;
export const OUTPUT_STALL_TIMEOUT_MS = defaultConfig.outputStallTimeoutMs;
export const OUTPUT_PRESSURE_GRACE_MS = defaultConfig.outputPressureGraceMs;

if (RSS_LOW_MEMORY_THRESHOLD_ENABLED) {
  console.log('RSS_LOW_MEMORY_THRESHOLD enabled: ', RSS_LOW_MEMORY_THRESHOLD + 'MB');
}

export const RATELIMIT_WINDOW_INPUT_THRESHOLD = defaultConfig.rateLimitWindowInputThreshold;
export const RATELIMIT_WINDOW_INPUT_TTL_SECONDS = defaultConfig.rateLimitWindowInputTtlSeconds;
export const MAX_INPUT_EVENT_BUFFER_SIZE = defaultConfig.maxInputEventBufferSize;
export const RATELIMIT_WINDOW_CREATION_THRESHOLD = defaultConfig.rateLimitWindowCreationThreshold;
export const RATELIMIT_WINDOW_CREATION_TTL_SECONDS = defaultConfig.rateLimitWindowCreationTtlSeconds;
export const ENABLE_CRAWLER_RENDERER = defaultConfig.enableCrawlerRenderer;
