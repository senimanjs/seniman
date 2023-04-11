import express from 'express';
import { wrapExpress } from 'seniman/express';
import { Style } from 'seniman/head';

let app = express();
wrapExpress(app, { Body });

let port = process.env.PORT || 3002;
app.listen(port);

console.log('Listening on port', port);

const cssText = `
body {
  padding: 0;
  margin: 0;
  font-family: sans-serif;
  padding: 10px;
}
`;

function Body() {
  return <div>
    <Style text={cssText} />
    <div>Hello World</div>
  </div>;
}