import {
  Anchor,
  createChannel,
  createCollection,
  createContext,
  createHandler,
  createRef,
  createRoot,
  createSequence,
  preventDefault,
  useClient,
  useContext,
  useMemo,
  useState,
  withValue,
  type Accessor,
  type Component,
  type SenimanNode
} from 'seniman';
import { createCoreEntrypoint } from 'seniman/entrypoint';
import { createEntrypoint } from 'seniman/node';
import { Link, Meta, Script, Style, Title } from 'seniman/head';
import senimanBabelPlugin from 'seniman/babel';

interface Todo {
  id: number;
  title: string;
}

const Theme = createContext<'light' | 'dark'>('light');

const TodoRow: Component<{ todo: Accessor<Todo> }> = props => (
  <li classList={{ completed: false }}>{props.todo().title}</li>
);

function App() {
  const [count, setCount] = useState(0);
  const doubled = useMemo(() => count() * 2);
  const todos = createCollection<Todo>([{ id: 1, title: 'Write types' }]);
  const messages = createChannel<string>();
  const button = createRef<HTMLButtonElement>();
  const save = createHandler((value: string) => messages.send(value));
  const client = useClient();
  const theme = useContext(Theme);
  const sequence = createSequence(['ready']);

  sequence.push(() => doubled());
  client.location.setHref('/next');

  const clientClick = $c((event: MouseEvent) => {
    event.preventDefault();
    $s(save)('clicked');
  });

  const content: SenimanNode = todos.map(todo => <TodoRow todo={todo} />);

  return (
    <Theme.Provider value={theme}>
      <Title text="Typed app" />
      <Meta name="description" content="Seniman TypeScript declarations" />
      <Style text="button { color: red }" />
      <Script src="/client.js" />
      <Link rel="preload" href="/client.js" as="script" />
      <Anchor href="/">Home</Anchor>
      <input onChange={withValue(value => setCount(value.length))} />
      <form onSubmit={preventDefault(() => undefined)}>
        <button ref={button} onClick={clientClick}>{doubled()}</button>
      </form>
      {content}
    </Theme.Provider>
  );
}

const root = createRoot(App);
const nodeEntrypoint = createEntrypoint(root);
const coreEntrypoint = createCoreEntrypoint(root);

void nodeEntrypoint;
void coreEntrypoint;
void TodoRow;
void senimanBabelPlugin;
