import {
  createChannel,
  createHandler,
  onDispose,
  createRoot,
  useState,
} from 'seniman';
import { serve } from 'seniman/node';
import { Style, Title, Meta } from 'seniman/head';
import {
  market,
  watchlists,
  type Quote,
  type WatchlistName,
} from './market.js';
import { cssText } from './styles.js';

const tapeSymbols = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'GLD'];
const indexSymbols = ['SPY', 'QQQ', 'IWM', 'GLD'];
const indexLabels: Record<string, string> = {
  SPY: 'S&P 500',
  QQQ: 'NASDAQ 100',
  IWM: 'RUSSELL 2000',
  GLD: 'GOLD',
};

const news = [
  ['10:42', 'Chipmakers lead the session as data-center demand lifts the broader technology complex.'],
  ['10:31', 'Treasury yields edge lower following a steady reading in regional manufacturing activity.'],
  ['10:18', 'Energy shares advance with crude holding above its five-day moving average.'],
  ['09:57', 'Market breadth improves: advancing issues now outnumber decliners by 1.7 to 1.'],
];

function formatPrice(value: number) {
  return value >= 1000
    ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value.toFixed(2);
}

function formatSigned(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatVolume(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  return `${(value / 1_000).toFixed(1)}K`;
}

interface FormattedQuote {
  price: string;
  signedChange: string;
  percent: string;
  bid: string;
  ask: string;
  volume: string;
  sectorUpper: string;
}

// Quote objects and clock Date objects are immutable and shared by every
// window. Format each version once instead of repeating ICU/number formatting
// thousands of times for identical output.
const formattedQuoteCache = new WeakMap<Quote, FormattedQuote>();
const formattedClockCache = new WeakMap<Date, string>();

function formattedQuote(quote: Quote) {
  let formatted = formattedQuoteCache.get(quote);
  if (!formatted) {
    formatted = {
      price: formatPrice(quote.price),
      signedChange: formatSigned(quote.change),
      percent: formatPercent(quote.changePercent),
      bid: formatPrice(quote.bid),
      ask: formatPrice(quote.ask),
      volume: formatVolume(quote.volume),
      sectorUpper: quote.sector.toUpperCase(),
    };
    formattedQuoteCache.set(quote, formatted);
  }
  return formatted;
}

function formattedMarketTime(time: Date) {
  let formatted = formattedClockCache.get(time);
  if (!formatted) {
    formatted = time.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/New_York',
    });
    formattedClockCache.set(time, formatted);
  }
  return formatted;
}

// Every window observes the same immutable history array for a quote version.
// Cache its serialized SVG geometry globally so windows do not each run the
// same projection. Relative path coordinates preserve the original 0.1px
// geometry while avoiding repeated absolute coordinates on the wire.
const chartPathCache = new WeakMap<number[], Map<string, string>>();

function compactCoordinate(value: number) {
  const fixed = value.toFixed(1);
  if (fixed.endsWith('.0')) return fixed.slice(0, -2);
  if (fixed.startsWith('0.')) return fixed.slice(1);
  if (fixed.startsWith('-0.')) return `-${fixed.slice(2)}`;
  return fixed;
}

function chartPath(history: number[], width: number, height: number) {
  const cacheKey = `${width}x${height}`;
  let historyCache = chartPathCache.get(history);
  const cached = historyCache?.get(cacheKey);
  if (cached !== undefined) return cached;

  const minimum = Math.min(...history);
  const maximum = Math.max(...history);
  const range = maximum - minimum || 1;
  const coordinates = history.map((value, index) => {
    const x = index / Math.max(1, history.length - 1) * width;
    const y = height - 2 - (value - minimum) / range * (height - 4);
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });
  const [firstX, firstY] = coordinates[0];
  let path = `m${compactCoordinate(firstX)} ${compactCoordinate(firstY)}`;

  for (let index = 1; index < coordinates.length; index++) {
    const [x, y] = coordinates[index];
    const [previousX, previousY] = coordinates[index - 1];
    path += ` ${compactCoordinate(x - previousX)} ${compactCoordinate(y - previousY)}`;
  }

  if (!historyCache) {
    historyCache = new Map();
    chartPathCache.set(history, historyCache);
  }
  historyCache.set(cacheKey, path);
  return path;
}

function useQuote(symbol: string) {
  const [getQuote, setQuote] = useState(market.get(symbol));
  const unsubscribe = market.subscribe(symbol, setQuote);
  onDispose(unsubscribe);
  return getQuote;
}

