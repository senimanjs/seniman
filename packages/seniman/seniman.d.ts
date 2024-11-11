declare namespace JSX {
    interface Element {}
    interface IntrinsicElements {
        [elemName: string]: any;
    }
}

declare module "seniman" {
    export interface Component<T> {
        id: string;
        props: T;
    }

    export interface History {
        pushState: (hrefString: string) => void; 
        replaceState: (hrefString: string) => void; 
    }

    export interface Location {
        host: string;
        hostname: string;
        origin: string;
        protocol: string;
        port: string;
        href: () => null;
        pathname: () => null;
        search: () => null;
        searchParams: () => null;
        setHref: (hrefString: any) => void;
    }

    export interface ClientContext {
        viewportSize: number; 
        cookie: (cookieKey: string) => string; 
        setCookie: (
            cookieKey: string,
            cookieValue: string,
            expirationTime?: Date
        ) => void;
        history: History; 
        location: Location; 
        path: () => string;
        navigate: (href: string) => void;
        exec: (clientFnSpec: { clientFnId: number; serverBindFns: Function[] }) => void;
    }
    
    export interface Window {
        id: string;
        href: string;
        viewportSize: number;
        readOffset: number;
        cookieString: string;
        client: ClientContext;
    }

    export interface Block {
        id: string;
    }

    export interface Sequence {}

    export function createRoot<T>(callback: Function): Root;

    export interface Root {
        hasWindow(windowId: string): boolean;
        setRateLimit({ disabled: boolean }): void;
        setDisableHtmlCompression(): void;
        applyNewConnections(
            ws: WebSocket,
            options: { url: string; headers: Headers; ipAddress: string }
        ): void;
        initWindow(
            ws: WebSocket,
            options: {
                windowId: string;
                href: string;
                viewportSize: number;
                readOffset: number;
                cookieString: string;
            }
        ): void;
        reconnectWindow(
            ws: WebSocket,
            options: {
                windowId: string;
                href: string;
                viewportSize: number;
                readOffset: number;
                cookieString: string;
            }
        ): void;
        setServer(server: any): void;
        getHtmlResponse(options: {
            url: string;
            headers: Headers;
            ipAddress: string;
            isSecure: boolean;
        }): Response;
        renderHtml(req: Request): Promise<any>;
        disconnectWindow(windowId: string): void;
    }

    export function createRouting(): void;

    export function useState<T>(initialState: T): [() => T, () => void];

    export function createContext<T>(): T;
    export function useContext<T>(context: T): T;

    export function useEffect(callback: Function, dependencies: Array<any>): void;
    export function useMemo<T>(callback: Function, dependencies: Array<any>): T;
    export function useDisposableEffect(callback: Function, value: any): void;
    export function useWindowId(): string;
    export function useClient(): ClientContext;
    export function useWindow(): Window;
    export function serve(root: Root, port: number): void;
}


declare module "seniman/server" {
    export function serve(root: any, port: number): void;
}

declare module "seniman/head" {
    export type StyleProps = {
        text: string;
    };
    export function Style(props: { text: string }): Component<StyleProps>;
}

declare module "seniman-mini-router" {
    export type RouterRootProps = {
        routing: Routing;
    };

    export interface Routing {
        on(path: string, name: string, callback: Function): void;
        onNotFound(component: Component<any>): void;
    }

    export function createRouting(): Routing;
    export function RouterRoot(props: {
        routing: Routing;
    }): Component<RouterRootProps>;
}
