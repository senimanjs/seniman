

function Body() {
  let client = useClient();
  let session = useSession();
  let clientId = process.env.GOOGLE_CLIENT_ID ?? '';

  const handleOauthToken = createHandler((token) => {
    console.log(token);
    if (session) {
      session.login(token);
    }
  });

  let loginRef = createRef();

  let onScriptLoaded = () => {
    console.log('onScriptLoaded');
    initGoogleButton();
  }

  let initGoogleButton = () => {
    client.exec($c(() => {
      console.log('initGoogleButton');

      google.accounts.id.initialize({
        client_id: $s(clientId),
        callback: ({ credential }) => {
          $s(handleOauthToken)(credential);
        },
      });

      google.accounts.id.renderButton($s(loginRef).get(), { theme: "outline", size: "large" });
      google.accounts.id.prompt();
    }));
  }

  return <div>
    <Script src="https://accounts.google.com/gsi/client" onLoad={onScriptLoaded} />
    <div class="flex min-h-screen justify-center align-middle bg-lime-800">
      <div class="flex-1 flex-grow-0 justify-center flex">
        <button ref={loginRef} />
      </div>
    </div>
  </div>;
}