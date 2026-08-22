export interface SenimanBabelPluginOptions {}

export interface SenimanBabelAPI {
  assertVersion(version: string | number): void;
}

export interface SenimanBabelPlugin {
  name?: string;
  inherits?: unknown;
  visitor?: Record<string, unknown>;
}

export default function senimanBabelPlugin(
  api: SenimanBabelAPI,
  options?: SenimanBabelPluginOptions
): SenimanBabelPlugin;
