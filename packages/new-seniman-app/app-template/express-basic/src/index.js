import express from 'express';
import { wrapExpress } from 'seniman/express';

let app = express();
wrapExpress(app, { Head, Body });

let port = process.env.PORT || 3002;
app.listen(port);

console.log('Listening on port', port);

const cssText = `
body,
* {
  padding: 0;
  margin: 0;
  font-family: sans-serif;
  padding: 10px;
}
`;

function Head() {
  return <>
    <style>{cssText}</style>
  </>;
}

function Body() {
  return <div>Hello World</div>;
}