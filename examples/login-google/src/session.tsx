import { useContext, useClient, useMemo, createContext } from 'seniman';
import jwt from 'jsonwebtoken';

let JWT_SECRET = process.env.JWT_SECRET || 'this-is-secret';

// a wrapper around window.cookie to create a session object to be provided as Context to the app
function createJWTSession(cookieKey) {
  let client = useClient();
  let clientDataCookie = client.cookie(cookieKey);

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
      client.setCookie(cookieKey, token);
    },
    logout: () => {
      client.setCookie(cookieKey, '');
    }
  };
}


export function SessionProvider(props) {
  let session = createJWTSession('senimanExampleCookieKey');

  return (
    <SessionContext.Provider value={session}>
      {props.children}
    </SessionContext.Provider>
  );
}

const SessionContext = createContext(null);

export function useSession() {
  return useContext(SessionContext);
}
