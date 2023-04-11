import express from 'express';
import { wrapExpress } from 'seniman/express';

let app = express();
wrapExpress(app, { Body });

let port = process.env.PORT || 3002;
app.listen(port);

console.log('Listening on port', port);

function Body() {
  return <div>
    <div>Hello World</div>
  </div>;
}