
import { useState, useClient, onDispose, Anchor, useMemo, useEffect } from 'seniman';
import { Style, Meta } from "seniman/head";
import express from "express";
import { wrapExpress } from "seniman/express";
//import { createServer } from "seniman/workers";

import { ProductCollectionCard } from './product.js';
import ProductPage from './product.js';
import SearchPage from './search.js';
import { IMAGE_PREFIX } from "./config.js";
import { getHomePageProductCollections } from "./data.js";

function Header() {

  return <div style={{
    backgroundColor: '#fff',
    borderBottom: '1px solid #ccc',
    color: 'green',
    position: 'static',
    width: '100%'
  }}>
    <div style={{
      maxWidth: '480px',
      margin: '0 auto',
    }}>
      <div style={{ position: 'relative', height: '60px', }}>
        <div style={{ position: 'absolute', right: '10px', top: '10px', padding: '10px' }}>
          <Anchor href="/search">
            <img src={IMAGE_PREFIX + "/search.png"} style={{ width: '20px', display: 'block' }} />
          </Anchor>
        </div>
      </div>
    </div>
  </div>;
}

function Hero() {
  return <div style={{ width: '100%' }}>
    <img style={{ width: '100%' }} src={IMAGE_PREFIX + '/hero2.webp'} />
  </div>
}

function WelcomePrompt() {

  return <div style={{ padding: '10px', background: '#eee' }}>
    <div style={{ color: '#555', padding: '12px', 'border-radius': '10px', background: '#fff', fontSize: '14px', fontWeight: 'bold', lineHeight: '20px' }}>
      Welcome to Dollanan, the second best place to find Indonesian-themed dolls and toys on the internet!
    </div>
  </div>;
}

export function HomePage() {

  // load the home product collections
  let [productCollections, setProductCollections] = useState([]);

  useEffect(async () => {
    let productCollections = await getHomePageProductCollections();

    setProductCollections(productCollections);
  });

  return <div>
    <Header />
    <div style={{ margin: '0 auto', maxWidth: '480px', width: '100%', position: 'relative' }}>
      <div>
        <Hero />
        <WelcomePrompt />
        {productCollections().map(collection => {
          return <ProductCollectionCard
            title={collection.title}
            description={collection.description}
            productIds={collection.productIds}
          />;
        })}
      </div>
    </div>
  </div>;
}

const cssText = `
  body, * {
    padding: 0;
    margin: 0;
    font-family: sans-serif;
  }

  a:link, a:visited {
    color: inherit;
    text-decoration: none;
  }
`;

function Body() {
  let client = useClient();

  // simple "router" that checks the pathname and returns the page type
  let pageType = useMemo(() => {
    // location.pathname is a state that will trigger this memo to recompute when it changes
    let pathname = client.location.pathname();

    if (pathname == "/") {
      return "home";
    } else if (pathname.startsWith("/product")) {
      // note that /product/123 and /product/456 will both return "product" page type
      // allowing the ProductPage component to not be unmounted when the user navigates between products
      // and instead just handles the product id change internally
      return "product";
    } else if (pathname == "/search") {
      return "search";
    } else {
      return "404";
    }
  });

  return <div>
    <Style text={cssText} />
    <Meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <div>
      {() => {
        // use the page type memo to render the correct page component
        // this scope will only be re-rendered when the pageType changes
        switch (pageType()) {
          case "home":
            return <HomePage />;
          case "product":
            return <ProductPage />;
          case "search":
            return <SearchPage />;
          default:
            return <div>404</div>;
        }
      }}
    </div>
  </div>;
}

let app = express();
await wrapExpress(app, { Body });

app.listen(parseInt(process.env.PORT) || 3007, "0.0.0.0");

//export default createServer({ Body });