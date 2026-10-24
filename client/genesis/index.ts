// Genesis: watch code become a character. Public entry point for claude-ui.
//
//   const g = playGenesis(host, { kind: "hero", genesis, kit, progress, slug, compact, onDone });
//   g.update({ progress })            // live: analyzer progress while status === "analyzing"
//   g.update({ genesis, kit })        // the repo finished: the cinematic continues from `parse`
//   g.skip(); g.replay(); g.dispose();
//
// Modes: live (progress first, genesis later) and replay (genesis known: ~8 s, or ~4 s with `condensed`).
// Tap/click the cinematic to skip while playing, or to replay once done (opts.interactive !== false).
// Renders a low-res pixel canvas (integer-scaled, nearest neighbour) plus a crisp text overlay.
import type { BossKit, Genesis, GenesisProgress, PlayerKit } from "../../shared/types.ts";
import { clamp01 } from "./graph.ts";
import { genesisFromKit, isBossKit } from "./local.ts";
import { Live } from "./live.ts";
import { Scene, type Layout, type Rect } from "./scene.ts";
import { TextLayer } from "./text.ts";

export { buildGenesisLocal, genesisFromKit } from "./local.ts";

export interface GenesisOpts {
  kind: "hero" | "boss";
  genesis?: Genesis;
  progress?: GenesisProgress;
  kit?: PlayerKit | BossKit | null;
  slug?: string;              // shown while live (before genesis arrives)
  compact?: boolean;          // phone card (~45% height): fewer terminal lines, bigger character
  condensed?: boolean;        // ~4 s version (pre-fight intro)
  mode?: "battle" | "edu";    // edu: 2x hero, narrated pauses per stage, report card instead of the equal budget
  autoAdvance?: boolean;      // edu: auto-continue after each narration (default: true when compact, else tap)
  interactive?: boolean;      // tap to skip / replay (default true)
  loop?: boolean;             // replay automatically after a pause (demo / attract mode)
  onDone?(): void;
}

export interface GenesisHandle {
  update(next: { progress?: GenesisProgress; genesis?: Genesis; kit?: PlayerKit | BossKit | null }): void;
  skip(): void;
  replay(): void;
  /** Debug / screenshots: freeze the scene at time t (seconds). seek(null) resumes. */
  seek(t: number | null): void;
  dispose(): void;
  readonly done: boolean;
}

// logical canvas height target; bosses get chunkier pixels so the ~130 px monster fills the stage
const TARGET_H = { hero: 215, boss: 185 };
const END_HOLD = 0.9;

export function playGenesis(host: HTMLElement, opts: GenesisOpts): GenesisHandle {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const condensed = !!opts.condensed || reduced;
  const wrap = document.createElement("div");
  wrap.className = "genesis";
  wrap.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden;background:#05070a;contain:strict;" +
    (opts.interactive === false ? "" : "cursor:pointer;");
  const pix = document.createElement("canvas");
  pix.style.cssText = "position:absolute;left:0;top:0;image-rendering:pixelated;image-rendering:crisp-edges;";
  const txt = document.createElement("canvas");
  txt.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;";
  wrap.append(pix, txt);
  host.appendChild(wrap);
  const ctx = pix.getContext("2d")!;
  const text = new TextLayer(txt);

  let kit = opts.kit ?? null;
  let scene: Scene | null = null;
  let live: Live | null = null;
  let t = 0;                 // scene time
  let done = false;
  let doneAt = -1;
  let raf = 0;
  let last = performance.now();
  let disposed = false;
  let frozen: number | null = null;
  let pauses: number[] = [];
  let endFor = 0;
  let pauseIdx = 0;
  let heldFor = 0;
  const auto = opts.autoAdvance ?? (!!opts.compact || opts.interactive === false);
  let layout: Layout | null = null;
  let dpr = 1, s = 1;

  const makeScene = (g: Genesis, startAt = 0) => {
    scene = new Scene(g, kit, opts.kind, condensed, reduced, opts.mode === "edu");
    pauses = scene.pausePoints();
    pauseIdx = 0; heldFor = 0;
    if (layout) scene.setLayout(layout);
    t = startAt;
    done = false;
    doneAt = -1;
  };

  if (opts.genesis) makeScene(opts.genesis);
  else if (opts.progress || !kit) live = new Live(opts.slug ?? kit?.repo ?? "", opts.kind, reduced);
  else makeScene(genesisFromKit(kit));
  if (live && opts.progress) live.push(opts.progress);

  const relayout = () => {
    const r = wrap.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const devW = Math.round(r.width * dpr), devH = Math.round(r.height * dpr);
    s = Math.max(1, Math.round(devH / TARGET_H[opts.kind]));
    if (devH / s < 150) s = Math.max(1, Math.floor(devH / 150));
    const W = Math.ceil(devW / s), H = Math.ceil(devH / s);
    pix.width = W; pix.height = H;
    pix.style.width = `${(W * s) / dpr}px`;
    pix.style.height = `${(H * s) / dpr}px`;
    txt.width = devW; txt.height = devH;
    text.begin(s / dpr, dpr);
    layout = computeLayout(W, H, !!opts.compact, text);
    scene?.setLayout(layout);
    live?.setLayout(layout);
  };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(relayout) : null;
  ro?.observe(wrap);
  relayout();

  const frame = (nowMs: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (nowMs - last) / 1000);
    last = nowMs;
    const now = nowMs / 1000;
    if (!layout) { relayout(); if (!layout) return; }
    text.begin(s / dpr, dpr);
    ctx.imageSmoothingEnabled = false;
    if (scene) {
      // without a kit the map/assemble stages can't run yet: hold at the start of map
      const hold = !kit ? scene.T.at.map[0] : Infinity;
      // edu: hold at each stage end while the narration is read (tap, or auto after a reading delay)
      // hold just before the boundary so the stage being explained is still the current one
      const pauseAt = (pauses[pauseIdx] ?? Infinity) - 1e-3;
      const next = Math.min(t + dt, hold, pauseAt);
      if (next >= pauseAt && frozen === null) {
        heldFor += dt;
        const note = scene.notes?.[scene.stageAt(pauseAt)];
        const read = 2.5 + ((note?.text.length ?? 0) + (note?.fact.length ?? 0)) / 28;
        scene.hold = auto ? Math.min(1, heldFor / read) : -1;
        if (auto && heldFor >= read) { pauseIdx++; heldFor = 0; scene.hold = null; }
      } else scene.hold = null;
      t = frozen ?? next;
      scene.draw(ctx, text, t, now, dt);
      // the finished character + name card stay up >= ~2 s (reveal stage + END_HOLD) before onDone
      if (t >= scene.T.total) endFor += dt; else endFor = 0;
      if (!done && t >= scene.T.total && endFor >= END_HOLD) {
        done = true;
        doneAt = now;
        opts.onDone?.();
      }
      if (done && opts.loop && now - doneAt > 3) replay();
    } else if (live) {
      live.draw(ctx, text, now, dt);
    }
  };
  raf = requestAnimationFrame(frame);

  // Wait for the pixel fonts so the first frames don't flash a fallback face.
  (document as Document & { fonts?: FontFaceSet }).fonts?.load?.('16px "VT323"').catch(() => undefined);

  const skip = () => {
    if (!scene) return;
    t = scene.T.total;
    pauseIdx = pauses.length;
  };
  const replay = () => {
    if (!scene) return;
    makeScene(scene.g);
  };
  if (opts.interactive !== false) {
    wrap.addEventListener("click", () => {
      if (!scene) return;
      if (scene.hold !== null) { pauseIdx++; heldFor = 0; scene.hold = null; return; }
      if (done) replay(); else skip();
    });
  }

  return {
    update(next) {
      if (next.kit !== undefined) {
        kit = next.kit;
        scene?.setKit(kit);
      }
      if (next.genesis && (!scene || scene.g !== next.genesis)) {
        if (scene && scene.g.slug === next.genesis.slug) return; // same repo, keep playing
        // live -> replay: the clone already played for real, so continue from `parse`
        const fromLive = !!live && live.age() > 0.8;
        live = null;
        makeScene(next.genesis);
        if (fromLive && scene) t = (scene as Scene).T.at.parse[0];
        return;
      }
      if (next.progress && live) live.push(next.progress);
      if (!scene && !live && kit) makeScene(genesisFromKit(kit));
      if (!scene && live && kit && next.progress?.stage === "ready") {
        // ready without genesis (server has none): fall back to the kit-only story
        live = null;
        makeScene(genesisFromKit(kit), 0);
      }
    },
    skip,
    replay,
    seek(at) {
      frozen = at;
      if (at !== null && scene) { scene.resetFx(); t = at; }
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      wrap.remove();
    },
    get done() { return done; },
  };
}

