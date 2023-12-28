import { useClient, Anchor, withValue, useMemo, useState, createRoot } from 'seniman';
import { serve } from 'seniman/server';
import { useSession, SessionProvider } from './session.js';

// Replace this with your own authentication logic
async function authenticate(email, password) {

  if (email == 'admin@admin.com' && password == 'admin') {
    return {
      email,
      name: 'Admin'
    }
  } else {
    return null;
  }
}

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
    <div style={{ fontSize: '11px', marginTop: '5px', color: '#666' }}>Hint: admin@admin.com & admin :)</div>
    {error() ? <div style={{ color: 'red', fontSize: '11px', marginTop: '5px' }}>Error: {error()}</div> : null}
  </div>
}


function LoggedInRoot(props) {
  let client = useClient();
  let session = useSession();

  // do regular routing within the logged in root
  let pageType = useMemo(() => {
    let pathname = client.location.pathname();

    if (pathname === "/") {
      return "movies";
    } else if (pathname.startsWith("/movie/")) {
      return "movie";
    } else {
      return "404";
    }
  });

  let onLogoutClick = () => {
    session.logout();
  }

  return <div>
    <div>
      <div style={{ float: "right" }}>
        <button onClick={onLogoutClick}>Logout</button>
      </div>
      <Anchor href="/" style={{ fontWeight: "bold" }}> App</Anchor>
      <hr />
    </div>
    <div>
      {() => {
        // This function is re-run only when pageType changes
        switch (pageType()) {
          case "movie":
            return <div>
              Movie {client.location.pathname().split("/")[2]}
            </div>
          case "movies":
            return <div>
              Movies:
              <div>
                {[1, 2, 3].map(id =>
                  <Anchor style={{ display: 'block' }} href={`/movie/${id}`}>
                    Movie {id}
                  </Anchor>
                )}
              </div>
            </div>
          default:
            return <div>404</div>;
        }
      }}
    </div>
  </div>;
}

function App() {

  return <div style={{ fontFamily: 'sans-serif' }}>
    <SessionProvider>
      {() => {
        let session = useSession();

        if (session.loggedIn()) {
          return <LoggedInRoot />;
        } else {
          return <LoginPage />;
        }
      }}
    </SessionProvider>
  </div>;
}

let root = createRoot(App);
serve(root, 3015);
