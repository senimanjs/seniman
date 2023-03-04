import { useState } from "seniman";
import { createServer } from "seniman/server";
import fs from "fs";
import { css, getCssText } from "./stitches.config.js";

let normalizeCssText = fs.readFileSync("./dist/normalize.css", "utf8");

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

function Head() {
  return (
    <>
      <style>{normalizeCssText}</style>
      <style>{getCssText()}</style>
    </>
  );
}

let server = createServer({ Body, Head });

server.listen(3002);