function computeLayout(W: number, H: number, compact: boolean, tx: TextLayer): Layout {
  const wide = !compact && W >= H * 1.3 && W >= 300;
  const small = compact || H < 150 || W < 250;
  // text sizes follow the host's CSS height (not the logical pixel size): ~22 px terminal on a 720 px screen
  const cssH = H * tx.k;
  const toL = (px: number) => px / (1.25 * tx.k);
  const headSize = toL(Math.max(12, Math.min(26, cssH / 28)));
  const hh = Math.max(11, Math.ceil(tx.lineH(headSize, "term", 10)) + 3);
  const header: Rect = { x: 0, y: 0, w: W, h: hh };
  const termSize = toL(Math.max(11, Math.min(24, cssH / (small ? 30 : 33))));
  const lh = tx.lineH(termSize, "term", 10);
  let term: Rect, stage: Rect, termLines: number;
  if (wide) {
    const tw = Math.round(Math.min(W * 0.34, Math.max(150, W * 0.3)));
    term = { x: 4, y: hh + 3, w: tw, h: H - hh - 7 };
    stage = { x: term.x + tw + 4, y: hh + 3, w: W - tw - 12, h: H - hh - 7 };
    termLines = Math.floor((term.h - 11) / lh);
  } else {
    termLines = compact ? 3 : H > 320 ? 6 : 4;
    const th = Math.round(termLines * lh + 5);
    stage = { x: 3, y: hh + 2, w: W - 6, h: H - hh - th - 7 };
    term = { x: 3, y: stage.y + stage.h + 3, w: W - 6, h: th };
  }
  const labH = tx.lineH(5.5, "term", 9);
  const langBar: Rect = { x: stage.x + 5, y: stage.y + 4, w: stage.w - 10, h: 3 };
  const cH = Math.ceil(tx.lineH(7, "term", 11) + tx.lineH(5, "term", 9));
  const counters: Rect = { x: stage.x + 4, y: stage.y + stage.h - cH - 1, w: stage.w - 8, h: cH };
  const gy = langBar.y + langBar.h + labH + 3;
  const graph: Rect = { x: stage.x + 4, y: gy, w: stage.w - 8, h: counters.y - 4 - gy };
  const split = stage.w > 220 ? 0.46 : 0.42;
  const graphMap: Rect = { x: graph.x, y: graph.y, w: Math.round(graph.w * split), h: graph.h };
  const charBox: Rect = { x: graph.x + graphMap.w + 2, y: graph.y, w: graph.w - graphMap.w - 2, h: graph.h };
  return { W, H, wide, compact: small, headSize, header, term, stage, langBar, counters, graph, graphMap, charBox, termLines, termSize, labelSize: 5.5 };
}

export { clamp01, isBossKit };
