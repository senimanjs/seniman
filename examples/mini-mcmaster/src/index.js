import { useState, useClient, useMemo, createRef, createHandler, useEffect, onDispose, Anchor, createRoot, createContext, useContext } from 'seniman';
import { serve } from 'seniman/workers';
import { Style } from 'seniman/head';
import {
  products,
  categories,
  featuredCategories
} from './data.js';

import cssText from "./style.txt";

// Helper function to load multiple featured categories with their products
async function loadFeaturedCategories() {
  await new Promise(resolve => setTimeout(resolve, 10));
  const featured = await Promise.all(
    featuredCategories.map(async (categoryId) => {
      const category = categories.find(c => c.id === categoryId);
      const categoryProducts = products.filter(p => p.categoryId === categoryId);
      return {
        ...category,
        products: categoryProducts
      };
    })
  );
  return featured;
}

// Helper functions to simulate database queries
async function loadProductData(productId) {
  await new Promise(resolve => setTimeout(resolve, 10));
  return products.find(p => p.id === productId);
}

async function loadCategoryData(categoryId) {
  await new Promise(resolve => setTimeout(resolve, 10));
  const category = categories.find(c => c.id === categoryId);
  if (category) {
    return {
      ...category,
      products: products.filter(p => p.categoryId === category.id)
    };
  }
  return null;
}

async function searchProducts(query) {
  await new Promise(resolve => setTimeout(resolve, 10));
  return products.filter(product =>
    product.name.toLowerCase().includes(query.toLowerCase()) ||
    product.description.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);
}

async function loadRelatedProducts(currentProductId) {
  await new Promise(resolve => setTimeout(resolve, 10));
  const currentProduct = products.find(p => p.id === currentProductId);
  if (!currentProduct) return [];

  // Get products from the same category, excluding the current product
  return products
    .filter(p => p.categoryId === currentProduct.categoryId && p.id !== currentProductId)
    // Limit to 4 related products
    .slice(0, 4);
}

