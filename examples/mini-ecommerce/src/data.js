import TrieSearch from 'trie-search';

export const IMAGE_PREFIX = 'https://examples-r2.seniman.dev/mini-ecommerce';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getProductData(id) {
  await sleep(10);
  return products[id];
}

export async function batchGetProductsData(ids) {
  await sleep(10);
  return ids.map(id => products[id]);
}

export async function getHomePageProductCollections() {
  await sleep(10);
  return homepageFeedGroups;
}

export async function getRelatedProductRecommendations(productId) {
  await sleep(10);

  let productIdSet = new Set();

  while (productIdSet.size < 5) {
    let id = Math.floor(Math.random() * 10) + 1;

    // exclude the current product id
    if (id == productId) {
      continue;
    }

    productIdSet.add(id);
  }

  return Array.from(productIdSet);
}

export async function searchProducts(query) {
  await sleep(10);
  // preferably done on a separate process / service in production
  return productSearchTrie.search(query);
}

//////////////////////



let homepageFeedGroups = [
  {
    id: 1,
    title: "Epic Deals",
    description: "🌟 Hot steals & cool deals!",
    productIds: [2, 8, 10, 12, 14, 16, 18, 20]
  },
  {
    id: 2,
    title: "Island Vibes",
    description: "🏝️ Slay with Island swag!",
    productIds: [11, 3, 5, 7, 9, 13, 15, 19],
  },
  {
    id: 3,
    title: "Traditional Crafts",
    description: "🎨 Handcrafted with love!",
    productIds: [1, 4, 6, 8, 10, 12, 18, 20],
  }
];