function LiveClock() {
  const [getTime, setTime] = useState(new Date());
  const unsubscribe = market.subscribeClock(setTime);
  onDispose(unsubscribe);

  return <span class="market-time">
    {formattedMarketTime(getTime())} ET
  </span>;
}

function TapeQuote({ symbol }: { symbol: string }) {
  const quote = useQuote(symbol);
  return <div class="tape-item">
    <span class="tape-symbol">{symbol}</span>
    <span class="tape-price">{formattedQuote(quote()).price}</span>
    <span class={quote().changePercent >= 0 ? 'positive' : 'negative'}>
      {formattedQuote(quote()).percent}
    </span>
  </div>;
}

function MiniChart({ quote, width = 75, height = 24 }: {
  quote: () => Quote;
  width?: number;
  height?: number;
}) {
  return <svg class="mini-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
    <path
      d={chartPath(quote().history, width, height)}
      stroke={quote().changePercent >= 0 ? '#41dda0' : '#ff6b78'}
    />
  </svg>;
}

function IndexCard({ symbol }: { symbol: string }) {
  const quote = useQuote(symbol);
  return <div class="index-card">
    <div class="index-top">
      <span class="index-label">{indexLabels[symbol]}</span>
      <span class={quote().changePercent >= 0 ? 'positive' : 'negative'}>
        {formattedQuote(quote()).percent}
      </span>
    </div>
    <div class="index-bottom">
      <span class="index-value">{formattedQuote(quote()).price}</span>
      <MiniChart quote={quote} />
    </div>
  </div>;
}

