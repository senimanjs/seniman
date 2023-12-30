import { createContext, onDispose, useState, useContext, untrack, useEffect, createHandler } from "./index.js";

export const HeadContext = createContext();

export function createHeadContextValue(sequence) {
  let headElementsId = 1;
  let titleStack = [];
  let [getTitle, setTitle] = useState(null);

  sequence.insert(0, [<title>{getTitle()}</title>]);

  let ids = [];

  function push(element) {
    sequence.push([element]);
  }

  return {
    addTitle: (title) => {
      let id = headElementsId++;
      titleStack.push({ id, title });

      setTitle(title);

      return id;
    },

    changeTitle: (id, title) => {
      let index = titleStack.findIndex((item) => item.id == id);

      if (index == -1) {
        throw new Error("Title not found");
      }

      titleStack[index].title = title;

      if (index == titleStack.length - 1) {
        setTitle(title);
      }
    },

    removeTitle: (id) => {
      let index = titleStack.findIndex((item) => item.id == id);

      if (index == -1) {
        throw new Error("Title not found");
      }

      titleStack.splice(index, 1);

      // if the removed title is the current title, set the client title to the now topmost title
      if (index == titleStack.length && titleStack.length > 0) {
        setTitle(titleStack[titleStack.length - 1].title);
      }
    },

    add: (element) => {
      let id = headElementsId++;
      ids.push(id);

      push(element);

      return id;
    },

    remove: (id) => {

      // find id index in ids
      let index = ids.findIndex((item) => item == id);

      if (index == -1) {
        console.error("Element not found");
        return;
      }

      // remove from ids
      ids.splice(index, 1);

      // remove from collection
      sequence.remove(index, 1);
    }
  };
}

export function Title(props) {
  let head = useContext(HeadContext);
  let id = null;

  useEffect(() => {
    if (id != null) {
      head.changeTitle(id, props.text);
    } else {
      id = head.addTitle(props.text);
    }
  });

  onDispose(() => {
    head.removeTitle(id);
  });

  return "";
}

export function Style(props) {
  let head = useContext(HeadContext);
  let id = head.add(<style type={props.type}>{props.text}</style>);

  onDispose(() => {
    head.remove(id);
  });

  return "";
}

export function Meta(props) {
  let head = useContext(HeadContext);

  let id = head.add(<meta
    name={props.name}
    content={props.content}
    http-equiv={props.httpEquiv}
    charset={props.charset}
  />);

  onDispose(() => {
    head.remove(id);
  });

  return "";
}

export function Script(props) {
  let head = useContext(HeadContext);

  let id = head.add(<script src={props.src} onLoad={props.onLoad}></script>);

  onDispose(() => {
    head.remove(id);
  });

  return "";
}

export function Link(props) {
  let head = useContext(HeadContext);

  let id = head.add(<link
    rel={props.rel}
    href={props.href}
    type={props.type}
    as={props.as}
    crossorigin={props.crossorigin}
    media={props.media}
    onLoad={props.onLoad}
  />);

  onDispose(() => {
    head.remove(id);
  });

  return "";
}