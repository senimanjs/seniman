import { useState, useClient, createHandler, useMemo, Anchor, createRef } from 'seniman';
import { searchProducts } from './data.js';
import { IMAGE_PREFIX } from './config.js';

function SearchHeader(props) {

  let onChange = createHandler((data) => {
    props.onSearchQueryTextChange(data);
  });

  let client = useClient();
  let inputRef = createRef();

  setTimeout(() => {
    client.exec($c(() => $s(inputRef).get().focus()));
  }, 10);

  return <div style={{
    backgroundColor: '#fff',
    borderBottom: '1px solid #ccc',
    color: 'green',
    position: 'static',
    width: '100%'
  }}>
    <div style={{
      margin: '0 auto',
      maxWidth: '480px'
    }}>
      <div>
        <div style={{ width: '128px', height: '32px', margin: '14px' }}>
          <input
            type="text"
            ref={inputRef}

            // the standard thing is to just use onKeyUp event for the typing event, like so:
            // onKeyUp={withValue(onChange)}

            // but since this is latency-sensitive autocomplete, so we use onKeyDown instead
            // downside is we need the setTimeout hack since the value is not yet updated when the event is fired
            // https://stackoverflow.com/questions/1338483/detecting-value-of-input-text-field-after-a-keydown-event-in-the-text-field
            onKeyDown={$c(e => setTimeout(() => $s(onChange)(e.target.value), 0))}

            placeholder="Search..."

            style={{ padding: "5px", width: "300px" }} />
        </div>
      </div>
    </div>
  </div>;
}

let l1 = {
  title: 'Popular Searches',
  items: [
    'Wayang Golek Puppets',
    'Balinese Dance Dolls',
    'Traditional Batik Outfits for Dolls',
    'Miniature Indonesian Houses',
  ]
};


function SearchShortcutSection(props) {

  let list = l1;

  return <div>
    <div style={{ background: "#aaa", padding: "10px 15px", 'font-size': '14px' }}>
      {list.title}
    </div>
    <div style={{ padding: "10px" }}>
      {list.items.map(item => {
        return <div style={{ float: 'left', background: '#eee', padding: '8px', 'margin-right': '10px', 'margin-bottom': '10px', 'border-radius': '5px', 'font-size': '14px' }}>
          {item}
        </div>;
      })}
      <div style={{ clear: 'both' }}></div>
    </div>
  </div>
}

export default function SearchPage() {
  let [searchQuery, setSearchQuery] = useState('');
  let [searchResults, setSearchResults] = useState([]);

  let hasSearchQuery = useMemo(() => {
    return searchQuery() != '';
  });

  let onSearchQueryTextChange = async (text) => {
    setSearchQuery(text);

    let results = await searchProducts(text);

    setSearchResults(results);
  }

  return <div>
    <SearchHeader onSearchQueryTextChange={onSearchQueryTextChange} />
    <div style={{ margin: '0 auto', maxWidth: '480px' }}>
      {hasSearchQuery() ?
        <div style={{ padding: '10px' }}>
          <div style={{ fontSize: '13px', color: '#666' }}>Searching for "{searchQuery()}"</div>
          <div>
            {searchResults().map(product => {
              return <Anchor href={`/product/${product.id}`} style={{ display: 'block', padding: '5px 0', borderBottom: '1px solid #eee' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                  <img src={`${IMAGE_PREFIX}/products/${product.id}-small.webp`} alt={product.title} style={{ width: '50px', height: '50px', marginRight: '10px', borderRadius: '5px' }} />
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{product.title}</div>
                    <div style={{ color: '#777', fontSize: '12px', marginTop: '3px' }}>{product.shortDescription}</div>
                  </div>
                </div>
              </Anchor>
            })}
          </div>
        </div>
        : <div>
          <SearchShortcutSection listId={1} />
        </div>}
    </div>
  </div>;
}