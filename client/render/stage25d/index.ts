// createStage25d: one three.js scene for the 2.5D screen view and the Vision Pro WebXR diorama (presentation only).
// Look = scene.ts (claude-boss). Camera rigs / XR session / pools = projection.ts, xr.ts, pool.ts (codex-input).
//
// Screen use (claude-ui, client/app/view25d.ts + game.ts):
//   Mount `stage.canvas` (WebGL) under the 2D overlay and call stage.resize(cssW, cssH, dpr) on layout.
//   Per frame: stage.render(overlayCtx, state, time, view, { you, focusId, events, theme, seed, variant, world, shake }).
//     The world goes into `canvas`; the projected FX (particles, damage numbers, banners, perk cards) are drawn on
//     `ctx` (overlay, logical view px). The caller draws postfx. If `canvas` is not mounted (never resized), the
//     stage blits its picture into ctx instead.
//   Screen coords (screenToWorld / worldToScreen) = logical view px: 0..view.w x 0..view.h of the `view` passed.
// XR use: call stage.enterXR() directly in a click/pinch handler. While presenting, the browser's window rAF may stop,
//   so the XR loop pulls fresh state through opts.pull(); render() calls only refresh the cached state.
import * as THREE from "three";
import type { GameEvent, MatchState } from "../../../shared/types.ts";
import { drawEvents, trackPlayers } from "../arena/index.ts";
import { fx } from "../arena/fx.ts";
import { bossLookAt } from "../boss/index.ts";
import { createCameraRig, getXRPlacement } from "./projection.ts";
import { enterXR as xrEnter, exitXR as xrExit, xrSupported as xrIsSupported } from "./xr.ts";
import type { CameraRig, ProjectedPoint, StageView, XRHandle, XRScale, XRSelectInfo } from "./types.ts";
import { StageLook, type LookExtras } from "./scene.ts";
import { lift } from "./staging.ts";

export type { StageView } from "./types.ts";

export interface Stage25dExtras extends Omit<LookExtras, "theme"> {
  /** logical px; a number (magnitude) or the caller's per-frame offset */
  shake?: number | { x: number; y: number };
  theme?: string;
  focusId?: string | null;
  variant?: "royale" | "classroom";
}

export { xrSupported } from "./xr.ts";

export interface Stage25dOptions {
  /** headset spectator page (?view=xr) */
  xr?: boolean;
  spectator?: boolean;
  /** XR: the latest interpolated state (window rAF can pause while a headset session is presenting). */
  pull?: () => { state: MatchState; time: number; events?: GameEvent[]; extras?: Stage25dExtras } | null;
  /** XR: tabletop diorama (default) or life-size. */
  scale?: XRScale;
  onXRChange?: (active: boolean) => void;
  /** XR frame timing hook: ms since the previous XR frame, and ms spent updating the scene (CPU, before the GPU draw) */
  onXRFrame?: (dtMs: number, updateMs: number) => void;
}

export interface Stage25d {
  /** the WebGL canvas (mount it; size it with CSS + resize()) */
  readonly canvas: HTMLCanvasElement;
  resize(cssW: number, cssH: number, dpr: number): void;
  setFollow(playerId: string | null): void;
  setScale(scale: XRScale): void;
  render(ctx: CanvasRenderingContext2D, state: MatchState, time: number, view?: StageView, extras?: Stage25dExtras): void;
  screenToWorld(sx: number, sy: number): { x: number; y: number };
  worldToScreen(x: number, y: number, z?: number): { x: number; y: number; scale: number };
  xrSupported(): Promise<boolean>;
  enterXR(): Promise<void>;
  exitXR(): Promise<void>;
  readonly xrActive: boolean;
  /** debug (gallery): the 2D canvases behind the floor / sprite / bullet textures */
  readonly debugCanvases: { floor: HTMLCanvasElement; atlas: HTMLCanvasElement; bullets: HTMLCanvasElement; fx: HTMLCanvasElement };
  readonly debugScene: THREE.Scene;
  destroy(): void;
}

