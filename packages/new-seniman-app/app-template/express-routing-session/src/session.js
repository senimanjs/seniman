import jwt from 'jsonwebtoken';

import { useContext, useWindow, useState, useMemo, createContext, useEffect } from 'seniman';

let JWT_SECRET = 'voucher-app-secret';

function createJWTSession(cookieKey = '__CD') {
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
    login: (email, name) => {
      let token = jwt.sign({ email, name }, JWT_SECRET, { expiresIn: '1d' });
      window.setCookie(cookieKey, token);
    },
    logout: () => {
      window.setCookie(cookieKey, '');
    }
  };
}

export function SessionProvider(props) {
  let session = createJWTSession();

  return (
    <SessionContext.Provider value={session}>
      {props.children}
    </SessionContext.Provider>
  );
}

export const SessionContext = createContext(null);

export function useSession() {
  return useContext(SessionContext);
}
