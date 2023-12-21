import { useState, useClient } from 'seniman';

function SearchHeader(props) {

  let onValueChange = (data) => {
    props.onSearchQueryTextChange(data);
  }

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
        <div style={{ width: '128px', height: '32px', margin: '14px 0' }}>
          <input style={{ padding: "5px", width: "300px" }} type="text" onValueChange={onValueChange} placeholder="Search..." />
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

let l2 = {
  title: 'Category Searches',
  items: [
    'Puppets & Figurines',
    'Plush & Soft Toys',
    'Doll Clothing & Accessories',
    'Cultural & Traditional Dolls',
    'Craft & DIY Kits',
    'Musical Instrument Replicas',
    'Historical & Mythological Toys',
    'Educational Games & Puzzles',
    'Dollhouse & Miniatures',
    'Art & Craft Supplies',
    'Books & Storytelling'
  ]
};

function SearchShortcutSection(props) {

  let list = props.listId == 1 ? l1 : l2;

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

function SearchResult() {
  return <div>Searching..</div>;
}

export default function SearchPage() {

  let [searchQuery, setSearchQuery] = useState('');

  let onSearchQueryTextChange = (text) => {
    setSearchQuery(text);
  }

  return <div>
    <SearchHeader onSearchQueryTextChange={onSearchQueryTextChange} />
    <div style={{ margin: '0 auto', maxWidth: '480px' }}>
      {searchQuery() == '' ?
        <div>
          <SearchShortcutSection listId={1} />
          <SearchShortcutSection listId={2} />
        </div> : <SearchResult />}
    </div>
  </div>;
}