# Installation

Initialize a new `npm` project in a folder of your choice:

```bash
npm init
```

Then, install the `seniman` package with:
  
```bash
npm install seniman
```

Seniman uses Babel to transpile JSX code. Install the following dev packages:
  
```bash
npm install --save-dev @babel/cli @babel/plugin-syntax-jsx 
```  

Add the following to your project's `package.json` since the examples used here mostly use ES6 imports:

```js
  "type": "module"
```

Then, create `babel.config.json` at the root of your project with the following contents:
  
```json
{
  "plugins": [
    "seniman/babel"
  ]
}
```

Your project is now ready to use Seniman. Next, let's start looking at a Hello World application at the [next page](/docs/hello-world).