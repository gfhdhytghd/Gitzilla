// Small DOM fixture for editor/classroom event tests; no browser rendering claims.
import { vi } from 'vitest';

export class TestNode {
  children: TestNode[] = [];
  parentElement: TestNode | null = null;
  attributes = new Map<string, string>();
  listeners = new Map<string, EventListener[]>();
  className = '';
  private inputValue: string | null = null;
  hidden = false;
  readOnly = false;
  dataset: Record<string, string> = {};
  style = { width: '', setProperty() {} };
  // on<event> properties run in listener order from their first assignment, like a browser's event handler attributes
  private handlers: Record<string, (() => void) | null> = {};
  private setHandler(type: string, run: (() => void) | null) {
    if (run && !(type in this.handlers)) this.addEventListener(type, () => this.handlers[type]?.());
    if (run || type in this.handlers) this.handlers[type] = run;
  }
  get oninput() { return this.handlers.input ?? null; }
  set oninput(run: (() => void) | null) { this.setHandler('input', run); }
  get onchange() { return this.handlers.change ?? null; }
  set onchange(run: (() => void) | null) { this.setHandler('change', run); }
  get onclick() { return this.handlers.click ?? null; }
  set onclick(run: (() => void) | null) { this.setHandler('click', run); }
  private text = '';
  private html = '';
  constructor(readonly tag = 'div') {}
  get value(): string { return this.inputValue ?? (this.tag === 'textarea' ? this.textContent : ''); }
  set value(value: string) { this.inputValue = value; }
  get textContent(): string { return this.text + this.children.map(c => c.textContent).join(''); }
  set textContent(value: string) { this.replaceChildren(); this.text = value; }
  get innerHTML() { return this.html; }
  set innerHTML(value: string) { this.html = value; }
  get childElementCount() { return this.children.filter(c => c.tag !== '#text').length; }
  get lastElementChild(): TestNode | null { return this.children.at(-1) ?? null; }
  get options() { return this.children; }
  classList = {
    contains: (name: string) => this.className.split(' ').includes(name),
    toggle: (name: string, force = !this.classList.contains(name)): boolean => {
      const names = new Set(this.className.split(' ').filter(Boolean));
      if (force) names.add(name); else names.delete(name);
      this.className = [...names].join(' '); return force;
    },
    add: (name: string) => { this.classList.toggle(name, true); },
    remove: (name: string) => { this.classList.toggle(name, false); },
  };
  getAttribute(key: string) { return this.attributes.get(key) ?? null; }
  removeAttribute(key: string) { this.attributes.delete(key); }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
    if (key === 'value') this.value = value;
    if (key === 'hidden') this.hidden = true;
  }
  append(...nodes: TestNode[]) {
    for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); }
  }
  prepend(...nodes: TestNode[]) {
    for (const node of [...nodes].reverse()) { node.remove(); node.parentElement = this; this.children.unshift(node); }
  }
  get firstElementChild(): TestNode | null { return this.children[0] ?? null; }
  closest(selector: string): TestNode | null {
    for (let node: TestNode | null = this; node; node = node.parentElement) if (node.parentElement?.querySelectorAll(selector).includes(node)) return node;
    return null;
  }
  replaceChildren(...nodes: TestNode[]) {
    for (const node of this.children) node.parentElement = null;
    this.children = []; this.text = ''; this.append(...nodes);
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this);
    this.parentElement = null;
  }
  after(node: TestNode) {
    const parent = this.parentElement;
    if (!parent) return;
    node.remove(); node.parentElement = parent; parent.children.splice(parent.children.indexOf(this) + 1, 0, node);
  }
  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  dispatchEvent(event: Event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }
  click() { this.dispatchEvent(new Event('click')); }
  focus() {}
  scrollIntoView() {}
  querySelectorAll(selector: string): TestNode[] {
    const matches = (node: TestNode) => {
      const attr = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
      if (attr) return node.attributes.get(attr[1]) === attr[2];
      if (selector.startsWith('.')) return node.classList.contains(selector.slice(1).split(':')[0]) && (!selector.endsWith(':not(:empty)') || !!node.textContent);
      return node.tag === selector;
    };
    return this.children.flatMap(node => [...(matches(node) ? [node] : []), ...node.querySelectorAll(selector)]);
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
}

export function installTestDom() {
  const body = new TestNode('body');
  const document = {
    body, documentElement: { lang: 'en' },
    createElement: (tag: string) => new TestNode(tag),
    createTextNode: (text: string) => { const node = new TestNode('#text'); node.textContent = text; return node; },
  };
  const values = new Map<string, string>();
  vi.stubGlobal('Node', TestNode);
  vi.stubGlobal('document', document);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  return { body, values };
}
