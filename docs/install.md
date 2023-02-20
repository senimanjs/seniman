# Installation

Within each project that depends on Seniman, install the Seniman package with:
  
```bash
npm install seniman
```

You also need to install the Babel packages for JSX compilation:
  
```bash
npm install --save @babel/cli babel-plugin-seniman
```  

Then, add the following to your `babel.config.json`:
  
```json
{
  "plugins": [
    "seniman"
  ]
}
```

Your project is now ready to use Seniman. Next, let's start looking at a Hello World application at the [next article](/docs/hello-world).