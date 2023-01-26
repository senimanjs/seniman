import express from 'express';
import { wrapExpress, onCleanup, useWindow, createEffect, createSignal, createMemo } from 'seniman';
import { ErrorHandler } from './platform.js';

let app = express();

function Head(props) {
  return <>
    <title>{props.window.pageTitle}</title>
    <style>{props.cssText}</style>
    <meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1.0,user-scalable=no' />
  </>;
}

function Body(props) {
  return <ErrorHandler syntaxErrors={props.syntaxErrors}>
    <Root />
  </ErrorHandler>;
}

function Root() {
  let [realtimeCount, setRealtimeCount] = createSignal(0);
  let [reasons, setReasons] = createSignal([
    { text: "It's fast" },
    { text: "It's easy" },
    { text: "It's fun" },
  ]);

  let interval = setInterval(() => {
    setRealtimeCount(realtimeCount => realtimeCount + 1);
  }, 1000);

  onCleanup(() => {
    clearInterval(interval);
  });

  return <div style={{ padding: "20px" }}>
    <div style={{ fontSize: "24px", marginBottom: "10px" }}>Hello from Seniman!</div>
    <div>Here's something realtime: {realtimeCount}</div>

    <div style={{ paddingTop: "10px", marginTop: "10px", borderTop: "1px solid #ccc" }}>
      {reasons().map(reason => {
        return <div>{reason.text}</div>;
      })}
    </div>
  </div>;
}

await wrapExpress(app, { Head, Body });

app.listen(process.env.PORT || 3002);
