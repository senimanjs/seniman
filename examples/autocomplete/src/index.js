import fs from 'fs';
import { createHandler, useState, withValue, createRoot } from "seniman";
import { serve } from "seniman/server";
import { Style } from "seniman/head";
import TrieSearch from 'trie-search';

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

function App() {
  let [autocompleteResults, setAutocompleteResults] = useState([]);

  let onChange = createHandler((value) => {
    // preferably done on a separate process / service in production
    let results = trie.search(value);

    setAutocompleteResults(results);
  });

  return (
    <div>
      <Style text={cssText} />
      <input
        type="text"

        // the standard thing is to just use onKeyUp event for the typing event, like so:
        // onKeyUp={withValue(onChange)}

        // but since this is latency-sensitive autocomplete, so we use onKeyDown instead
        // downside is we need the setTimeout hack since the value is not yet updated when the event is fired
        // https://stackoverflow.com/questions/1338483/detecting-value-of-input-text-field-after-a-keydown-event-in-the-text-field
        onKeyDown={$c(e => setTimeout(() => $s(onChange)(e.target.value), 0))}

        placeholder="Search..."
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

let root = createRoot(App);
serve(root, 3002);