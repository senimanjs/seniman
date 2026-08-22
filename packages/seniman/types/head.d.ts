import type { ClientFunction, Component, Context, SenimanNode, Sequence } from './index.js';

export interface HeadContextValue {
  addTitle(title: string): number;
  changeTitle(id: number, title: string): void;
  removeTitle(id: number): void;
  add(element: SenimanNode): number;
  remove(id: number): void;
}

export const HeadContext: Context<HeadContextValue | undefined>;
export function createHeadContextValue(sequence: Sequence): HeadContextValue;
export const Title: Component<{ text: string }>;
export const Style: Component<{ text: string; type?: string }>;
export const Meta: Component<{
  name?: string;
  content?: string;
  httpEquiv?: string;
  charset?: string;
}>;
export const Script: Component<{ src: string; onLoad?: ClientFunction | (() => void) }>;
export const Link: Component<{
  rel: string;
  href: string;
  type?: string;
  as?: string;
  crossorigin?: string;
  media?: string;
  onLoad?: ClientFunction | (() => void);
}>;
