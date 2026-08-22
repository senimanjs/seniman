export type MaybeReactive<T> = T | (() => T);

export type SenimanNode =
  | JSX.Element
  | string
  | number
  | boolean
  | null
  | undefined
  | SenimanNode[]
  | (() => SenimanNode)
  | Sequence;

export type Component<P = Record<string, never>> = (props: P) => SenimanNode;
export type Accessor<T> = () => T;
export type Setter<T> = (value: T | ((previous: T) => T)) => void;
export type Equality<T> = false | ((previous: T, next: T) => boolean);
export interface ReactiveOptions<T> {
  equals?: Equality<T>;
}

export interface Scope {
  windowId: number;
  node: unknown;
}

export interface Context<T> {
  readonly id: symbol;
  readonly Provider: Component<{ value: T; children?: SenimanNode }>;
}

export interface ClientFunction<Args extends unknown[] = unknown[], Result = unknown> {
  readonly clientFnId: number;
  readonly serverBindFns?: unknown[] | (() => unknown[]);
  readonly __args?: Args;
  readonly __result?: Result;
}

export interface Handler<Args extends unknown[] = unknown[], Result = unknown> {
  readonly type: 'handler';
  readonly id: number;
  readonly __args?: Args;
  readonly __result?: Result;
}

export interface Ref<T = HTMLElement> {
  readonly type: 'ref';
  readonly id: number;
  readonly __element?: T;
}

export interface Channel<T = unknown> {
  readonly type: 'channel';
  readonly id: number;
  send(value: T): void;
}

export interface ClientLocation {
  readonly host: string;
  readonly hostname: string;
  readonly origin: string;
  readonly protocol: string;
  readonly port: string;
  readonly href: Accessor<string>;
  readonly pathname: Accessor<string>;
  readonly search: Accessor<string>;
  readonly searchParams: Accessor<URLSearchParams>;
  setHref(href: string): void;
}

export interface ClientContext {
  readonly viewportSize: Accessor<{ width: number; height: number }>;
  readonly visualViewport: Accessor<{
    width: number;
    height: number;
    offsetLeft: number;
    offsetTop: number;
    scale: number;
  } | null>;
  readonly history: {
    pushState(href: string): void;
    replaceState(href: string): void;
  };
  readonly location: ClientLocation;
  cookie(key: string): Accessor<string | null>;
  setCookie(key: string, value: string, expirationTime?: Date): void;
  exec(clientFunction: ClientFunction): void;
  /** @deprecated Use `location.pathname()` instead. */
  path(): string;
  /** @deprecated Use `location.setHref()` instead. */
  navigate(href: string): void;
}

export interface HtmlResponse {
  statusCode: number;
  headers: Record<string, string | number>;
  body: string | Uint8Array;
}

export interface RequestHeaders {
  get(name: string): string | null;
}

export interface RequestContext {
  url: string;
  headers: RequestHeaders;
  ipAddress?: string;
  isSecure: boolean;
  auxContext?: unknown;
}

export interface Root<Environment = Record<string, unknown>> {
  hasWindow(windowId: number): boolean;
  setRateLimit(options: { disabled: boolean }): void;
  setDisableHtmlCompression(): void;
  configure(environment?: Environment | null): void;
  getHtmlResponse(context: RequestContext): Promise<HtmlResponse>;
  renderHtml(context: {
    headers: RequestHeaders;
    href: string;
    auxContext?: unknown;
  }): Promise<string>;
  disconnectWindow(windowId: number): void;
}

export class Sequence {
  readonly id: number;
  readonly nodes: unknown[];
  remove(index: number, count: number): void;
  push(...items: SenimanNode[]): number;
  insert(index: number, ...items: SenimanNode[]): number;
  reset(): void;
}

export interface Collection<T> {
  readonly length: number;
  readonly items: T[];
  readonly Loop: Component<{ fn: (item: Accessor<T>) => SenimanNode }>;
  indexOf(item: T): number;
  findIndex(predicate: (item: T, index: number, items: T[]) => unknown): number;
  find(predicate: (item: T, index: number, items: T[]) => unknown): T | undefined;
  remove(index: number, count: number): void;
  unshift(...items: T[]): void;
  push(...items: T[]): void;
  splice(index: number, deletionCount: number, ...items: T[]): void;
  filter(predicate: (item: T, index: number, items: T[]) => unknown): T[];
  reset(): void;
  set(index: number, value: T | ((previous: T) => T)): void;
  size(): number;
  view(render: (item: T) => SenimanNode): JSX.Element;
  map(render: (item: Accessor<T>) => SenimanNode): JSX.Element;
}

export interface ClientModule<T = unknown> {
  readonly type: 'module';
  readonly id: number;
  readonly clientFn: ClientFunction;
}

