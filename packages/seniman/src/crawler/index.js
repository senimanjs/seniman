import { HtmlRenderingContext } from './html.js';

export class CrawlerRenderer {

  constructor() {
    this._verifyCrawlerRequest = default_crawlerRequestVerifier;
  }

  shouldUseRenderer(headers) {
    return this._verifyCrawlerRequest(headers);
  }

  createHtmlRenderingContext() {
    return new HtmlRenderingContext();
  }
}

export function default_crawlerRequestVerifier(headers) {
  // TODO:
  // 1. check if the crawler is below the rate limit
  // 2. check validity of crawler IP address 

  // NOTE: seems like we can return a richer value type
  // for this function aside from true / false -- namely
  // additional information around caching. Also maybe return some rate limiting info 
  // & rate limiting can be done outside of this?

  // for now, just check the user agent and if it contains
  // any of the popular crawler names
  const userAgent = headers.get('user-agent') || '';
  const words = userAgent.split(/[^\w]+/);
  return words.some(word => crawlerTrie.search(word));
}

// Use trie for fast lookup of crawler user agent substrings
class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word) {
    let currentNode = this.root;
    for (const ch of word) {
      if (!currentNode.children.has(ch)) {
        currentNode.children.set(ch, new TrieNode());
      }
      currentNode = currentNode.children.get(ch);
    }
    currentNode.isEndOfWord = true;
  }

  search(word) {
    let currentNode = this.root;
    for (const ch of word) {
      if (!currentNode.children.has(ch)) {
        return false;
      }
      currentNode = currentNode.children.get(ch);
    }
    return currentNode.isEndOfWord;
  }
}

// Trie class definition
class TrieNode {
  constructor() {
    this.children = new Map();
    this.isEndOfWord = false;
  }
}

// Initialize the trie with important crawlers' user agent substrings
const crawlerTrie = new Trie();

const crawlers = [
  'Googlebot',
  'Bingbot',
  'DuckDuckBot',
  'Twitterbot',
  'facebot',
  'facebookexternalhit',
  'LinkedInBot',
  'Applebot',
  'Baiduspider',
  'YandexBot',
  'Slurp',
  'Sogou',
  'YisouSpider',
  'Discordbot',
  'Slackbot'
  // Add any other important crawlers here
];

crawlers.forEach(crawler => crawlerTrie.insert(crawler));