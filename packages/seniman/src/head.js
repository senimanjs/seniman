import { createContext, onDispose, useContext, untrack, useEffect, createHandler } from "./index.js";

export const HeadContext = createContext();

let CMD_HEAD_SET_TITLE = 1;
let CMD_HEAD_ADD_STYLE = 2;
let CMD_HEAD_ADD_LINK = 3;
let CMD_HEAD_ADD_SCRIPT = 4;
let CMD_HEAD_ADD_META = 5;
let CMD_HEAD_REMOVE = 6;

export function createHeadContextValue(client) {
  let headElementsId = 1;
  let titleStack = [];
  let loadedScriptSrcSet = new Set();

  function syncTitle(title) {
    client._modifyHead({
      type: CMD_HEAD_SET_TITLE,
      value: title
    });
  }

  return {
    addTitle: (title) => {
      let id = headElementsId++;
      titleStack.push({ id, title });

      syncTitle(title);

      return id;
    },

    changeTitle: (id, title) => {
      let index = titleStack.findIndex((item) => item.id == id);

      if (index == -1) {
        throw new Error("Title not found");
      }

      titleStack[index].title = title;

      if (index == titleStack.length - 1) {
        syncTitle(title);
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
        syncTitle(titleStack[titleStack.length - 1].title);
      }
    },

    addStyle: (styleText) => {
      let id = headElementsId++;

      client._modifyHead({
        type: CMD_HEAD_ADD_STYLE,
        id,
        text: styleText,
        attributes: {}
      });

      return id;
    },

    addMeta: (attributes) => {
      let id = headElementsId++;

      client._modifyHead({
        type: CMD_HEAD_ADD_META,
        id,
        attributes
      });

      return id;
    },

    addLink: (attributes) => {
      let id = headElementsId++;

      client._modifyHead({
        type: CMD_HEAD_ADD_LINK,
        id,
        attributes
      });

      return id;
    },

    addScript: (src, onLoad) => {
      let id = headElementsId++;

      client._modifyHead({
        type: CMD_HEAD_ADD_SCRIPT,
        id,
        attributes: { src },
        onLoad
      });

      return id;
    },

    remove: (id) => {
      client._modifyHead({
        type: CMD_HEAD_REMOVE,
        id
      });
    },

    registerScriptLoaded: (src) => {
      // TODO: check on the addScript side if the script is already loaded
      loadedScriptSrcSet.add(src);
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

  // TODO: enable reactivity
  let id = head.addStyle(untrack(() => props.text));

  onDispose(() => {
    head.remove(id);
  });

  return "";
}

export function Meta(props) {
  let head = useContext(HeadContext);

  // TODO: enable reactivity
  let id = head.addMeta(untrack(() => ({
    name: props.name,
    content: props.content,
    "http-equiv": props.httpEquiv,
    charset: props.charset
  })));

  onDispose(() => {
    head.remove(id);
  });

  return "";
}

export function Script(props) {
  let head = useContext(HeadContext);

  let onLoadHandler = createHandler(() => {
    head.registerScriptLoaded(props.src);

    if (props.onLoad) {
      props.onLoad();
    }
  });

  // TODO: enable reactivity
  // TODO: support textual script
  let id = head.addScript(untrack(() => props.src), onLoadHandler);

  onDispose(() => {
    head.remove(id);
  });

  return "";
}

export function Link(props) {
  let head = useContext(HeadContext);

  // TODO: enable reactivity
  let id = head.addLink(untrack(() => ({
    rel: props.rel,
    href: props.href,
    type: props.type,
    as: props.as,
    crossorigin: props.crossorigin,
    media: props.media
  })));

  onDispose(() => {
    head.remove(id);
  });

  return "";
}
