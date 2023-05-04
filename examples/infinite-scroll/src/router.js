import { useContext, createContext, getActiveNode, runInNode, useState, useClient, useEffect, useMemo, untrack, useDisposableEffect, createHandler } from "seniman";
import { produce } from "immer";
import { useScroller } from "./scroller.js";

/**
 * This is a custom router that's adapted from Seniman's built-in router. 
 * To support infinite scrolling, some changes are made to the router:
 * - <Link> component that pushes last scrolling position to a "Page Stack" when clicked
 * - a Page Stack within Router that stores references to multiple live pages in the history stack 
 *   using useDisposableState (alongside its scrolling state), and maintains their lifecycle as the user navigates back and forth.
 */
class Router {

  constructor(routes, client) {
    this.routes = routes.validRoutes;
    this.notFoundRoute = routes.notFoundRoute;
    this.client = client;

    this.lastScrollPosition = null;
    this.lastScrollerRef = null;

    let [pageStack, setPageStack] = useState([]);

    this.activePage = useMemo(() => {
      let stack = pageStack();

      if (stack.length == 0) {
        return null;
      } else {
        return stack[stack.length - 1];
      }
    });

    this.activeNode = useMemo(() => {
      let page = this.activePage();

      return page?.node;
    });

    this.params = useMemo(() => {
      let page = this.activePage();

      return page?.route.params;
    });

    this.queryString = useMemo(() => {
      let page = this.activePage();

      return !!page ? new URLSearchParams(page.route.queryString) : null;
    });

    let routerCell = getActiveNode();
    let router = this;

    let createRouteNode = (route, onFinish) => {

      runInNode(routerCell, () => {
        let disposeFn = useDisposableEffect(() => {
          onFinish(<div>
            <RouterContext.Provider value={router}>
              <route.component />
            </RouterContext.Provider>
          </div>, disposeFn);
        });
      });
    }

    useEffect(() => {
      let path = client.path();
      let route = this.resolve(path);
      let _pageStack = untrack(() => pageStack());

      // check if path is the same as penultimate node in the stack
      // TODO: isBack information should probably come from core?
      let isBack = _pageStack.length > 1 && _pageStack[_pageStack.length - 2].path == path;
      let shouldPushToStack = !isBack;

      // is new route
      if (shouldPushToStack) {
        let onFinish = (node, disposeFn) => {
          let scrollPosition = this.lastScrollPosition;
          let scrollerRef = this.lastScrollerRef;

          setPageStack(produce(pageStack => {

            // update previous page's scroll position
            if (pageStack.length > 0) {
              let page = pageStack[pageStack.length - 1];
              page.scrollPosition = scrollPosition;
              page.scrollerRef = scrollerRef;
            }

            // push new page to stack
            pageStack.push({ route, path, node, disposeFn, scrollerRef: null, scrollPosition: { x: 0, y: 0 } });

            this.lastScrollPosition = { x: 0, y: 0 };
          }));
        }

        createRouteNode(route, onFinish);
      } else {

        // if it's a back action, we need to pop the current page from the stack
        let currentPage = _pageStack[_pageStack.length - 1];
        let previousPage = _pageStack[_pageStack.length - 2];

        // dispose the page tree
        currentPage.disposeFn();

        setPageStack(produce(pageStack => {
          pageStack.pop();
        }));

        // set the ref-ed element's scroll height back to lastNode.scrollPosition
        client.exec($c(() => {
          setTimeout(() => {
            let scroller = $s(previousPage.scrollerRef).get();
            scroller.scrollTop = $s(previousPage.scrollPosition.y);
          }, 0);
        }));
      }
    });

  }

  resolve(_path) {
    // split the path into the path and the query string
    let [path, queryString] = _path.split('?');

    for (const route of this.routes) {
      const match = route.regex.exec(path);
      if (match) {
        const params = this.getRouteParams(route.path, match);
        return { name: route.name, component: route.component, params, queryString };
      }
    }

    return this.notFoundRoute;
  }

  generatePath(routeName, params, queryStringObject) {
    for (const route of this.routes) {
      if (route.name === routeName) {
        let path = route.path;
        for (const key in params) {
          path = path.replace(`:${key}`, params[key]);
        }
        return this._addQueryStringToPath(path, queryStringObject);
      }
    }
  }

  _addQueryStringToPath(path, queryStringObject) {

    // check if queryString at least has one key
    if (!queryStringObject || Object.keys(queryStringObject).length == 0) {
      return path;
    }

    let queryString = '';

    for (const key in queryStringObject) {
      queryString += `${key}=${queryStringObject[key]}&`;
    }

    queryString = queryString.slice(0, -1);

    return `${path}?${queryString}`;
  }


  getRouteParams(path, match) {
    const paramRegex = /:[^/]+/g;
    const paramNames = path.match(paramRegex);
    const params = {};
    if (paramNames) {
      for (let i = 0; i < paramNames.length; i++) {
        const paramName = paramNames[i].substr(1);
        params[paramName] = match[i + 1];
      }
    }
    return params;
  }

  back() {
    this.client.exec($c(() => window.history.back()));
  }

  pushTo(href, scrollerRef, scrollPosition) {
    this.lastScrollerRef = scrollerRef;
    this.lastScrollPosition = scrollPosition;

    this.client.navigate(href);

  }

  push(routeName, params, queryString, scrollerRef, scrollPosition) {
    let href = this.generatePath(routeName, params, queryString);

    this.pushTo(href, scrollerRef, scrollPosition);
  }
}

function getRouteRegex(path) {
  const paramRegex = /:[^/]+/g;
  const routeRegex = path.replace(paramRegex, '([^/]+)');
  return new RegExp(`^${routeRegex}$`);
}

class Routing {
  constructor() {
    this.validRoutes = [];
    this.notFoundRoute = null;
  }

  on(path, name, handlerFn) {
    let route = {
      path,
      name,
      // wrap the handlerFn in a component, then pass the router instance as a parameter to the handlerFn
      component: (props) => {
        return handlerFn(props.router);
      },
      regex: getRouteRegex(path)
    };

    this.validRoutes.push(route);

    return route;
  }

  onNotFound(component) {
    this.notFoundRoute = {
      component
    };
  }
}

export function createRouting() {
  return new Routing();
}

const RouterContext = createContext(null);

export function useRouter() {
  return useContext(RouterContext);
}

export function Link(props) {
  let router = useRouter();
  let scrollerRef = useScroller();

  let onClick = createHandler((scrollX, scrollY) => {
    if (props.onClick) {
      props.onClick();
    }

    if (props.to) {
      router.pushTo(props.to, scrollerRef, { x: scrollX, y: scrollY });
    } else {
      router.push(props.name, props.params, props.queryString, scrollerRef, { x: scrollX, y: scrollY });
    }
  });

  let href = useMemo(() => {
    if (props.to) {
      return props.to;
    } else {
      return router.generatePath(props.name, props.params, props.queryString);
    }
  });

  return <a href={href()} style={props.style} onClick={$c(e => {
    e.preventDefault();

    let scroller = $s(scrollerRef).get();

    // send over element's scroll position
    $s(onClick)(scroller.scrollLeft, scroller.scrollTop);

  })} class={props.class}>{props.children}</a>;
}

export function RouterRoot(props) {
  let client = useClient();
  let router = new Router(props.routing, client);

  return <RouterContext.Provider value={router}>
    {() => {
      return router.activeNode();
    }}
  </RouterContext.Provider>;
}