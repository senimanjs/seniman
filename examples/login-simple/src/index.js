import { useContext, useWindow, useClient, useState, Anchor, withValue, useMemo, createContext, useEffect, createRoot } from 'seniman';
import { serve } from 'seniman/server';
import jwt from 'jsonwebtoken';

let JWT_SECRET = process.env.JWT_SECRET || 'this-is-secret';

// a wrapper around window.cookie to create a session object to be provided as Context to the app
function createJWTSession(cookieKey) {
  let window = useWindow();
  let clientDataCookie = window.cookie(cookieKey);

  let sessionData = useMemo(() => {
    let clientDataString = clientDataCookie();

    if (clientDataString != '') {
      try {
        var decoded = jwt.verify(clientDataString, JWT_SECRET, { complete: true });

        if (decoded.payload) {
          return decoded.payload;
        }
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  let loggedIn = useMemo(() => {
    return sessionData() != null;
  });

  return {
    loggedIn: loggedIn,
    data: sessionData,
    login: (loginData) => {
      let token = jwt.sign(loginData, JWT_SECRET, { expiresIn: '1d' });
      window.setCookie(cookieKey, token);
    },
    logout: () => {
      window.setCookie(cookieKey, '');
    }
  };
}

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
  </div>
}


function SessionProvider(props) {
  let session = createJWTSession('senimanExampleCookieKey');

  return (
    <SessionContext.Provider value={session}>
      {props.children}
    </SessionContext.Provider>
  );
}

const SessionContext = createContext(null);

function useSession() {
  return useContext(SessionContext);
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
