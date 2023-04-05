import { useContext, createContext, useState, useWindow, useEffect, useMemo, untrack, createHandler } from "../index.js";

/**
 *
 * a Router that can resolve a path to a route name and extracted params.
 *
 * Sample usage:
 *
 * let router = new Router();
 *
 * router.defineRoute({name: "productDetail", path: "/product/:id"});
 *
 *
 * let route = router.resolve("/product/123");
 *
 * // route has the following properties:
 *  {
 *     name: "productDetail",
 *     params: {
 *     id: "123"
 *  }
 * }
 */

// TODO: move this to seniman
function on(deps, fn, options) {
  var isArray = Array.isArray(deps);
  var prevInput;
  var defer = options && options.defer;
  return function (prevValue) {
    var input;
    if (isArray) {
      input = Array(deps.length);
      for (var i = 0; i < deps.length; i++)
        input[i] = deps[i]();
    }
    else
      input = deps();
    if (defer) {
      defer = false;
      return undefined;
    }
    var result = untrack(function () { return fn(input, prevInput, prevValue); });
    prevInput = input;
    return result;
  };
}

// TODO: move this to seniman
class Router {

  constructor(routes, window, startPath) {

    this.routes = routes.validRoutes;
    this.notFoundRoute = routes.notFoundRoute;
    this.window = window;

    let startRoute = this.resolve(startPath);

    let [activeComponent, setActiveComponent] = useState(startRoute.component);
    let [params, setActiveParams] = useState(startRoute.params);
    let [queryString, setActiveQueryString] = useState(startRoute.queryString);

    this.activeComponent = activeComponent;
    this.params = params;
    this.queryString = useMemo(() => new URLSearchParams(queryString()));

    // use `on` to defer the effect so it is not called on the first render
    useEffect(on(window.path, (path) => {
      let route = this.resolve(path);

      setActiveComponent(() => route.component);
      setActiveParams(route.params);
      setActiveQueryString(route.queryString);
    }, { defer: true }));
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

    //console.log('queryStringObject', queryStringObject);

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
    this.window.clientExec($c(() => window.history.back()));
  }

  pushTo(href) {
    this.window.navigate(href);
  }

  push(routeName, params, queryString) {
    let href = this.generatePath(routeName, params, queryString);

    this.window.navigate(href);
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

let RouterContext = createContext(null);

export let RouterProvider = (props) => {
  let window = useWindow();
  let router = new Router(props.routing, window, window.path());

  return <RouterContext.Provider value={router}>
    {props.children}
  </RouterContext.Provider>;
}

export function useRouter() {
  return useContext(RouterContext);
}

export function Link(props) {
  let router = useRouter();

  let onClick = createHandler(() => {
    if (props.onClick) {
      props.onClick();
    }

    if (props.to) {
      router.pushTo(props.to);
    } else {
      router.push(props.name, props.params, props.queryString);
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
    $s(onClick)();
  })} class={props.class}>{props.children}</a>;
}

export function RouterRoot(props) {
  return <RouterProvider routing={props.routing}>
    {() => {
      let router = useRouter();
      let Component = router.activeComponent();

      return <Component router={router} />;
    }}
  </RouterProvider>
}