let products = {
  1: {
    "id": 1, "title": "Wayang Golek Arjuna", "price": 150000, "discount": 10, "shortDescription": "Traditional Javanese puppet", "description": "Handcrafted Wayang Golek puppet representing Arjuna, a hero from the Mahabharata, adorned in colorful traditional Javanese attire.", "variants": [{ "text": 'Small' }, { "text": 'Medium' }, { "text": 'Large' }]
  },
  2: {
    "id": 2, "title": "Balinese Barong Plush", "price": 120000, "discount": 5, "shortDescription": "Soft Barong toy", "description": "Cuddly plush toy inspired by the Barong, a lion-like creature in Balinese mythology, made with soft, high-quality fabric.", "variants": [{ "text": '30cm' }, { "text": '50cm' }, { "text": '70cm' }]
  },
  3: {
    "id": 3, "title": "Indonesian Folklore Storybook", "price": 90000, "discount": 0, "shortDescription": "Children's storybook", "description": "A beautifully illustrated storybook featuring various Indonesian folktales, perfect for young readers.", "variants": [{ "text": 'Paperback' }, { "text": 'Hardcover' }]
  },
  4: {
    "id": 4, "title": "Garuda Wisnu Figurine", "price": 200000, "discount": 15, "shortDescription": "Garuda Wisnu statue", "description": "Elegant figurine of Garuda Wisnu, an iconic symbol in Indonesian mythology, crafted with attention to detail.", "variants": [{ "text": 'Small' }, { "text": 'Medium' }, { "text": 'Large' }]
  },
  5: {
    "id": 5, "title": "Indonesian Batik Fabric Set", "price": 170000, "discount": 10, "shortDescription": "Batik fabric collection", "description": "A collection of high-quality Batik fabrics, showcasing various traditional Indonesian patterns and colors.", "variants": [{ "text": 'Sampler Pack' }, { "text": 'Designer Pack' }, { "text": 'Premium Pack' }]
  },
  6: {
    "id": 6, "title": "Cendrawasih Plush Bird", "price": 110000, "discount": 5, "shortDescription": "Bird of Paradise toy", "description": "Plush toy representing the Cendrawasih, or Bird of Paradise, known for its vivid colors and plumage, native to Eastern Indonesia.", "variants": [{ "text": '30cm' }, { "text": '50cm' }]
  },
  7: {
    "id": 7, "title": "Miniature Phinisi Boat", "price": 130000, "discount": 0, "shortDescription": "Sulawesi Phinisi model", "description": "Intricately crafted model of the Phinisi, a traditional sailing ship from Sulawesi, showcasing fine craftsmanship.", "variants": [{ "text": '20cm' }, { "text": '30cm' }]
  },
  8: {
    "id": 8, "title": "Komodo Dragon Stuffed Animal", "price": 80000, "discount": 10, "shortDescription": "Komodo dragon plush", "description": "Soft and huggable stuffed animal inspired by the Komodo dragon, Indonesia's famous giant lizard.", "variants": [{ "text": '40cm' }, { "text": '60cm' }]
  },
  9: {
    "id": 9, "title": "Indonesian Floral Pattern Puzzle", "price": 140000, "discount": 20, "shortDescription": "Jigsaw puzzle", "description": "A jigsaw puzzle featuring intricate Indonesian floral patterns, offering a relaxing and engaging activity.", "variants": [{ "text": '500 pieces' }, { "text": '1000 pieces' }]
  },
  10: {
    "id": 10, "title": "Angklung Musical Toy", "price": 75000, "discount": 5, "shortDescription": "Traditional bamboo instrument", "description": "Playable Angklung toy made of bamboo, a traditional Indonesian musical instrument that produces a unique sound.", "variants": [{ "text": 'Small' }, { "text": 'Medium' }]
  },
  11: {
    "id": 11, "title": "Javanese Batik Doll Dress", "price": 50000, "discount": 0, "shortDescription": "Batik pattern doll dress", "description": "Beautiful doll dress featuring Javanese Batik patterns, showcasing the rich textile art of Indonesia.", "variants": [{ "text": 'For 30cm doll' }, { "text": 'For 40cm doll' }]
  },
  12: {
    "id": 12, "title": "Indonesian Landscape Paint-by-Numbers Kit", "price": 100000, "discount": 10, "shortDescription": "Landscape art kit", "description": "A paint-by-numbers kit depicting beautiful Indonesian landscapes, perfect for art enthusiasts of all skill levels.", "variants": [{ "text": 'Beginner' }, { "text": 'Intermediate' }, { "text": 'Advanced' }]
  },
  13: {
    "id": 13, "title": "Indonesian Folk Art Painting Kit", "price": 160000, "discount": 15, "shortDescription": "Art painting kit", "description": "DIY painting kit featuring Indonesian folk art themes, complete with canvases, paints, and brushes.", "variants": [{ "text": 'Beginner' }, { "text": 'Intermediate' }, { "text": 'Advanced' }]
  },
  14: {
    "id": 14, "title": "Traditional Indonesian Doll Outfit Set", "price": 70000, "discount": 5, "shortDescription": "Doll clothing set", "description": "A set of traditional Indonesian outfits for dolls, showcasing diverse regional attire.", "variants": [{ "text": 'For 30cm doll' }, { "text": 'For 50cm doll' }]
  },
  15: {
    "id": 15, "title": "Indonesian Cultural Festival Playset", "price": 180000, "discount": 0, "shortDescription": "Cultural playset", "description": "A playset depicting a vibrant Indonesian cultural festival, complete with miniature figures and decorations.", "variants": [{ "text": 'Complete set' }]
  },
  16: {
    "id": 16, "title": "Indonesian Fauna Miniature Set", "price": 85000, "discount": 10, "shortDescription": "Animal figurines", "description": "A set of miniature figurines representing various animals native to Indonesia, including the orangutan and the Komodo dragon.", "variants": [{ "text": 'Set of 5' }, { "text": 'Set of 10' }]
  },
  17: {
    "id": 17, "title": "Traditional Indonesian Kitchen Playset", "price": 95000, "discount": 5, "shortDescription": "Play kitchen set", "description": "A playset featuring a traditional Indonesian kitchen, complete with miniature utensils and play food items.", "variants": [{ "text": 'Starter Kit' }, { "text": 'Full Set' }]
  },
  18: {
    "id": 18, "title": "Orangutan Cuddly Toy", "price": 65000, "discount": 0, "shortDescription": "Soft Orangutan plush", "description": "Soft, cuddly toy inspired by the Orangutan, an iconic primate native to the Indonesian rainforests.", "variants": [{ "text": '30cm' }, { "text": '50cm' }]
  },
  19: {
    "id": 19, "title": "Indonesian Rainforest Animal Toy Set", "price": 50000, "discount": 0, "shortDescription": "Rainforest animal figures", "description": "A toy set featuring various animals from the Indonesian rainforest, such as the Sumatran tiger, Javan rhinoceros, and Bornean orangutan, designed to be both fun and educational.", "variants": [{ "text": 'Standard Set' }, { "text": 'Deluxe Set' }]
  },
  20: {
    "id": 20, "title": "Indonesian Wildlife Jigsaw Puzzle", "price": 110000, "discount": 15, "shortDescription": "Wildlife puzzle", "description": "A jigsaw puzzle featuring the rich wildlife of Indonesia, both educational and engaging for all ages.", "variants": [{ "text": '500 pieces' }, { "text": '1000 pieces' }]
  }
};

const productSearchTrie = new TrieSearch(['title'], { ignoreCase: true, min: 1 });
productSearchTrie.addAll(Object.values(products));