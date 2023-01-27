import express from 'express';
import { wrapExpress } from 'seniman';
import { ErrorHandler } from './errors.js';

let app = express();

wrapExpress(app, { Head, Body });

app.listen(process.env.PORT || 3002);

function Head(props) {
  return <>
    <title>{props.window.pageTitle}</title>
    <style>{props.cssText}</style>
  </>;
}

function Body(props) {
  return <ErrorHandler syntaxErrors={props.syntaxErrors}>
    <div>
      Hello World
    </div>
  </ErrorHandler>;
}