export type QuoteDirection = 'up' | 'down' | 'flat';

export interface Quote {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  bid: number;
  ask: number;
  volume: number;
  history: number[];
  direction: QuoteDirection;
}

interface QuoteSeed {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  initialChangePercent: number;
  volume: number;
}

const quoteSeeds: QuoteSeed[] = [
  { symbol: 'NVDA', name: 'NVIDIA', sector: 'Semiconductors', price: 182.41, initialChangePercent: 2.84, volume: 186_420_000 },
  { symbol: 'MSFT', name: 'Microsoft', sector: 'Software', price: 521.18, initialChangePercent: 0.72, volume: 24_680_000 },
  { symbol: 'AAPL', name: 'Apple', sector: 'Hardware', price: 231.72, initialChangePercent: -0.31, volume: 51_390_000 },
  { symbol: 'AMZN', name: 'Amazon', sector: 'Consumer', price: 224.65, initialChangePercent: 1.14, volume: 42_810_000 },
  { symbol: 'META', name: 'Meta Platforms', sector: 'Internet', price: 735.22, initialChangePercent: 1.91, volume: 18_730_000 },
  { symbol: 'GOOGL', name: 'Alphabet', sector: 'Internet', price: 201.37, initialChangePercent: 0.46, volume: 31_240_000 },
  { symbol: 'TSLA', name: 'Tesla', sector: 'Automotive', price: 328.44, initialChangePercent: -1.87, volume: 121_640_000 },
  { symbol: 'AVGO', name: 'Broadcom', sector: 'Semiconductors', price: 338.19, initialChangePercent: 2.11, volume: 29_130_000 },
  { symbol: 'AMD', name: 'Advanced Micro Devices', sector: 'Semiconductors', price: 178.26, initialChangePercent: 1.43, volume: 67_930_000 },
  { symbol: 'NFLX', name: 'Netflix', sector: 'Media', price: 1224.80, initialChangePercent: 0.94, volume: 6_280_000 },
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financials', price: 297.16, initialChangePercent: -0.26, volume: 9_410_000 },
  { symbol: 'V', name: 'Visa', sector: 'Financials', price: 351.92, initialChangePercent: 0.38, volume: 7_840_000 },
  { symbol: 'LLY', name: 'Eli Lilly', sector: 'Healthcare', price: 772.61, initialChangePercent: -0.62, volume: 4_920_000 },
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy', price: 112.87, initialChangePercent: 0.85, volume: 17_630_000 },
  { symbol: 'WMT', name: 'Walmart', sector: 'Consumer', price: 102.38, initialChangePercent: 0.21, volume: 14_580_000 },
  { symbol: 'COST', name: 'Costco', sector: 'Consumer', price: 971.44, initialChangePercent: -0.48, volume: 2_610_000 },
  { symbol: 'ORCL', name: 'Oracle', sector: 'Software', price: 243.78, initialChangePercent: 1.62, volume: 19_440_000 },
  { symbol: 'PLTR', name: 'Palantir', sector: 'Software', price: 157.31, initialChangePercent: 3.18, volume: 98_310_000 },
  { symbol: 'UBER', name: 'Uber Technologies', sector: 'Mobility', price: 91.26, initialChangePercent: -0.93, volume: 21_790_000 },
  { symbol: 'CRM', name: 'Salesforce', sector: 'Software', price: 251.63, initialChangePercent: 0.57, volume: 8_170_000 },
  { symbol: 'SPY', name: 'S&P 500 ETF', sector: 'Index', price: 653.74, initialChangePercent: 0.68, volume: 74_820_000 },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', sector: 'Index', price: 581.19, initialChangePercent: 1.02, volume: 52_480_000 },
  { symbol: 'IWM', name: 'Russell 2000 ETF', sector: 'Index', price: 228.53, initialChangePercent: -0.34, volume: 33_910_000 },
  { symbol: 'GLD', name: 'Gold Trust', sector: 'Commodities', price: 309.17, initialChangePercent: 0.42, volume: 11_260_000 },
];