export function useState<T>(
  initialValue: T,
  options?: ReactiveOptions<T>
): [Accessor<T>, Setter<T>];
export function useMemo<T>(
  fn: (previous: T | undefined) => T,
  initialValue?: T,
  options?: ReactiveOptions<T>
): Accessor<T>;
export function useEffect<T = undefined>(fn: (previous: T) => T, value?: T): void;
export function useDisposableEffect<T = undefined>(
  fn: (previous: T) => T,
  value?: T
): (onComplete?: () => void) => void;
export function onCleanup(fn: () => void): void;
export function onDispose(fn: () => void): void;
export function untrack<T>(fn: () => T): T;
export function useCallback<Result>(
  fn: (...args: any[]) => Result
): (...args: any[]) => Result | undefined;
export function createContext<T>(defaultValue: T): Context<T>;
export function createContext<T = undefined>(): Context<T | undefined>;
export function useContext<T>(context: Context<T>): T;
export function getActiveNode(): unknown;
export function getActiveScope(): Scope;
export function runInScope<T>(scope: Scope, fn: () => T): void;

export function useWindow(): ClientContext;
export function useClient(): ClientContext;
export function createHandler<Result>(
  fn: (...args: any[]) => Result
): Handler<any[], Result>;
export function createChannel<T = unknown>(): Channel<T>;
export function createRef<T = HTMLElement>(): Ref<T>;
export function createSequence(items?: SenimanNode[]): Sequence;
export function createCollection<T = any>(initialItems?: readonly T[]): Collection<T>;
export function createModule<T>(clientFunction: ClientFunction<any[], T>): ClientModule<T>;
export function createRoot<Environment = Record<string, unknown>>(
  root: () => SenimanNode
): Root<Environment>;

export function withValue<Args extends unknown[], Result>(
  handler: Handler<Args, Result> | ((value: string) => Result)
): ClientFunction;
export function preventDefault<Args extends unknown[], Result>(
  handler: Handler<Args, Result> | (() => Result)
): ClientFunction;
export const Anchor: Component<{
  href: string;
  style?: JSX.CSSProperties;
  class?: string;
  onClick?: (href: string) => boolean | void;
  children?: SenimanNode;
}>;

export function _declareBlock(definition: unknown): void;
export function _declareClientFunction(definition: unknown): void;
export function _createBlock(...args: unknown[]): unknown;
export function _createComponent<P>(component: Component<P>, props: P): unknown;

export const MAX_INPUT_EVENT_BUFFER_SIZE: number;

declare global {
  function $c(fn: (...args: any[]) => any): ClientFunction<any[], any>;
  function $s<Args extends unknown[], Result>(
    value: Handler<Args, Result>
  ): (...args: Args) => Result;
  function $s<T extends globalThis.Element>(value: Ref<T>): { get(): T };
  function $s<T>(value: ClientModule<T>): T;
  function $s<T>(value: T): T;

  namespace JSX {
    type Element = { readonly __senimanElement?: never };
    type ElementType =
      | keyof IntrinsicElements
      | ((props: any) => SenimanNode);
    type EventHandler =
      | ((event: any) => unknown)
      | Handler
      | ClientFunction;

    interface ElementChildrenAttribute {
      children: {};
    }

    interface CSSProperties {
      [property: string]: MaybeReactive<string | number | null | undefined>;
    }

    interface IntrinsicAttributes {
      children?: SenimanNode;
    }

    interface IntrinsicElements {
      [elementName: string]: {
        children?: SenimanNode;
        class?: MaybeReactive<string | undefined>;
        classList?: MaybeReactive<Record<string, boolean>>;
        style?: MaybeReactive<CSSProperties>;
        ref?: Ref | ((element: globalThis.Element) => void);
        onMount?: (() => void) | ClientFunction;
        onClick?: EventHandler;
        onFocus?: EventHandler;
        onBlur?: EventHandler;
        onChange?: EventHandler;
        onScroll?: EventHandler;
        onKeyDown?: EventHandler;
        onKeyUp?: EventHandler;
        onMouseEnter?: EventHandler;
        onMouseLeave?: EventHandler;
        onLoad?: EventHandler;
        onUnload?: EventHandler;
        onDragStart?: EventHandler;
        onDrag?: EventHandler;
        onDragEnd?: EventHandler;
        onDragEnter?: EventHandler;
        onDragLeave?: EventHandler;
        onDragOver?: EventHandler;
        onDrop?: EventHandler;
        onContextMenu?: EventHandler;
        onMouseMove?: EventHandler;
        onMouseDown?: EventHandler;
        onMouseUp?: EventHandler;
        onSubmit?: EventHandler;
        onPaste?: EventHandler;
        onWheel?: EventHandler;
        [attributeName: string]: unknown;
      };
    }
  }
}
