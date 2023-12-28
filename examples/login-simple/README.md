# Simple Log In

In this example, we'll show you a simple log-in flow in Seniman -- supported by a small session abstraction layer on top of Seniman's `client.cookie()` API and JWT.

```js
function LoginPage() {
  let email, password;
  let session = useSession();
  let [error, setError] = useState(null);

  let setEmail = (value) => {
    email = value;
  }

  let setPassword = (value) => {
    password = value;
  }

  let onLoginClick = async () => {
    let loginData = await authenticate(email, password);

    if (loginData) {
      session.login(loginData);
    } else {
      setError('Invalid email or password');
    }
  }

  return <div>
    <div>Login</div>
    <div style={{ marginTop: "10px" }}>
      <input type="text" placeholder="Email" onBlur={withValue(setEmail)} />
      <input type="password" placeholder="Password" onBlur={withValue(setPassword)} />
      <button onClick={onLoginClick}>Login</button>
    </div>
    {error() ? <div>Login error: {error()}</div> : null}
  </div>
}
```

## Prerequisites
- Node.js 16+

## Installation

Run the following command to install the dependencies:

```bash
npm install
```

## Development

Run the following command to compile the app with watch:
```bash
npx babel src --out-dir dist --watch
```

And then the following command on another terminal to start the development server:

```bash
npx nodemon dist/index.js
```
