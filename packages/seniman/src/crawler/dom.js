export const selfClosingTagSet = new Set([
  'br',
  'hr',
  'img',
  'input',
  'link',
  'meta'
]);

function escape(text) {
  let lookup = {
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
    '<': '&lt;',
    '>': '&gt;'
  };
  return text.replace(/[&"'<>]/g, character => lookup[character]);
}

function createAttributes(values = {}) {
  let attributes = { ...values };
  Object.defineProperty(attributes, Symbol.iterator, {
    enumerable: false,
    value: function* () {
      for (let name of Object.keys(this)) {
        yield { name, value: this[name] };
      }
    }
  });
  return attributes;
}

export class Node {
  constructor() {
    this.parentElement = null;
  }

  get parentNode() {
    return this.parentElement;
  }

  set parentNode(parent) {
    this.parentElement = parent;
  }

  get nextSibling() {
    if (!this.parentElement) {
      return null;
    }

    let siblings = this.parentElement.children;
    let index = siblings.indexOf(this);
    return siblings[index + 1] || null;
  }

  remove() {
    if (!this.parentElement) {
      return;
    }

    let siblings = this.parentElement.children;
    let index = siblings.indexOf(this);
    if (index >= 0) {
      siblings.splice(index, 1);
    }
    this.parentElement = null;
  }

  after(child) {
    if (!this.parentElement) {
      throw new Error('Cannot call after() on a node without a parent');
    }

    this.parentElement.insertBefore(child, this.nextSibling);
  }
}

export class Text extends Node {
  constructor(text) {
    super();
    this.data = text == '<!>' ? '' : String(text);
    this.nodeName = '#text';
  }

  insertInto(parentElement, marker) {
    parentElement.insertBefore(this, marker);
  }

  toString() {
    return escape(this.data);
  }

  cloneNode() {
    return new Text(this.data);
  }

  get textContent() {
    return this.data;
  }
}

export class Element extends Node {
  constructor(tagName) {
    super();
    this.tagName = tagName.toLowerCase();
    this.nodeName = tagName.toUpperCase();
    this.attributes = createAttributes();
    this.styles = {};
    this.children = [];
    this.listeners = new Map();

    this.style = {
      cssText: '',
      setProperty: (key, value) => {
        this.styles[key] = value;
      }
    };
  }

  printAttributes() {
    let string = '';

    for (let key in this.attributes) {
      string += ` ${key}="${this.attributes[key]}"`;
    }

    let styleKeys = Object.keys(this.styles);
    if (styleKeys.length > 0) {
      string += ` style="${styleKeys.map(key => `${key}: ${this.styles[key]}`).join('; ')}"`;
    }
    return string;
  }

  setAttribute(key, value) {
    this.attributes[key] = String(value);
  }

  removeAttribute(key) {
    delete this.attributes[key];
  }

  addEventListener(type, fn) {
    let listeners = this.listeners.get(type);
    if (listeners) {
      listeners.push(fn);
    } else {
      this.listeners.set(type, [fn]);
    }
  }

  toString() {
    if (selfClosingTagSet.has(this.tagName)) {
      return `<${this.tagName}${this.printAttributes()}/>`;
    }
    return `<${this.tagName}${this.printAttributes()}>${this.children.map(child => child.toString()).join('')}</${this.tagName}>`;
  }

  appendChild(child) {
    return this.insertBefore(child, null);
  }

  insertBefore(child, beforeChild) {
    if (child.parentElement) {
      child.remove();
    }

    let index = beforeChild == null
      ? this.children.length
      : this.children.indexOf(beforeChild);

    if (index < 0) {
      throw new Error('Insertion marker is not a child of this element');
    }

    this.children.splice(index, 0, child);
    child.parentElement = this;
    return child;
  }

  cloneNode(deep = false) {
    let element = createElement(this.tagName);
    element.attributes = createAttributes(this.attributes);
    element.styles = { ...this.styles };

    if (deep) {
      for (let child of this.children) {
        element.appendChild(child.cloneNode(true));
      }
    }
    return element;
  }

  get childNodes() {
    return this.children;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  get textContent() {
    return this.children.map(child => child.textContent).join('');
  }
}

export function createElement(tagName) {
  return new Element(tagName);
}
