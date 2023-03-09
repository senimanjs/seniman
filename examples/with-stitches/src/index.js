import { onCleanup, useState } from "seniman";
import { createServer } from "seniman/server";
import fs from "fs";
import { css, getCssText } from "./stitches.config.js";

let normalizeCssText = fs.readFileSync(
  "./node_modules/normalize.css/normalize.css",
  "utf8"
);

let buttonStyle = css({
  lineHeight: "1.2",
  borderRadius: 8,
  fontWeight: "bold",
  fontFamily: "$mono",
  padding: "$2",
  minWidth: 36,
  defaultVariants: {
    variant: "primary",
  },
  variants: {
    variant: {
      primary: {
        backgroundColor: "$teal400",
        color: "$white",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "$teal500",
        "&:hover": {
          backgroundColor: "$teal500",
          borderColor: "$teal600",
        },
        "&:active": {
          backgroundColor: "$teal600",
          borderColor: "$teal700",
        },
      },
      secondary: {
        backgroundColor: "$pink400",
        color: "$white",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "$pink500",
        "&:hover": {
          backgroundColor: "$pink500",
          borderColor: "$pink600",
        },
        "&:active": {
          backgroundColor: "$pink600",
          borderColor: "$pink700",
        },
      },
    },
  },
});

let containerStyle = css({
  margin: "$2",
});

let textStyle = css({
  fontFamily: "$mono",
  fontSize: "$md",
});

function Body() {
  let [getCount, setCount] = useState(0);

  let onAddClick = () => setCount((count) => count + 1);
  let onSubtractClick = () => setCount((count) => count - 1);

  return (
    <div class={containerStyle()}>
      <div>
        <span class={textStyle()}>Count: {getCount()}</span>
      </div>
      <button class={buttonStyle()} onClick={onAddClick}>
        +
      </button>
      <button
        class={buttonStyle({ variant: "secondary" })}
        onClick={onSubtractClick}
      >
        -
      </button>
    </div>
  );
}

// create a central place to store the stitches output,
// and check for changes every 500ms -- since it will change as users / developer interacts with the app
let lastCssText = getCssText();
let subscribers = new Set();
let timeInterval = process.env.TIME_INTERVAL || 200;

setInterval(() => {
  // time perf
  let currentCssText = getCssText();
  if (currentCssText !== lastCssText) {
    lastCssText = currentCssText;
    // notify subscribers
    subscribers.forEach((subscriber) => subscriber(currentCssText));
  }
}, timeInterval);

function subscribeForCssText(fn) {
  fn(lastCssText);
  subscribers.add(fn);

  // unsubscribe
  return () => {
    if (subscribers.remove) {
      subscribers = subscribers.remove(fn);
    }
  };
}

function useStitchesCss() {
  let [stitchesCss, setStitchesCss] = useState(getCssText());
  let unsubscribe = subscribeForCssText((cssText) => setStitchesCss(cssText));

  onCleanup(() => {
    unsubscribe();
  });

  return stitchesCss;
}

function Head() {
  let cssText = useStitchesCss();
  return (
    <>
      <style>{normalizeCssText}</style>
      <style>{cssText()}</style>
    </>
  );
}

let server = createServer({ Body, Head });

server.listen(3002);