export const watchlists = {
  Watchlist: ['NVDA', 'MSFT', 'AAPL', 'AMZN', 'META', 'GOOGL', 'TSLA', 'AVGO', 'AMD', 'NFLX', 'JPM', 'V', 'LLY', 'XOM', 'WMT', 'COST'],
  'Most active': ['NVDA', 'TSLA', 'PLTR', 'SPY', 'AMD', 'QQQ', 'AAPL', 'AMZN', 'GOOGL', 'AVGO', 'META', 'ORCL', 'UBER', 'IWM', 'XOM', 'CRM'],
  Technology: ['NVDA', 'MSFT', 'AAPL', 'META', 'GOOGL', 'AVGO', 'AMD', 'ORCL', 'PLTR', 'CRM', 'AMZN', 'TSLA', 'NFLX', 'V', 'UBER', 'QQQ'],
} as const;

export type WatchlistName = keyof typeof watchlists;

type QuoteListener = (quote: Quote) => void;
type ClockListener = (time: Date) => void;

function symbolHash(symbol: string) {
  let hash = 2166136261;
  for (let index = 0; index < symbol.length; index++) {
    hash ^= symbol.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createInitialQuote(seed: QuoteSeed): Quote {
  const previousClose = seed.price / (1 + seed.initialChangePercent / 100);
  const hash = symbolHash(seed.symbol);
  const history = Array.from({ length: 28 }, (_, index) => {
    const wave = Math.sin(index * 0.47 + hash * 0.00001) * seed.price * 0.0024;
    return seed.price - wave * (1 - index / 30);
  });
  history[history.length - 1] = seed.price;

  return {
    symbol: seed.symbol,
    name: seed.name,
    sector: seed.sector,
    price: seed.price,
    previousClose,
    change: seed.price - previousClose,
    changePercent: seed.initialChangePercent,
    bid: seed.price - 0.02,
    ask: seed.price + 0.02,
    volume: seed.volume,
    history,
    direction: seed.initialChangePercent >= 0 ? 'up' : 'down',
  };
}

class MarketFeed {
  private quotes = new Map<string, Quote>();
  private listeners = new Map<string, Set<QuoteListener>>();
  private clockListeners = new Set<ClockListener>();
  private tick = 0;

  constructor() {
    for (const seed of quoteSeeds) {
      this.quotes.set(seed.symbol, createInitialQuote(seed));
    }

    const timer = setInterval(() => this.advance(), 250);
    timer.unref?.();
  }

  get(symbol: string) {
    const quote = this.quotes.get(symbol);
    if (!quote) throw new Error(`Unknown market symbol: ${symbol}`);
    return quote;
  }

  all() {
    return [...this.quotes.values()];
  }

  subscribe(symbol: string, listener: QuoteListener) {
    let symbolListeners = this.listeners.get(symbol);
    if (!symbolListeners) {
      symbolListeners = new Set();
      this.listeners.set(symbol, symbolListeners);
    }
    symbolListeners.add(listener);
    return () => {
      symbolListeners?.delete(listener);
      if (symbolListeners?.size === 0) this.listeners.delete(symbol);
    };
  }

  subscribeClock(listener: ClockListener) {
    this.clockListeners.add(listener);
    return () => this.clockListeners.delete(listener);
  }

  private advance() {
    this.tick++;

    // A market tick updates several shared symbols at once. All subscribed
    // windows observe the same burst, as they would with a real upstream feed.
    for (let offset = 0; offset < 5; offset++) {
      const seed = quoteSeeds[(this.tick * 5 + offset * 7) % quoteSeeds.length];
      const current = this.get(seed.symbol);
      const hash = symbolHash(seed.symbol);
      const phase = this.tick * (0.19 + (hash % 7) * 0.009) + hash * 0.00003;
      const impulse = Math.sin(phase) * 0.00042 + Math.sin(phase * 0.37) * 0.00019;
      const nextPrice = Math.max(0.01, current.price * (1 + impulse));
      const change = nextPrice - current.previousClose;
      const next: Quote = {
        ...current,
        price: nextPrice,
        change,
        changePercent: change / current.previousClose * 100,
        bid: nextPrice - Math.max(0.01, nextPrice * 0.000045),
        ask: nextPrice + Math.max(0.01, nextPrice * 0.000045),
        volume: current.volume + 400 + (hash + this.tick * 7919) % 18_000,
        history: [...current.history.slice(-27), nextPrice],
        direction: nextPrice > current.price ? 'up' : nextPrice < current.price ? 'down' : 'flat',
      };

      this.quotes.set(seed.symbol, next);
      for (const listener of this.listeners.get(seed.symbol) || []) listener(next);
    }

    if (this.tick % 4 === 0) {
      const time = new Date();
      for (const listener of this.clockListeners) listener(time);
    }
  }
}

export const market = new MarketFeed();