function QuoteRow({
  symbol,
  selectedSymbol,
  onSelect,
  registerSelectionHandler,
}: {
  symbol: string;
  selectedSymbol: () => string;
  onSelect: (symbol: string) => void;
  registerSelectionHandler: (handlerId: number) => void;
}) {
  const quote = useQuote(symbol);
  const selectionHandler = createHandler(() => onSelect(symbol));
  registerSelectionHandler(selectionHandler.id);
  const tracedSelectionHandler = $c((event) => {
    const expectedSymbol = event.currentTarget.dataset.symbol;
    const startedAt = performance.now();
    const panel = document.getElementById('selection-detail-panel');
    const markerBefore = document.getElementById('selection-applied-marker')?.textContent;
    let observer = new MutationObserver(() => {
      const marker = document.getElementById('selection-applied-marker');
      if (
        marker &&
        marker.dataset.symbol === expectedSymbol &&
        marker.textContent !== markerBefore
      ) {
        const completedAt = performance.now();
        const sample = {
          symbol: expectedSymbol,
          latencyMs: completedAt - startedAt,
          startedAt,
          completedAt,
        };
        const traceWindow = window as any;
        traceWindow.__senimanInputLatencySamples ||= [];
        traceWindow.__senimanInputLatencySamples.push(sample);
        window.dispatchEvent(new CustomEvent('seniman-input-latency', { detail: sample }));
        clearTimeout(observerTimeout);
        observer.disconnect();
      }
    });
    const observerTimeout = setTimeout(() => observer.disconnect(), 10000);

    observer.observe(panel!, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    $s(selectionHandler)();
  });

  return <tr
    class={selectedSymbol() === symbol ? 'selected' : ''}
    data-symbol={symbol}
    onClick={tracedSelectionHandler}
  >
    <td class="star">◇</td>
    <td class="symbol-cell">
      <span class="symbol">{symbol}</span>
      <span class="company">{market.get(symbol).name}</span>
    </td>
    <td class="last-price">{formattedQuote(quote()).price}</td>
    <td class={quote().change >= 0 ? 'positive' : 'negative'}>{formattedQuote(quote()).signedChange}</td>
    <td>
      <span class={`change-chip ${quote().changePercent >= 0 ? 'positive' : 'negative'}`}>
        {formattedQuote(quote()).percent}
      </span>
    </td>
    <td>{formattedQuote(quote()).bid}</td>
    <td>{formattedQuote(quote()).ask}</td>
    <td class="volume">{formattedQuote(quote()).volume}</td>
    <td>
      <svg class="row-chart" viewBox="0 0 68 22" preserveAspectRatio="none" aria-hidden="true">
        <path
          d={chartPath(quote().history, 68, 22)}
          stroke={quote().changePercent >= 0 ? '#41dda0' : '#ff6b78'}
        />
      </svg>
    </td>
  </tr>;
}

function Mover({ symbol }: { symbol: string }) {
  const quote = useQuote(symbol);
  return <div class="mover-row">
    <span class="mover-symbol">{symbol}</span>
    <span class="mover-price">{formattedQuote(quote()).price}</span>
    <span class={`mover-change ${quote().changePercent >= 0 ? 'positive' : 'negative'}`}>
      {formattedQuote(quote()).percent}
    </span>
  </div>;
}

function MarketOverview({ quote, selectionRevision }: {
  quote: () => Quote;
  selectionRevision: () => number;
}) {
  return <div class="side-section">
    <div class="section-heading">
      <span class="section-title">Market overview</span>
      <span class="section-meta">1D · LIVE</span>
    </div>
    <div class="hero-quote">
      <div>
        <div class="hero-symbol">{quote().symbol} · {formattedQuote(quote()).sectorUpper}</div>
        <div class="hero-price">{formattedQuote(quote()).price}</div>
      </div>
      <div class={quote().changePercent >= 0 ? 'positive' : 'negative'}>
        {formattedQuote(quote()).percent}
      </div>
    </div>
    <svg class="hero-chart" viewBox="0 0 270 105" preserveAspectRatio="none" aria-label="S&P 500 intraday chart">
      <line class="chart-grid" x1="0" y1="26" x2="270" y2="26" />
      <line class="chart-grid" x1="0" y1="52" x2="270" y2="52" />
      <line class="chart-grid" x1="0" y1="78" x2="270" y2="78" />
      <path d={chartPath(quote().history, 270, 105)} />
    </svg>
    <div
      id="selection-applied-marker"
      class="selection-applied-marker"
      data-symbol={quote().symbol}
    >{quote().symbol}:{selectionRevision()}</div>
  </div>;
}

function Rail() {
  return <aside class="rail">
    <nav class="rail-nav" aria-label="Terminal sections">
      <button class="rail-button active" title="Markets">MK</button>
      <button class="rail-button" title="Charts">CH</button>
      <button class="rail-button" title="News">NW</button>
      <div class="rail-separator" />
      <button class="rail-button" title="Alerts">AL</button>
      <button class="rail-button" title="Settings">ST</button>
    </nav>
  </aside>;
}

function Header() {
  return <>
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">N</div>
        <div class="brand-name">NORTHSTAR <span>// MARKETS</span></div>
      </div>
      <div class="command-bar">
        <span class="command-key">⌘</span>
        <span class="command-placeholder">Search securities, commands, news…</span>
        <span class="command-shortcut">CTRL K</span>
      </div>
      <div class="market-status">
        <div class="live-pill"><span class="live-dot" /> MARKET OPEN</div>
        <LiveClock />
      </div>
    </header>
    <div class="ticker-tape">
      {tapeSymbols.map(symbol => <TapeQuote symbol={symbol} />)}
    </div>
  </>;
}

function WatchlistPanel({
  selectedSymbol,
  onSelect,
  registerSelectionHandler,
}: {
  selectedSymbol: () => string;
  onSelect: (symbol: string) => void;
  registerSelectionHandler: (handlerId: number) => void;
}) {
  const [getView, setView] = useState<WatchlistName>('Watchlist');
  const names = Object.keys(watchlists) as WatchlistName[];

  return <div class="panel">
    <div class="panel-toolbar">
      <div class="view-tabs">
        {names.map(name => <button
          class={`view-tab ${getView() === name ? 'active' : ''}`}
          onClick={() => setView(name)}
        >{name}</button>)}
      </div>
      <div class="toolbar-tools">
        <button class="tool-button">FILTER</button>
        <button class="tool-button">＋ ADD</button>
      </div>
    </div>
    <table class="quote-table">
      <colgroup>
        <col style={{ width: '34px' }} />
        <col style={{ width: '145px' }} />
        <col style={{ width: '78px' }} />
        <col style={{ width: '70px' }} />
        <col style={{ width: '78px' }} />
        <col style={{ width: '76px' }} />
        <col style={{ width: '76px' }} />
        <col style={{ width: '84px' }} />
        <col style={{ width: '88px' }} />
      </colgroup>
      <thead>
        <tr><th></th><th>Security</th><th>Last</th><th>Change</th><th>Change %</th><th>Bid</th><th>Ask</th><th>Volume</th><th>1D trend</th></tr>
      </thead>
      <tbody>
        {watchlists[getView()].map(symbol => <QuoteRow
          symbol={symbol}
          selectedSymbol={selectedSymbol}
          onSelect={onSelect}
          registerSelectionHandler={registerSelectionHandler}
        />)}
      </tbody>
    </table>
  </div>;
}

function SidePanel({ selectedQuote, selectionRevision }: {
  selectedQuote: () => Quote;
  selectionRevision: () => number;
}) {
  return <aside id="selection-detail-panel" class="side-panel">
    <MarketOverview
      quote={selectedQuote}
      selectionRevision={selectionRevision}
    />
    <div class="side-section">
      <div class="section-heading">
        <span class="section-title">Top movers</span>
        <span class="section-meta">US EQUITIES</span>
      </div>
      <div class="mover-list">
        {['PLTR', 'NVDA', 'AVGO', 'TSLA', 'UBER'].map(symbol => <Mover symbol={symbol} />)}
      </div>
    </div>
    <div class="side-section">
      <div class="section-heading">
        <span class="section-title">Market pulse</span>
        <span class="section-meta">LATEST</span>
      </div>
      <div class="news-list">
        {news.map(([time, title]) => <article class="news-item">
          <div class="news-time">{time} ET</div>
          <div class="news-title">{title}</div>
        </article>)}
      </div>
    </div>
  </aside>;
}

function App() {
  const [getSelectedSymbol, setSelectedSymbol] = useState('SPY');
  const [getSelectedQuote, setSelectedQuote] = useState(market.get('SPY'));
  const [getSelectionRevision, setSelectionRevision] = useState(0);
  const benchmarkChannel = createChannel();
  const selectionHandlerIds: number[] = [];
  let announcementTimer: ReturnType<typeof setTimeout> | null = null;

  let unsubscribeSelectedQuote = market.subscribe('SPY', setSelectedQuote);
  onDispose(() => unsubscribeSelectedQuote());

  const selectSymbol = (symbol: string) => {
    if (getSelectedSymbol() !== symbol) {
      unsubscribeSelectedQuote();
      setSelectedSymbol(symbol);
      setSelectedQuote(market.get(symbol));
      unsubscribeSelectedQuote = market.subscribe(symbol, setSelectedQuote);
    }
    setSelectionRevision(revision => revision + 1);
  };
  const registerSelectionHandler = (handlerId: number) => {
    selectionHandlerIds.push(handlerId);
    if (
      process.env.LOAD_TEST === '1' &&
      selectionHandlerIds.length === watchlists.Watchlist.length
    ) {
      announcementTimer = setTimeout(() => {
        benchmarkChannel.send({
          type: 'benchmark-selection-handlers',
          handlerIds: selectionHandlerIds.slice(),
        });
      }, 10);
    }
  };
  onDispose(() => {
    if (announcementTimer) clearTimeout(announcementTimer);
  });

  return <div class="terminal-shell">
    <Title text="Northstar Markets · Live Terminal" />
    <Meta name="viewport" content="width=device-width, initial-scale=1" />
    <Style text={cssText} />
    <Header />
      <main class="app-grid">
        <Rail />
        <section class="workspace">
          <div class="workspace-heading">
            <div>
              <div class="eyebrow">Live workspace</div>
              <h1>US market monitor</h1>
            </div>
            <div class="session-note">REGULAR SESSION · NYSE / NASDAQ</div>
          </div>
          <div class="index-grid">
            {indexSymbols.map(symbol => <IndexCard symbol={symbol} />)}
          </div>
          <WatchlistPanel
            selectedSymbol={getSelectedSymbol}
            onSelect={selectSymbol}
            registerSelectionHandler={registerSelectionHandler}
          />
        </section>
        <SidePanel
          selectedQuote={getSelectedQuote}
          selectionRevision={getSelectionRevision}
        />
      </main>
      <footer class="footer-status">
        <div class="status-group">
          <span class="status-good">● FEED HEALTHY</span>
          <span>24 SYMBOLS</span>
          <span>250MS TICK</span>
        </div>
        <span>POWERED BY SENIMAN</span>
      </footer>
  </div>;
}

const root = createRoot(App);

// Capacity clients originate from one local IP. Keep production-safe rate
// limiting by default and require an explicit opt-in for local load tests.
if (process.env.LOAD_TEST === '1') {
  root.setRateLimit({ disabled: true });
}

serve(root, Number(process.env.PORT || 3025));
