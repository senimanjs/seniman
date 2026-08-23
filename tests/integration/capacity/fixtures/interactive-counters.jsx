import {
  createChannel,
  createHandler,
  createRoot,
  onDispose,
  useClient,
  useState,
} from '../../../../packages/seniman/dist/index.js';

const DEFAULT_COUNTER_COUNT = 50;
const PARAGRAPH = 'Seniman keeps component state and event handlers on the server while a compact browser runtime applies streamed DOM operations. ';

export function createFixture(options = {}) {
  const counterCount = options.counterCount || DEFAULT_COUNTER_COUNT;
  const outputBytes = options.outputBytes || 0;
  const outputPadding = 'x'.repeat(outputBytes);
  const metrics = {
    activeWindows: 0,
    clicksHandled: 0,
    windowsCreated: 0,
    windowsDestroyed: 0,
  };

  function Counter(props) {
    const [count, setCount] = useState(0);
    const displayValue = () => {
      const value = count();
      return outputBytes ? `${value}:${outputPadding}` : value;
    };
    const clickHandler = createHandler(() => {
      metrics.clicksHandled++;
      setCount(value => value + 1);
    });
    const tracedClickHandler = $c(event => {
      const marker = event.currentTarget.previousElementSibling;
      const valueBefore = marker.textContent;
      const startedAt = performance.now();
      let observer = new MutationObserver(() => {
        if (marker.textContent !== valueBefore) {
          const completedAt = performance.now();
          const sample = {
            counterLabel: valueBefore.split(':', 1)[0],
            latencyMs: completedAt - startedAt,
            startedAt,
            completedAt,
          };
          window.__senimanInputLatencySamples ||= [];
          window.__senimanInputLatencySamples.push(sample);
          window.dispatchEvent(new CustomEvent('seniman-input-latency', { detail: sample }));
          clearTimeout(observerTimeout);
          observer.disconnect();
        }
      });
      const observerTimeout = setTimeout(() => observer.disconnect(), 10000);

      observer.observe(marker, {
        characterData: true,
        childList: true,
        subtree: true,
      });
      $s(clickHandler)();
    });

    props.registerHandler(props.index, clickHandler);

    return <section class="counter">
      <span>Counter {props.index + 1}: {displayValue()}</span>
      <button onClick={tracedClickHandler}>Increment</button>
    </section>;
  }

  function App() {
    const client = useClient();
    const controlChannel = createChannel();
    const handlers = new Array(counterCount).fill(null);
    const clientLabel = client.location.searchParams().get('benchmarkClient') || 'unknown';

    metrics.activeWindows++;
    metrics.windowsCreated++;

    let announcementTimer;
    const announceHandlers = () => {
      if (handlers.every(Boolean)) {
        controlChannel.send({
          type: 'benchmark-handlers',
          handlerIds: handlers.map(handler => handler.id),
        });
      } else {
        announcementTimer = setTimeout(announceHandlers, 10);
      }
    };
    announcementTimer = setTimeout(announceHandlers, 10);

    onDispose(() => {
      clearTimeout(announcementTimer);
      metrics.activeWindows--;
      metrics.windowsDestroyed++;
    });

    return <main>
      <h1>Interactive capacity fixture</h1>
      <p>Window: {clientLabel}</p>
      <p>{PARAGRAPH.repeat(12)}</p>
      <div class="counter-grid">
        {Array.from({ length: counterCount }, (_, index) =>
          <Counter
            index={index}
            registerHandler={(handlerIndex, handler) => {
              handlers[handlerIndex] = handler;
            }}
          />
        )}
      </div>
    </main>;
  }

  const root = createRoot(App);
  // The load generator intentionally creates many windows from one IP. Keep
  // application rate limiting out of this framework-capacity measurement.
  root.setRateLimit({ disabled: true });

  return {
    root,
    metadata: {
      name: 'interactive-counters',
      counterCount,
      outputBytes,
      paragraphBytes: Buffer.byteLength(PARAGRAPH.repeat(12)),
    },
    getMetrics() {
      let outputPageBytes = 0;
      let outputPageCount = 0;

      for (let window of root.windows) {
        for (let page of window.pages) {
          outputPageBytes += page.buffer.length;
          outputPageCount++;
        }
      }

      return {
        ...metrics,
        retainedOutputBytes: root.retainedOutputBytes,
        outputBackpressurePaused: root.globalOutputBackpressurePaused,
        outputPageBytes,
        outputPageCount,
      };
    },
  };
}
