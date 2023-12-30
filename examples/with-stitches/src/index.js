import { useState, createRoot } from "seniman";
import { serve } from "seniman/server";
import { Style } from 'seniman/head';
import fs from "fs";
import { css, getCssText } from "./stitches.config.js";

let normalizeCssText = fs.readFileSync(
  "./node_modules/normalize.css/normalize.css",
  "utf8"
);

let buttonStyle = css({
  lineHeight: "1.2",
  borderRadius: 10,
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

function App() {

  let [getCount, setCount] = useState(0);
  let onAddClick = () => setCount((count) => count + 1);
  let onSubtractClick = () => setCount((count) => count - 1);

  return (
    <div>
      <Style text={normalizeCssText} />
      <Style text={getCssText()} />
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
    </div>
  );
}

let root = createRoot(App);
serve(root, 3002);
