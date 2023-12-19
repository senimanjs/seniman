import fs from "fs";
import { useState, withValue } from "seniman";
import { createServer } from "seniman/server";
import { Style } from "seniman/head";
import TrieSearch from 'trie-search';

/*
// Uncomment to deploy to Cloudflare Workers
import { createServer } from 'seniman/workers';
import dataJson from '../data/entries.json';
const users = dataJson.users;
*/

const users = JSON.parse(fs.readFileSync('./data/entries.json', 'utf8')).users;

// search on both name and email
const trie = new TrieSearch(['name', 'email'], { ignoreCase: true, min: 1 });
trie.addAll(users);

const cssText = `
  body, * {
    padding: 0;
    margin: 0;
    font-family: sans-serif;
  }
`;

function Body() {
  let [autocompleteResults, setAutocompleteResults] = useState([]);

  let onChange = (value) => {
    let start = performance.now();
    // preferably done on a separate process / service in production
    let results = trie.search(value);

    console.log(`Search for "${value}" took ${performance.now() - start}ms`);

    setAutocompleteResults(results);
  }

  return (
    <div>
      <Style text={cssText} />
      <input type="text" onKeyUp={withValue(onChange)} placeholder="Search..."
        style={{ padding: '10px', border: 0, outline: 'none', borderBottom: '1px solid #ccc', width: '100%' }}
      />
      <div>
        {autocompleteResults().slice(0, 10).map((user) => (
          <div style={{ display: 'flex', alignItems: 'center', margin: '10px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: getColorForInitials(user.initials),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '10px',
              color: '#fff',
            }}
            >
              {user.initials}
            </div>
            <div style={{ color: "#444" }}>
              <div style={{ fontWeight: 'bold' }}>{user.name}</div>
              <div>{user.email}</div>
            </div>
          </div>
        ))}
      </div>
    </div >
  );
}

const colorMap = ['#3498db', '#e74c3c', '#f1c40f', '#2ecc71', '#9b59b6', '#1abc9c'];

// Simplified function to map 2-character initials to one of the 10 colors
const getColorForInitials = (initials) => {
  const index = ((initials.charCodeAt(0) - 'A'.charCodeAt(0)) + (initials.charCodeAt(1) - 'A'.charCodeAt(0))) % colorMap.length;
  return colorMap[index];
};

let server = createServer({ Body });
let port = 3002;

console.log("Listening on port", port);
server.listen(port);

// export default createServer({ Body });