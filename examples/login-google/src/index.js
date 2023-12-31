import { createRoot, createRef, createHandler } from 'seniman';
import { serve } from 'seniman/server';
import { Script } from 'seniman/head';
import { useSession, SessionProvider } from './session.js';
import jsonwebtoken from 'jsonwebtoken';

let GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

if (!GOOGLE_CLIENT_ID) {
  throw new Error('GOOGLE_CLIENT_ID environment variable must be set');
}

function LoginPage() {

  let session = useSession();

  let handleOauthToken = createHandler((token) => {
    let decodedData = jsonwebtoken.decode(token);

    session.login({
      email: decodedData.email,
      name: decodedData.name
    });
  });

  let loginBtnRef = createRef();

  return <div style={{ background: '#444', color: '#fff' }}>
    <div>
      <div ref={loginBtnRef}></div>
    </div>
    <Script src="https://accounts.google.com/gsi/client"
      onLoad={$c(() => {

        console.log('Google One Tap loaded');

        google.accounts.id.initialize({
          // pass the google client id as a server variable to the client function with $s(variableName)
          client_id: $s(GOOGLE_CLIENT_ID),

          callback: ({ credential }) => {
            // call the server-side handler with $s(handlerName)(...args)
            $s(handleOauthToken)(credential);
          },
        });

        google.accounts.id.renderButton(
          // access the server-side ref'ed element with $s(refName).get()
          $s(loginBtnRef).get(),
          { theme: "outline", size: "large" }
        );

        google.accounts.id.prompt(); // also display the One Tap dialog
      })}
    />
  </div>;
}

function App() {

  return <div style={{ fontFamily: 'sans-serif' }}>
    <SessionProvider>
      {() => {
        let session = useSession();

        if (session.loggedIn()) {
          return <div>
            Logged in as: {session.data().email}
            <button onClick={() => {
              session.logout();
            }}>Logout</button>
          </div>
        } else {
          return <LoginPage />;
        }
      }}
    </SessionProvider>
  </div>;
}

let root = createRoot(App);
serve(root, 3008);
