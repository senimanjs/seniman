# Styling with Tailwind

Since Seniman uses basic HTML & CSS techniques to style your elements, you can use any CSS framework to style your elements. In this guide, we'll cover how to use [Tailwind CSS](https://tailwindcss.com/) with Seniman.

First, let's add the Tailwind input file. Assuming you have a `src` folder where all your components are, create a file at `src/input.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Next, let's create a `tailwind.config.cjs` file in the root of your project:

```js
module.exports = {
  content: ["./src/**/*.js", "./src/**/*.jsx"],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

Then, run the following command to generate the Tailwind CSS file every time you make changes to your components:

```bash

npx tailwindcss -i ./src/input.css -o ./dist/output.css  --watch --minify

```

Finally, we need to add the generated CSS file to our application. Open `src/index.js` (or wherever your `Head` component is) and add the following:

```js
// Load the generated Tailwind CSS file 
const tailwindCssText = fs.readFileSync('./dist/output.css', 'utf8');

function Head() {
  return <>
    ...
    <style>{tailwindCssText}</style>
  </>;
}
```

This will load the generated Tailwind CSS output into memory, and then inject it to the `<style>` tag in the `<head>` section of your application.

You are now ready to develop with Seniman and Tailwind CSS!