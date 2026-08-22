import type { Root } from './index.js';

export interface EntrypointOptions {
  allowedOrigins?: readonly string[];
  perMessageDeflate?: boolean;
  [option: string]: unknown;
}

export interface EntrypointRuntime<Environment = unknown, Context = unknown> {
  env?: Environment;
  context?: Context;
  ipAddress?: string;
}

export interface CoreEntrypoint<Environment = unknown, Context = unknown> {
  accepts(request: Request): boolean;
  render(
    request: Request,
    runtime?: EntrypointRuntime<Environment, Context>
  ): Promise<import('./index.js').HtmlResponse>;
  fetch(
    request: Request,
    runtime?: EntrypointRuntime<Environment, Context>
  ): Promise<Response>;
  connect(
    request: Request,
    socket: unknown,
    runtime?: EntrypointRuntime<Environment, Context>
  ): boolean;
}

export function createCoreEntrypoint<Environment = unknown, Context = unknown>(
  root: Root<Environment>,
  options?: EntrypointOptions
): CoreEntrypoint<Environment, Context>;