export function createStage25d(opts: Stage25dOptions = {}): Stage25d {
  const look = new StageLook();
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  const rigs: Record<"full" | "phone", CameraRig | null> = { full: null, phone: null };
  let rig: CameraRig | null = null;
  let outW = 480, outH = 288;
  let xr: XRHandle | null = null;
  let xrScale: XRScale = opts.scale ?? "table";
  let follow: string | null = null;
  let mounted = false; // resize() was called: the caller shows `canvas`, the stage doesn't blit into ctx
  let last: { state: MatchState; time: number; events?: GameEvent[]; extras?: Stage25dExtras } | null = null;
  const pp: ProjectedPoint = { x: 0, y: 0, scale: 1 };
  const l3: [number, number, number] = [0, 0, 0];
  const camPos = new THREE.Vector3();

  function rigFor(phone: boolean, W: number, H: number): CameraRig {
    const k = phone ? "phone" : "full";
    let r = rigs[k];
    if (!r) r = rigs[k] = createCameraRig({ width: outW, height: outH, worldWidth: W, worldHeight: H, phone, pitch: 42, fov: 40 });
    return r;
  }

  // fx particles / damage numbers / perk cards: world point + height -> screen, lifted onto the standing boss
  const project = (x: number, y: number, z: number) => {
    if (!rig) return null;
    lift(look.plane, x, y, z, l3);
    rig.worldToScreen(l3[0], l3[2], l3[1], pp);
    if (!Number.isFinite(pp.x) || !Number.isFinite(pp.y)) return null;
    return pp;
  };

  function prepare(state: MatchState) {
    trackPlayers(state.players, state.pvp);
    const tgt = state.boss ? state.players.find((p) => p.id === state.boss!.targetPlayer) : null;
    if (tgt) bossLookAt(tgt.x, tgt.y);
  }

  function render(ctx: CanvasRenderingContext2D, state: MatchState, time: number, view?: StageView, extras: Stage25dExtras = {}) {
    last = { state, time, events: extras.events, extras };
    const W = extras.world?.w ?? 480, H = extras.world?.h ?? 288;
    outW = Math.max(16, Math.round(view?.w ?? W));
    outH = Math.max(16, Math.round(view?.h ?? H));
    if (xr) {
      // the headset is presenting; keep the screen informative instead of a frozen frame
      ctx.fillStyle = "#05030a"; ctx.fillRect(0, 0, outW, outH);
      return;
    }
    const phone = !!view && view.w < W - 1;
    rig = rigFor(phone, W, H);
    rig.resize(outW, outH);
    rig.setWorld(W, H);
    rig.update(phone ? view : undefined);
    const m = ctx.getTransform();
    const dev = Math.max(1, Math.abs(m.a) || 1);
    if (!mounted) {
      const pw = Math.round(outW * dev), ph = Math.round(outH * dev);
      if (renderer.domElement.width !== pw || renderer.domElement.height !== ph) renderer.setSize(pw, ph, false);
    }
    // shake: nudge the camera (logical px ~ world px near the middle of the floor)
    const sh = extras.shake;
    const shx = typeof sh === "number" ? (Math.random() - 0.5) * sh : sh?.x ?? 0, shy = typeof sh === "number" ? (Math.random() - 0.5) * sh : sh?.y ?? 0;
    rig.camera.position.x -= shx; rig.camera.position.y += shy * 0.7;

    prepare(state);
    look.update(state, time, { ...extras, theme: extras.theme as LookExtras["theme"] }, 0, rig.camera.quaternion, false);
    look.updateHud(state, time, false);
    look.table.visible = false;
    renderer.render(look.scene, rig.camera);
    rig.camera.position.x += shx; rig.camera.position.y -= shy * 0.7;
    if (!mounted) {
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(renderer.domElement, 0, 0, outW, outH);
      ctx.imageSmoothingEnabled = prevSmooth;
    }

    // 2D overlay in screen space: particles, damage numbers, banners (projected), then post FX on the composite
    const screen = { x: 0, y: 0, w: outW, h: outH };
    fx.project = project;
    drawEvents(ctx, extras.events ?? state.events, time, screen);
    fx.project = null;
  }

  // ---------------- XR ----------------
  let xrLast = -1;
  let xrHome: { x: number; y: number; z: number; scale: XRScale } | null = null;
  let xrUpd = 0;
  function xrFrame(t: number) {
    if (xrLast >= 0) opts.onXRFrame?.(t - xrLast, xrUpd);
    xrLast = t;
    const u0 = performance.now();
    const src = opts.pull?.() ?? last;
    if (!src) return;
    const { state, time } = src;
    const ex = src.extras ?? last?.extras ?? {};
    const W = ex.world?.w ?? 480, H = ex.world?.h ?? 288;
    const fp = follow ? state.players.find((p) => p.id === follow) : null;
    const cam = renderer.xr.getCamera();
    cam.getWorldPosition(camPos);
    // anchor the diorama to where the viewer's head was when the session (or a scale change) started
    // (wait for a tracked pose: before it the camera sits at the origin)
    if (!xrHome || xrHome.scale !== xrScale || (xrHome.y < 0.3 && camPos.y >= 0.3)) xrHome = { x: camPos.x, y: camPos.y >= 0.3 ? camPos.y : 1.5, z: camPos.z, scale: xrScale };
    const table0 = xrScale === "table";
    // tabletop: arena 1.2 m wide, centred ~0.7 m in front of the head, its top 0.15 m below eye height
    const place = getXRPlacement({ mode: xrScale, worldWidth: W, worldHeight: H, follow: fp ? { x: fp.x, y: fp.y } : null,
      tableWidth: 1.2, tableHeight: table0 ? Math.max(0.5, xrHome.y - 0.15) : undefined, distance: table0 ? 0.7 : undefined });
    place.position.x += xrHome.x;
    place.position.z += xrHome.z;
    look.root.scale.setScalar(place.scale);
    look.root.position.set(place.position.x, place.position.y, place.position.z);
    const table = xrScale === "table";
    look.table.visible = table;
    if (table) {
      look.table.scale.set(W * place.scale + 0.08, 0.04, H * place.scale + 0.08);
      look.table.position.set(place.position.x + (W * place.scale) / 2, place.position.y - 0.022, place.position.z + (H * place.scale) / 2);
    }
    look.root.updateMatrixWorld(true);
    look.root.worldToLocal(camPos);
    const yaw = Math.atan2(camPos.x - W / 2, camPos.z - H / 2);
    prepare(state);
    look.update(state, time, { ...ex, theme: ex.theme as LookExtras["theme"], events: src.events ?? ex.events }, yaw, cam.quaternion, true);
    look.updateHud(state, time, true);
    xrUpd = performance.now() - u0;
    renderer.render(look.scene, cam);
  }

  const ray = new THREE.Raycaster();
  const rayM = new THREE.Matrix4();
  function onSelect(info: XRSelectInfo) {
    if (!info.pose) return;
    // UI only: the scale / follow / exit buttons (never gameplay input)
    rayM.fromArray(info.pose.transform.matrix);
    ray.ray.origin.setFromMatrixPosition(rayM);
    ray.ray.direction.set(0, 0, -1).transformDirection(rayM);
    look.scene.updateMatrixWorld(true);
    const hit = ray.intersectObjects(look.buttons.filter((b) => b.visible), false)[0];
    if (!hit) return;
    const name = hit.object.name;
    if (name === "scale") xrScale = xrScale === "table" ? "life" : "table";
    else if (name === "exit") void exitXR();
    else if (name === "follow") {
      const ids = (last?.state.players ?? []).filter((p) => !p.eliminated).map((p) => p.id);
      const i = follow ? ids.indexOf(follow) : -1;
      follow = i + 1 < ids.length ? ids[i + 1] : null;
    }
  }

  async function enterXR() {
    if (xr) return;
    xrLast = -1;
    xrHome = null;
    xr = await xrEnter(renderer, {
      onFrame: xrFrame,
      onSelect,
      onEnd: () => { xr = null; look.setXR(false); resetRoot(); opts.onXRChange?.(false); },
    });
    look.setXR(true);
    opts.onXRChange?.(true);
  }
  function resetRoot() {
    look.root.scale.setScalar(1);
    look.root.position.set(0, 0, 0);
    look.table.visible = false;
    look.updateHud(last?.state ?? ({} as MatchState), 0, false);
  }
  async function exitXR() { await xrExit(xr); }

  return {
    canvas: renderer.domElement,
    resize(cssW, cssH, dpr) {
      mounted = true;
      renderer.setSize(Math.max(1, Math.round(cssW * dpr)), Math.max(1, Math.round(cssH * dpr)), false);
    },
    setFollow(id) { follow = id; },
    setScale(sc) { xrScale = sc; },
    render,
    screenToWorld: (sx, sy) => {
      const p = rig ? rig.screenToWorld(sx, sy) : { x: sx, y: sy };
      return { x: p.x, y: p.y };
    },
    worldToScreen: (x, y, z = 0) => {
      if (!rig) return { x, y, scale: 1 };
      const o = rig.worldToScreen(x, y, z);
      return { x: o.x, y: o.y, scale: o.scale };
    },
    xrSupported: xrIsSupported,
    enterXR,
    exitXR,
    get xrActive() { return !!xr; },
    /** debug (gallery): the sprite/floor/bullet canvases behind the textures */
    get debugCanvases() { return look.debugCanvases; },
    get debugScene() { return look.scene; },
    destroy() {
      void exitXR();
      fx.project = null;
      look.dispose();
      renderer.dispose();
    },
  };
}
