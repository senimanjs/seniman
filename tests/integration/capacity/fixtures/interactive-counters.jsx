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

    props.registerHandler(props.index, clickHandler);

    return <section class="counter">
      <span>Counter {props.index + 1}: {displayValue()}</span>
      <button onClick={clickHandler}>Increment</button>
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
      return {
        ...metrics,
        retainedOutputBytes: root.retainedOutputBytes,
        outputBackpressurePaused: root.globalOutputBackpressurePaused,
      };
    },
  };
}