// Update the SearchBar component to use the products data
function SearchBar() {
  let client = useClient();
  const inputRef = createRef();
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  let [searchQuery, setSearchQuery] = useState('');

  const onSearchQueryTextChange = createHandler(async (text) => {
    if (text == '') {
      setSearchResults([]);
      setShowResults(false);
    } else {
      const results = await searchProducts(text);
      setSearchResults(results);
      setShowResults(true);
    }

    setSelectedIndex(-1);
    setSearchQuery(text);
  });

  let onArrowKey = createHandler((direction) => {
    if (direction === 'ArrowDown') {
      setSelectedIndex(prev => {
        const newIndex = prev + 1;
        return newIndex >= searchResults().length ? 0 : newIndex;
      });
    } else if (direction === 'ArrowUp') {
      setSelectedIndex(prev => {
        const newIndex = prev - 1;
        return newIndex < 0 ? searchResults().length - 1 : newIndex;
      });
    } else if (direction === 'Enter') {
      if (selectedIndex() >= 0) {
        client.history.pushState('/product/' + searchResults()[selectedIndex()].id);
        client.exec($c(() => {
          let input = $s(inputRef).get();
          input.value = '';
        }));
        setSearchResults([]);
        setShowResults(false);
      }
    }
  });

  return (
    <div class="relative">
      <div class="flex items-center w-[600px] bg-white border rounded">
        <input
          ref={inputRef}
          type="text"
          onKeyDown={$c(e => {
            let key = e.key;
            if (key === 'ArrowDown' || key == 'ArrowUp' || key === 'Enter') {
              e.preventDefault();
              $s(onArrowKey)(e.key);
            } else {
              setTimeout(() => $s(onSearchQueryTextChange)(e.target.value), 0);
            }
          })}
          onFocus={() => setShowResults(true)}
          placeholder="Search..."
          class="w-full px-3 py-1.5 bg-transparent border-none text-gray-800 placeholder-gray-400 focus:outline-none"
        />
        {searchQuery() && (
          <button
            onClick={() => {
              client.exec($c(() => {
                let input = $s(inputRef).get();
                input.value = '';
              }));
              setSearchResults([]);
              setShowResults(false);
              setSelectedIndex(-1);
            }}
            class="px-3 text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        )}
      </div>

      {showResults() && searchQuery() && (
        <div class="absolute top-full left-0 right-0 mt-1 bg-white border rounded shadow-lg overflow-hidden">
          {searchResults().map((result, index) => (
            <div

              onMouseEnter={() => setSelectedIndex(index)}
              onMouseLeave={() => setSelectedIndex(-1)}>
              <div
                onClick={() => {
                  client.history.pushState('/product/' + result.id);
                  client.exec($c(() => {
                    let input = $s(inputRef).get();
                    input.value = '';
                  }));
                  setSearchResults([]);
                  setShowResults(false);
                  setSelectedIndex(-1);
                }}

                class={`flex items-center p-3 no-underline group cursor-pointer
                                    ${selectedIndex() === index ? 'bg-gray-100' : ''}`}
              >
                <img
                  src={getProductUrl(result, 128)}
                  alt={result.name}
                  class="w-10 h-10 object-cover rounded mr-3"
                />
                <span class={`${selectedIndex() === index ? 'text-gray-900' : 'text-gray-700'} group-hover:text-gray-900`}>
                  {result.name}
                </span>
              </div>
            </div>
          ))}
          {searchResults().length === 0 && (
            <div class="p-3 text-gray-500">
              No results found for "{searchQuery()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Header() {
  let cart = useCart();

  return <header class="bg-white border-b px-5 py-3 flex justify-between items-center">
    <Anchor href="/" class="text-green-700 text-2xl font-bold">Seniman-McMaster</Anchor>
    <div class="flex-1 flex justify-center">
      <SearchBar />
    </div>
    <div class="flex items-center">
      <div class="relative ml-3">
        <Anchor href="/order" class="text-green-700 hover:text-green-600 no-underline flex items-center">
          CART
          {cart.itemCount() > 0 && (
            <span class="absolute -top-2 -right-4 bg-yellow-400 text-xs font-medium px-1.5 py-0.5 rounded-full">
              {cart.itemCount()}
            </span>
          )}
        </Anchor>
      </div>
    </div>
  </header>;
}

function Sidebar() {
  return <aside class="w-52 bg-white border-r p-5 flex-shrink-0">
    <h3 class="mt-0 text-green-700">Choose a Category</h3>
    <ul class="list-none p-0">
      {categories.map(category =>
        <li class="my-2.5">
          <Anchor
            href={`/category/${category.id}`}
            class="block px-2 py-1.5 rounded text-gray-700 hover:text-green-700 hover:bg-green-50 no-underline transition-colors"
          >
            {category.name}
          </Anchor>
        </li>
      )}
    </ul>
  </aside>;
}

function HomePage() {
  let [featuredCategories, setFeaturedCategories] = useState([]);

  useEffect(async () => {
    const featured = await loadFeaturedCategories();
    setFeaturedCategories(featured);
  });

  return <div>
    <div class="text-sm text-gray-500 mb-5">
      Explore {products.length.toLocaleString()} products
    </div>

    {featuredCategories().map(category => (
      <section class="mb-10">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-2xl text-gray-900">
            {category.name}
          </h2>
          <Anchor
            href={`/category/${category.id}`}
            class="text-green-700 hover:text-green-600 text-sm no-underline"
          >
            View All →
          </Anchor>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-5">
          {category.products.map(item =>
            <Anchor
              href={`/product/${item.id}`}
              class="block text-center group hover:opacity-90 transition-opacity no-underline"
            >
              <div class="flex justify-center items-center">
                <img
                  src={getProductUrl(item, 128)}
                  alt={item.name}
                  class="w-20 h-20 object-cover rounded mb-2"
                />
              </div>
              <p class="m-0 text-sm text-gray-700 group-hover:text-green-700 transition-colors">
                {item.name}
              </p>
            </Anchor>
          )}
        </div>
      </section>))}

  </div>;
}

function OrderPage() {
  const cart = useCart();

  const calculateTotal = () => {
    return cart.items().reduce((sum, item) => sum + item.price, 0).toFixed(2);
  };

  return (
    <div class="p-5">
      <h1 class="text-2xl mb-5">Order</h1>
      <hr class="border-t mb-5" />

      <div class="flex gap-8">
        <div class="flex-grow max-w4xl">
          <div class="mb-5">
            <p class="text-lg text-green-700">Delivers in 2-4 weeks</p>
            <p class="text-sm text-gray-500">Need this sooner?</p>
          </div>

          {cart.items().length === 0 ? (
            <div class="text-center text-gray-500 py-10">
              Your cart is empty
            </div>
          ) : (
            <div class="space-y-4">
              {cart.items().map(item => (
                <div key={item.id} class="flex items-center bg-gray-50 border p-3">
                  <img
                    src={getProductUrl(item, 128)}
                    alt={item.name}
                    class="w-24 h-24 object-cover mr-5"
                  />
                  <div class="flex-grow">
                    <h2 class="text-lg mb-1">{item.name}</h2>
                    <p class="text-sm text-gray-500">
                      {item.description}
                    </p>
                  </div>
                  <div class="flex items-center gap-4">
                    <span class="text-base">1</span>
                    <span class="text-base">${item.price.toFixed(2)} each</span>
                    <span class="text-base">${item.price.toFixed(2)}</span>
                    <span
                      class="text-2xl text-gray-400 hover:text-gray-600 ml-4 cursor-pointer"
                      onClick={() => cart.removeItem(item)}
                    >
                      ×
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {cart.items().length > 0 && (
          <div class="w-72 h-fit">
            <div class="bg-gray-50 border p-5 sticky top-5">
              <h2 class="text-lg mb-2">Total ${calculateTotal()}</h2>
              <p class="text-sm text-gray-500">Applicable shipping and tax will be added.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function createCart() {
  let [items, setItems] = useState([]);

  let itemCount = useMemo(() => {
    return items().length;
  });

  return {
    items,
    itemCount,
    addItem: async (item) => {

      await new Promise(resolve => setTimeout(resolve, 100));
      setItems(items => [...items, item]);
    },
    removeItem: async (item) => {
      await new Promise(resolve => setTimeout(resolve, 100));
      setItems(items => items.filter(i => i !== item));
    }
  }
}

function getProductUrl(product, resolution) {
  return `https://examples-r2.seniman.dev/root-mcmaster/product_images_${resolution}/${product.categoryId}/${product.id}.webp`;
}

function ProductDetailPage() {
  let client = useClient();
  let [product, setProduct] = useState(null);
  let [relatedProducts, setRelatedProducts] = useState([]);
  let [cartStatus, setCartStatus] = useState('idle'); // 'idle' | 'loading' | 'added'
  let cart = useCart();
  
  let productId = useMemo(() => {
      let path = client.location.pathname();
      return path.split("/")[2]; // Gets the ID from /product/:id
  });

  useEffect(async () => {
      let _productId = productId();
      let productData = await loadProductData(_productId);
      setProduct(productData);
      setCartStatus('idle');
      
      if (productData) {
          const related = await loadRelatedProducts(_productId);
          setRelatedProducts(related);
      }
  });

  const handleAddToCart = async () => {
      setCartStatus('loading');
      try {
          await cart.addItem(product());
          setCartStatus('added');
      } catch (error) {
          console.error('Failed to add item to cart:', error);
          setCartStatus('idle');
      }
  };

  onDispose(() => {
      console.log('Leaving product page');
  });

  return () => {
      if (!product()) {
          return <div>Loading product...</div>;
      }

      return <div>
          <h1 class="text-2xl mb-5 text-gray-900">{product().name}</h1>
          <div class="flex mb-10">
              <div class="w-96 h-96 bg-gray-100 rounded mr-8">
                  <img 
                      src={getProductUrl(product(), 512)}
                      alt={product().name}
                      class="w-full h-full object-cover"
                  />
              </div>
              <div>
                  <p class="text-gray-700 mb-4">{product().description}</p>
                  <p class="text-2xl font-bold mb-4 text-gray-900">${product().price.toFixed(2)}</p>
                  <div>
                      <button 
                          onClick={handleAddToCart}
                          disabled={cartStatus() === 'loading'}
                          class={`bg-green-700 text-white px-4 py-2 rounded ${
                              cartStatus() === 'loading' ? 'opacity-75 cursor-not-allowed' : 'hover:bg-green-600'
                          }`}
                      >
                          {cartStatus() === 'added' ? 'Add Again' : 'Add to Cart'}
                      </button>
                      <p class={`mt-2 ${
                          cartStatus() === 'loading' ? 'text-gray-500' : 
                          cartStatus() === 'added' ? 'text-green-700' : ''
                      }`}>
                          {cartStatus() === 'loading' ? 'Adding to cart...' :
                              cartStatus() === 'added' ? 'Added to cart' : ''}
                      </p>
                  </div>
              </div>
          </div>

          {relatedProducts().length > 0 && (
              <section>
                  <h2 class="text-xl mb-5 text-gray-900">Related Products</h2>
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {relatedProducts().map(relatedProduct => (
                          <Anchor 
                              href={`/product/${relatedProduct.id}`}
                              class="block bg-white border rounded p-4 hover:border-green-700 no-underline transition-colors"
                          >
                              <div class="flex items-start mb-3">
                                  <div class="w-12 h-12 bg-gray-100 rounded mr-3">
                                      <img 
                                          src={getProductUrl(relatedProduct, 128)}
                                          alt={relatedProduct.name}
                                          class="w-full h-full object-cover"
                                      />
                                  </div>
                                  <h3 class="text-sm font-medium text-gray-900">{relatedProduct.name}</h3>
                              </div>
                              <p class="text-sm text-gray-600">{relatedProduct.description}</p>
                              <p class="text-sm text-green-700 mt-2">
                                  ${relatedProduct.price.toFixed(2)}
                              </p>
                          </Anchor>
                      ))}
                  </div>
              </section>
          )}
      </div>;
  }
}


function CategoryPage() {
  let client = useClient();
  let [category, setCategory] = useState(null);

  let categoryId = useMemo(() => {
    let path = client.location.pathname();
    return path.split("/")[2]; // Gets the ID from /category/:id
  });

  useEffect(async () => {
    let _categoryId = categoryId();
    let categoryData = await loadCategoryData(_categoryId);
    setCategory(categoryData);
  });

  onDispose(() => {
    console.log('Leaving category page');
  });

  return () => {
    if (!category()) {
      return <div>Loading category...</div>;
    }

    return <div>
      <div class="text-sm text-gray-500 mb-5">
        {category().products.length} Products
      </div>

      <section class="mb-10">
        <h2 class="text-2xl mb-5 text-gray-900">{category().name}</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-5">
          {category().products.map(item => (
            <Anchor
              href={`/product/${item.id}`}
              class="block p-3 bg-white border text-center rounded hover:border-green-700 transition-colors no-underline"
            >
              <div class="flex justify-center items-center">
                <img
                  src={getProductUrl(item, 128)}
                  alt={item.name}
                  class="w-20 h-20 object-cover rounded mb-2"
                />
              </div>
              <p class="m-0 text-sm text-gray-700 group-hover:text-green-700 transition-colors">
                {item.name}
              </p>
            </Anchor>
          ))}
        </div>
      </section>
    </div>;
  }
}


let CartContext = createContext(null);

function useCart() {
  return useContext(CartContext);
}


function App() {
  let client = useClient();
  let cart = createCart();

  let pageType = useMemo(() => {
    let pathname = client.location.pathname();

    if (pathname === "/") {
      return "home";
    } else if (pathname === "/order") {
      return "order";
    } else if (pathname.startsWith("/product/")) {
      return "product";
    } else if (pathname.startsWith("/category/")) {
      return "category";
    } else {
      return "404";
    }
  });

  return <div>
    <Style text={cssText} />
    <CartContext.Provider value={cart}>
      <div class="min-h-screen bg-white text-gray-900">
        <Header />
        {() => {
          let _pageType = pageType();

          if (_pageType === "order") {
            return <OrderPage />;
          }

          return <div class="flex">
            <Sidebar />
            <main class="flex-grow p-5">
              {() => {
                switch (_pageType) {
                  case "home":
                    return <HomePage />;
                  case "product":
                    return <ProductDetailPage />;
                  case "category":
                    return <CategoryPage />;
                  default:
                    return <div class="p-5">404 Not Found</div>;
                }
              }}
            </main>
          </div>;
        }}
      </div>
    </CartContext.Provider>
  </div>;
}

let root = createRoot(App);
serve(root);