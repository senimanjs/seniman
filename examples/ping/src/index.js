import { createRoot, useState } from 'seniman';
import { createServer } from 'seniman/workers';

function App(props) {
  let [data, setData] = useState({ loading: false, value: null });

  let onClick = async () => {
    setData({ loading: true, value: null });
    // time the ms it takes to fetch the data
    let start = performance.now();
    await fetch('https://nyc3.digitaloceanspaces.com/')
    let end = performance.now();
    setData({ loading: false, value: "Data is loaded from DigitalOcean NYC3 in " + (end - start) + "ms." });
  }

  return (
    <div>
      <button onClick={onClick}>Click Me</button>
      <div>
        {data().loading ? "Seniman says that we're loading..." : null}
      </div>
      <div>
        {data().value ? data().value : null}
      </div>
    </div>
  );
}

let root = createRoot(App);

// Runs the root on Cloudflare Workers (in ES modules mode)
export default createServer(root);