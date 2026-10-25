// /demo core: per-scene lifetimes (every timer, listener and frame callback a scene starts dies with it), the scene
// contract and the shared stage context. The deck is a presentation: no sockets, no rooms, no API calls.

export type FrameFn = (t: number, dt: number) => void;

/** Everything a scene starts goes through its Life, so leaving (or re-entering) a scene never leaks. */
export class Life {
  alive = true;
  readonly frames: FrameFn[] = [];
  private undo: (() => void)[] = [];
  frame(fn: FrameFn) { this.frames.push(fn); }
  add(fn: () => void) { if (this.alive) this.undo.push(fn); else fn(); }
  timeout(fn: () => void, ms: number) { const id = setTimeout(() => this.alive && fn(), ms); this.add(() => clearTimeout(id)); }
  interval(fn: () => void, ms: number) { const id = setInterval(() => this.alive && fn(), ms); this.add(() => clearInterval(id)); }
  on<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void): void;
  on(target: EventTarget, type: string, fn: (e: Event) => void): void;
  on(target: EventTarget, type: string, fn: (e: Event) => void) { target.addEventListener(type, fn); this.add(() => target.removeEventListener(type, fn)); }
  /** Resolves after ms while the scene is alive; never resolves after it left (so async sequences just stop). */
  sleep(ms: number): Promise<void> { return new Promise((r) => this.timeout(r, ms)); }
  dispose() {
    this.alive = false;
    this.frames.length = 0;
    for (const fn of this.undo.splice(0).reverse()) { try { fn(); } catch (e) { console.warn("[demo] dispose", e); } }
  }
}

export type Track = "grand" | "gemini" | "auth0" | "solana" | "mystery" | "nittany";
export const TRACKS: Record<Track, string> = {
  grand: "Grand Prize",
  gemini: "Best Use of Gemini API",
  auth0: "Best Use of Auth0",
  solana: "Solana",
  mystery: "Mystery Stack",
  nittany: "Nittany AI Challenge",
};

export interface DemoCtx {
  calm: boolean;                      // prefers-reduced-motion: entrances land instantly, slower ambient
  /** A soft beat accent: a smooth, small scale swell of the stage (never a shake or a flash; WCAG 2.3.1). */
  shake(power?: number): void;
  repo: number;                       // featured repo index (R cycles it); scenes read it on mount and on onRepo
  onRepo(fn: (i: number) => void, life: Life): void;
  blip(kind?: "ui" | "boom"): void;
}

export interface SceneHandle { beat?(n: number): void }
export interface Scene {
  id: string;
  title: string;                      // shown small in the corner and in the progress bar tooltip
  tracks?: Track[];
  beats?: number;                     // → steps through beats before moving to the next scene
  mount(el: HTMLElement, life: Life, ctx: DemoCtx): SceneHandle | void;
}

export const W = 1920, H = 1080;

/** Logical-size canvas (pixel art scales up crisply in CSS). */
export function pixelCanvas(w: number, h: number, cls = ""): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  if (cls) c.className = cls;
  return c;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
