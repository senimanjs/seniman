# simple-multi-page

In this example, we'll show you a simple multi-page application in Seniman. 

This is intended to show the absolute minimum implementation of differential rendering based on the route of the page using `client.path()` API and the `Anchor` component provided by Seniman. 


```js
let pageType = useMemo(() => {
  let path = client.path();

  if (path === "/") {
    return "movies";
  } else if (path.startsWith("/movie/")) {
    console.log('Movie page');
    return "movie";
  } else {
    return "404";
  }
});

return <div>
  <Style text={cssText} />
  <div style={{ marginBottom: "10px", fontWeight: "bold" }}>Seniman</div>
  <div>
    {() => {
      // This function is re-run only when pageType changes
      let _pageType = pageType();

      switch (_pageType) {
        case "movie":
          return <MoviePage />;
        case "movies":
          return <MoviesPage />;
        default:
          return <div>404</div>;
      }
    }}
  </div>;
```


For a more full-featured approach, you can explore the [`seniman/router`](https://senimanjs.org/docs/routing) package.



## Prerequisites
- Node.js 16+

## Installation

Run the following command to install the dependencies:

```bash
npm install
```

## Development

Run the following command to compile the app:

```bash
npx babel src --out-dir dist
```

or with watch:
```bash
npx babel src --out-dir dist --watch
```

And then the following command on another terminal to start the development server:

```bash
node dist/index.js
```

or using nodemon:
```bash
npx nodemon dist/index.js
```
