# Installation

Within each project that depends on Seniman, install the Seniman package with:
  
```bash
npm install seniman
```

You also need to install the Babel packages for JSX compilation:
  
```bash
npm install --save-dev @babel/cli @babel/plugin-syntax-jsx 
```  


Add the following to your project's `package.json` since the examples used here mostly use ES6 imports:

```js
  "type": "module"
```

Then, add the following to your `babel.config.json`:
  
```json
{
  "plugins": [
    "seniman/babel"
  ]
}
```

Your project is now ready to use Seniman. Next, let's start looking at a Hello World application at the [next article](/docs/hello-world).