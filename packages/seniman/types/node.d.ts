import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Root } from './index.js';
import type { EntrypointOptions } from './entrypoint.js';

export interface NodeEntrypoint {
  fetch(request: Request): Promise<Response>;
  request(request: IncomingMessage, response: ServerResponse): Promise<void>;
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void;
}

export function createEntrypoint(
  root: Root,
  options?: EntrypointOptions
): NodeEntrypoint;

export function serve(
  root: Root,
  port: number,
  options?: EntrypointOptions
): Server;
