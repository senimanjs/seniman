# Event System

Events are key to building dynamic user interfaces. Seniman uses the standard browser event system for handling events in the browser -- and with the assistance of the `$c` and `$s` functions, it is possible to handle client-side events in the server, enabling us to modify our server-side UI state in response to events, among others.

We'll go through how to handle events in Seniman, and how to use the `$c` and `$s` functions to handle events in the server. 

The events themselves, however, are standard browser events. These are the browser events that Seniman currently supports:

- [`onClick`](#onclick)
- [`onFocus`](#onfocus)
- [`onBlur`](#onblur)
- [`onChange`](#onchange)
- [`onKeyDown`](#onkeydown)
- [`onKeyUp`](#onkeyup)
- [`onMouseEnter`](#onmouseenter)
- [`onMouseLeave`](#onmouseleave)

##### Note: Other standard browser events not currently listed here will shortly be supported.

Let's go through how you'd handle these event types in Seniman. Note: familiarity with [`Client Functions`](#client-functions) is helpful!


---

### onClick

Simplest `onClick` example:
```js
function MyComponent() {
  let serverClickHandler = () => {
    console.log('clicked!');
  }

  return <div onClick={$c(() => $s(serverClickHandler)())}>
    Click me!
  </div>;
}
```

Since it is a no-argument $s call, we can also write it shorter as:

```js
function MyComponent() {
  let serverClickHandler = () => {
    console.log('clicked!');
  }

  return <div onClick={serverClickHandler}>
    Click me!
  </div>;
}
```

Use of `onClick` in conjunction with state changes:

```js
function MyComponent() {
  let [clicked, setClicked] = useState(false);

  let serverClickHandler = () => {
    setClicked(true);
  }

  return <div onClick={serverClickHandler}>
    Click me!
    {clicked() && <div>Clicked!</div>}
  </div>;
}
```

### onFocus
This is a handler for the `focus` event, which is triggered when an element receives focus. 

```js
function MyComponent() {
  return <input type="text" onFocus={$c((e) => console.log('focused!', e.target.value))} />
}
```

### onBlur
This is a handler for the `blur` event, which is triggered when an element loses focus.

```js
function MyComponent() {

  let handleInputBlurredValue = (value) => {
    console.log('input blurred with value: ', value);
  }

  return  <input type="text" onBlur={withValue(handleInputBlurredValue)} />
}
```

### onChange
This is a handler for the `change` event, which is triggered when an element's value changes.

```js
function MyComponent() {

  let handleInputChangedValue = (value) => {
    console.log('input changed with value: ', value);
  }

  return  <input type="text" onChange={withValue(handleInputChangedValue)} />
}
```

### onKeyDown
This is a handler for the `keydown` event, which is triggered when a key is pressed down when typing in an input element.

```js
function MyComponent() {

  let handleInputKeyDownValue = (value) => {
    console.log('input keydown with value: ', value);
  }

  return  <input type="text" onKeyDown={withValue(handleInputKeyDownValue)} />
}
```

### onKeyUp
This is a handler for the `keyup` event, which is triggered when a key is released when typing in an input element.

```js
function MyComponent() {

  let handleInputKeyUpValue = (value) => {
    console.log('input keyup with value: ', value);
  }

  return  <input type="text" onKeyUp={withValue(handleInputKeyUpValue)} />
}
```

### onMouseEnter & onMouseLeave
These are handlers for the `mouseenter` and `mouseleave` events, which are triggered when the mouse enters or leaves an element.

This is an example that uses both event handlers, in conjunction with state changes:

```js
function MyComponent() {
  let [submenuOpen, setSubmenuOpen] = useState(false);
  return <div 
    onMouseEnter={() => setSubmenuOpen(true)} 
    onMouseLeave={() => setSubmenuOpen(false)}>
    <div>Hover me!</div>
    {submenuOpen() && <div>Submenu visible!</div>}
  </div>
}
```