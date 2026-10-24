import { t } from '../i18n';
// Small DOM + misc helpers shared by the app screens.

type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | number | null | undefined | false;

/** Tiny hyperscript: h("div.card.ready", { onclick }, "text", child) */
export function h<K extends keyof HTMLElementTagNameMap>(sel: K | `${K}.${string}` | `${K}#${string}`, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K];
export function h(sel: string, attrs?: Attrs | null, ...children: Child[]): HTMLElement;
export function h(sel: string, attrs?: Attrs | null, ...children: Child[]): HTMLElement {
  const [tagAndId, ...classes] = sel.split(".");
  const [tag, id] = tagAndId.split("#");
  const el = document.createElement(tag || "div");
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(" ");
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
      else if (k === "class") el.className += (el.className ? " " : "") + v;
      else if (k === "html") el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** "https://github.com/foo/bar.git" -> "foo/bar" (best effort) */
export function normalizeRepo(input: string): string {
  let s = input.trim();
  s = s.replace(/^https?:\/\//, "").replace(/^(www\.)?github\.com\//, "").replace(/\.git$/, "");
  s = s.replace(/[?#].*$/, "").replace(/\/+$/, "");
  const parts = s.split("/").filter(Boolean);
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : s;
}

export function shortRepo(slug: string | null | undefined): string {
  if (!slug) return "";
  const i = slug.indexOf("/");
  return i >= 0 ? slug.slice(i + 1) : slug;
}

export const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* private mode */
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

/** Phones: coarse pointer and a short side under 600 CSS px. These play in PORTRAIT. */
export const isPhone = () => matchMedia("(pointer: coarse)").matches && Math.min(innerWidth, innerHeight) < 600;

export const isTouchDevice = () => matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

/** Typewriter effect into an element; returns a cancel fn. */
export function typeInto(el: HTMLElement, text: string, cps = 40, done?: () => void): () => void {
  text = t(text);
  let i = 0;
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    i++;
    el.textContent = text.slice(0, i);
    if (i < text.length) setTimeout(tick, 1000 / cps);
    else done?.();
  };
  tick();
  return () => (cancelled = true);
}

/** ASCII progress bar: [#######.......] */
export function asciiBar(frac: number, width = 16, full = "#", empty = "."): string {
  const n = Math.round(clamp(frac, 0, 1) * width);
  return "[" + full.repeat(n) + empty.repeat(width - n) + "]";
}

/** Load Google pixel fonts before drawing text into canvases. */
export const fontsReady: Promise<unknown> = (async () => {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('16px "Press Start 2P"'),
        document.fonts.load('16px "VT323"'),
        document.fonts.load('16px "Silkscreen"'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* offline: system mono fallback */
  }
})();
