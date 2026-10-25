// 3D view toggle + thin adapter over claude-boss's client/render/stage25d (docs/tasks/view-25d.md): one three.js
// scene, a fixed tilted camera on screens (?view=25d / Settings switch) and WebXR on Vision Pro (?screen=1&view=xr).
// Presentation only: the sim stays 2D, the stage projects world x/y. Until that module exists (or if it fails to
// load / throws) everything falls back to the 2D renderer.
// Off by default; on with ?view=25d|xr or the Settings switch (remembered in localStorage). ?view=2d forces it off.
import type { MatchState } from "../../shared/types";
import type { View } from "./renderers";
import { store } from "./util";
import { isHeadset } from "./device";

/** What game.ts hands the stage each frame besides the interpolated state (all optional for the stage to use). */
export interface Stage25dExtras {
  you: string | null;
  /** hero the camera is following (you, or the royale hero you're watching) */
  focusId: string | null;
  /** events released this frame (damage numbers, taunts, sparks) */
  events: unknown[];
  theme: string;
  seed: number;
  variant?: "royale" | "classroom";
  world: { w: number; h: number };
  /** screen shake in logical px, applied to the final composite */
  shake: { x: number; y: number };
}

/** The contract from the task card, plus the optional bits a WebGL/XR stage may expose (all feature-checked).
 *  Screen coords = logical view px (0..view.w × 0..view.h: the space game.ts's 2D canvas draws in before RES). */
export interface Stage25d {
  /** three.js draws here; game.ts mounts it under its 2D overlay canvas. Without it the stage draws into `ctx`. */
  canvas?: HTMLCanvasElement;
  render(ctx: CanvasRenderingContext2D, state: MatchState, time: number, view?: View, extras?: Stage25dExtras): void;
  screenToWorld(sx: number, sy: number): { x: number; y: number };
  worldToScreen(x: number, y: number, z?: number): { x: number; y: number; scale: number };
  /** CSS size of the stage box + device pixel ratio (WebGL backing store). */
  resize?(cssW: number, cssH: number, dpr: number): void;
  enterXR?(): Promise<unknown>;
  exitXR?(): Promise<unknown>;
  /** XR viewpoint near one hero (null = overview) */
  setFollow?(playerId: string | null): void;
  setScale?(scale: "table" | "life"): void;
  readonly xrActive?: boolean;
  destroy(): void;
}
type Factory = (opts?: Record<string, unknown>) => Stage25d;
type Mod = { createStage25d?: Factory; xrSupported?: () => Promise<boolean> | boolean };

const KEY = "kaiju.view25d";
const fns = new Set<(on: boolean) => void>();
const forced = (): boolean | null => {
  const v = new URLSearchParams(location.search).get("view");
  return v === "25d" || v === "xr" ? true : v === "2d" ? false : null;
};
/** The player asked for 2.5D (URL wins over the saved switch). */
export const view25dWanted = () => forced() ?? (isHeadset() || store.get(KEY) === "1");
/** Headset spectator page (?screen=1&view=xr). */
export const xrView = () => new URLSearchParams(location.search).get("view") === "xr";
/** The URL pins the view, so the Settings switch only shows what's in effect. */
export const view25dPinned = () => forced() !== null;
export function setView25d(on: boolean) {
  store.set(KEY, on ? "1" : "0");
  fns.forEach((f) => f(view25dWanted()));
}
export function onView25dChange(fn: (on: boolean) => void): () => void {
  fns.add(fn);
  return () => fns.delete(fn);
}

// The glob is empty while the module doesn't exist, so the build never breaks on it.
const mods = import.meta.glob("../render/stage25d/index.ts");
let loading: Promise<Mod | null> | null = null;
function mod(): Promise<Mod | null> {
  return (loading ??= (async () => {
    // test hook: a page/test may inject a stage factory before the game starts (WebKit plumbing checks)
    const injected = (globalThis as { __kaijuStage25d?: Mod }).__kaijuStage25d;
    if (injected?.createStage25d) return injected;
    const load = Object.values(mods)[0];
    if (!load) return null;
    try {
      return (await load()) as Mod;
    } catch (e) {
      console.warn("3D view unavailable, using 2D", e);
      return null;
    }
  })());
}
/** Dev only: ?xr=emulate installs the IWER emulated headset (like the stage gallery) so a desktop Chromium can enter
 *  the XR session. Compiled out of production builds. */
export async function emulateXrIfAsked(): Promise<void> {
  if (!import.meta.env.DEV || new URLSearchParams(location.search).get("xr") !== "emulate") return;
  const { XRDevice, metaQuest3 } = await import("iwer");
  const dev = new XRDevice(metaQuest3);
  dev.installRuntime({ forceInstall: true });
  dev.position.set(0, 1.6, 0.4);
  const pitch = (-35 * Math.PI) / 180; // seated viewer looking down at the tabletop
  dev.quaternion.set(Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2));
}
/** WebXR immersive-vr available here (the stage's own check if it has one, else the browser's). */
export async function xrSupported(): Promise<boolean> {
  const m = await mod();
  if (!m?.createStage25d) return false;
  try {
    if (m.xrSupported) return !!(await m.xrSupported());
    const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
    return !!(await xr?.isSessionSupported("immersive-vr"));
  } catch {
    return false;
  }
}
export const stage25dAvailable = () => Object.keys(mods).length > 0;

/** Create a stage, or null (module missing / failed): the caller keeps drawing 2D. */
export async function createStage(opts?: Record<string, unknown>): Promise<Stage25d | null> {
  const make = (await mod())?.createStage25d;
  if (typeof make !== "function") return null;
  try {
    const st = make(opts);
    (globalThis as { __kaijuStage?: Stage25d }).__kaijuStage = st; // playtests: project / unproject like the game does
    return st;
  } catch (e) {
    console.warn("3D stage failed to start, using 2D", e);
    return null;
  }
}

/** Local affine of the floor projection around world (x, y): lets 2D world-space overlays (the YOU ring, the zone
 *  pointer) be drawn on the tilted floor with ctx.setTransform. Returns [a, b, c, d, e, f] in logical canvas px. */
export function floorAffine(st: Stage25d, x: number, y: number): [number, number, number, number, number, number] {
  const p = st.worldToScreen(x, y, 0), px = st.worldToScreen(x + 1, y, 0), py = st.worldToScreen(x, y + 1, 0);
  const a = px.x - p.x, b = px.y - p.y, c = py.x - p.x, d = py.y - p.y;
  return [a, b, c, d, p.x - (a * x + c * y), p.y - (b * x + d * y)];
}
