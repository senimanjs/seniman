# Installation

Initialize a new `npm` project in a folder of your choice:

```bash
npm init
```

Then, install the `seniman` package with:
  
```bash
npm install seniman
```

Seniman uses Babel to compile JSX code. Install Babel's core and CLI packages:
  
```bash
npm install --save-dev @babel/core@^7 @babel/cli@^7
```  

Add the following to your project's `package.json` since the examples used here mostly use ES6 imports:

```json
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

## TypeScript and TSX

The Seniman Babel plugin understands TypeScript syntax, but project-wide type
erasure remains the responsibility of the surrounding build. For a Babel build,
install Babel's TypeScript preset:

```bash
npm install --save-dev @babel/preset-typescript@^7 typescript
```

Add the preset without changing the Seniman plugin entry:

```json
{
  "plugins": [
    "seniman/babel"
  ],
  "presets": [
    "@babel/preset-typescript"
  ]
}
```

Include TypeScript extensions when invoking the Babel CLI:

```bash
npx babel src --out-dir dist --extensions .js,.jsx,.ts,.tsx
```

Type annotations inside `$c` functions are erased by the Seniman compiler
before those functions are serialized for the browser. Type annotations in the
rest of the module are handled by `@babel/preset-typescript`. Babel performs
syntax transformation only; use the TypeScript compiler separately when type
checking is required. Seniman includes its own public API and JSX declaration
files, so no separate `@types/seniman` package is needed.
