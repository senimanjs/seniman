import { useState, useClient, Anchor, useEffect } from 'seniman';
import { IMAGE_PREFIX, batchGetProductsData, getProductData, getRelatedProductRecommendations } from './data.js';

function formatPrice(priceNumber) {
  // input is rupiah
  // convert to USD and format as $25.00
  return "$" + (priceNumber / 15000).toFixed(2);
}

function ProductMiniViewCard(props) {

  return <div style={{ height: "290px", width: '120px', position: 'relative', float: 'left', marginRight: '8px' }}>
    <Anchor href={"/product/" + props.product.id} style={{ display: 'block' }} >
      <img style={{ borderRadius: '5px', width: '100%' }} src={`${IMAGE_PREFIX}/products/${props.product.id}-small.webp`} />
    </Anchor>
    <Anchor href={"/product/" + props.product.id} style={{ display: 'block' }} >
      <div style={{ fontSize: '14px', marginBottom: '2px', marginTop: '5px', lineHeight: '18px' }}>{props.product.title}</div>
      <div style={{ fontSize: '12px', marginBottom: '5px', color: '#888' }}>{props.product.shortDescription}</div>
    </Anchor>
    <div style={{ fontSize: '15px', marginTop: '7px', fontWeight: 'bold', marginBottom: '5px', color: '#FFA500' }}>{formatPrice(props.product.price)}</div>
    {props.product.discount ? <div style={{ fontSize: '12px', padding: '3px 5px', color: '#fff', background: '#7CC47C', display: 'inline', borderRadius: '5px' }}>
      Up to {props.product.discount}% off
    </div> : null}
    <div style={{ background: "#FFA500", width: '100%', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', padding: '10px 0', color: 'white', borderRadius: '5px', bottom: 0, position: 'absolute' }}>
      + Cart
    </div>
  </div>
}

export function ProductCollectionCard(props) {
  let [products, setProducts] = useState([]);

  useEffect(async () => {
    let products = await batchGetProductsData(props.productIds);

    setProducts(products);
  });

  return <div style={{ background: '#fff' }}>
    <div style={{ borderBottom: '1px solid #eee' }}>
      <div style={{ padding: '10px', fontWeight: 'bold' }}>
        <div style={{ color: 'rgba(77,77,77,1.00)', fontSize: '14px' }}>
          {props.title}
        </div>
        <div style={{ color: 'rgba(149,149,149,1.00)', fontSize: '12px', marginTop: '3px' }}>
          {props.description}
        </div>
      </div>
    </div>
    <div style={{ padding: '10px', overflowY: 'scroll' }}>
      <div style={{ width: `${props.productIds.length * 128}px`, height: '280px' }}>
        {products().map(product => <ProductMiniViewCard product={product} />)}
      </div>
    </div>
  </div>
}

function ProductHeader(props) {
  return <div style={{
    backgroundColor: '#fff',
    borderBottom: '1px solid #ccc',
    position: 'static',
    width: '100%'
  }}>
    <div style={{
      maxWidth: '450px', // Set the maximum width
      width: '100%', // Make width flexible
      margin: '0 auto', // Center the div
    }}>
      <div style={{ padding: '20px 0', position: 'relative' }}>
        <div style={{ cursor: "pointer", padding: '0 10px' }} onClick={$c(e => window.history.back())}>
          <img style={{ float: 'left', width: '24px', height: '24px' }} src={IMAGE_PREFIX + "/arrow-left.png"} />
        </div>
        <div style={{ fontSize: '18px', float: 'left', marginTop: '2px', marginLeft: '10px', fontWeight: "bold" }}>{props.title}</div>
        <div style={{ clear: 'both' }}></div>
        <div style={{ position: 'absolute', right: '10px', top: '10px', padding: '10px' }}>
          <Anchor href="/search">
            <img src={IMAGE_PREFIX + "/search.png"} style={{ width: '20px', display: 'block' }} />
          </Anchor>
        </div>
      </div>
    </div>
  </div>;
}

function shortenText(text) {

  if (text.length <= 100) {
    return text;
  }

  return text.substring(0, 100) + '...';
}

function ProductVariantButton(props) {

  return <div style={{
    float: 'left',
    padding: '10px',
    border: '1px solid #ccc',
    marginRight: '10px',
    borderRadius: '5px',
    background: props.isActive ? 'rgba(231,245,232,1.00)' : 'white',
    cursor: 'pointer',
  }}
    onClick={props.onClick}>
    {props.variant.text}
  </div>
}

function ProductDescription(props) {
  let [showFullText, setShowFullText] = useState(false);

  let flip = () => {
    setShowFullText(showFullText => !showFullText);
  }

  return <div style={{ background: '#fff', padding: '15px', marginTop: '15px', marginBottom: '10px' }}>
    <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Description</div>
    <div style={{ fontSize: '14px', marginTop: '10px', lineHeight: '20px' }}>
      {() => {
        if (showFullText()) {
          return props.text;
        }
        else {
          return shortenText(props.text);
        }
      }}
    </div>
    {props.text.length >= 100 ? <div style={{ marginTop: "10px" }}>
      <button style={{ padding: "2px" }} onClick={flip}>{showFullText() ? "Hide" : "Show More"}</button>
    </div> : null}
  </div>;
}

function ProductVariantSelector(props) {

  let [activeIndex, setActiveIndex] = useState(0);

  let onVariantClick = (index) => {
    setActiveIndex(index);
  }

  return <div style={{ background: '#fff', padding: '15px', marginBottom: '15px' }}>
    <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Choose Variant</div>
    <div style={{ marginTop: '10px' }}>
      {props.variants.map((variant, index) => <ProductVariantButton onClick={() => onVariantClick(index)} variant={variant} isActive={index == activeIndex()} />)}
      <div style={{ clear: "both" }}></div>
    </div>
  </div>;
}

export default function ProductPage(props) {
  let client = useClient();
  let [product, setProduct] = useState(null);

  let [recommendedProductIds, setRecommendedProductIds] = useState([]);

  useEffect(async () => {
    // listen to the pathname change -- then extract the product id
    // this effect will run every time the pathname changes (while still in the /product/xxx prefix)
    let productId = client.location.pathname().split('/')[2];

    let productPromise = getProductData(productId)
    let recommendedProductPromise = getRelatedProductRecommendations(productId);

    setProduct(await productPromise);
    setRecommendedProductIds(await recommendedProductPromise);

    // sometimes the page switches too quick that the browser DOM doesn't scroll to top
    setTimeout(() => {
      client.exec($c(() => {
        window.scrollTo(0, 0);
      }));
    }, 0);
  });

  return <div>
    <ProductHeader title={product() ? product().title : "..."} />
    <div style={{ backgroundColor: '#eee', minHeight: '800px' }}>
      <div style={{ margin: '0 auto', width: '450px' }}>
        {
          product() ?
            <div>
              <img src={`${IMAGE_PREFIX}/products/${product().id}-original.webp`} style={{ width: '450px', minHeight: '400px' }} />
              <div style={{ padding: '15px 15px', background: 'white' }}>
                <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{product().title}</div>
                <div style={{ marginTop: '5px', color: 'rgba(71,176,74,1.00)', fontWeight: 'bold', fontSize: '18px' }}>{formatPrice(product().price)}</div>
                <div style={{ fontSize: '10px', color: '#444', marginTop: '10px' }}>Shown image is generated by DALL·E</div>
              </div>
              <ProductDescription text={product().description} />
              <ProductVariantSelector variants={product().variants || []} />
            </div> : null
        }

        {recommendedProductIds() ?
          <ProductCollectionCard
            title="Recommendations For You"
            description="Other products you might like"
            productIds={recommendedProductIds()} /> : null}
      </div>
    </div>
  </div>;
};