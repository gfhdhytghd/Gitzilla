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
import { chooseSpatialMode, createSurfacePlacement, detectSpatialSupport, exportSpatialUSDZ, type SurfacePlacement } from "./spatial.ts";
import type { SpatialSupport } from "./types.ts";
import type { CameraRig, ProjectedPoint, StageView, XRHandle, XRScale, XRSelectInfo } from "./types.ts";
import { StageLook, type LookExtras } from "./scene.ts";
import { lift } from "./staging.ts";
import { getTableHeightOffset, getTableHeightPlacement, setTableHeightOffset, TABLE_HEIGHT_STEP } from "./height.ts";
import { createXRHeightReadout } from "./height-debug.ts";

export type { StageView } from "./types.ts";

export interface Stage25dExtras extends Omit<LookExtras, "theme"> {
  /** logical px; a number (magnitude) or the caller's per-frame offset */
  shake?: number | { x: number; y: number };
  theme?: string;
  focusId?: string | null;
  variant?: "royale" | "classroom";
}

export { xrSupported } from "./xr.ts";
export { detectSpatialSupport, chooseSpatialMode, createModelPreview } from "./spatial.ts";

export interface Stage25dOptions {
  /** headset spectator page (?view=xr) */
  xr?: boolean;
  spectator?: boolean;
  /** XR: the latest interpolated state (window rAF can pause while a headset session is presenting). */
  pull?: () => { state: MatchState; time: number; events?: GameEvent[]; extras?: Stage25dExtras } | null;
  /** XR: tabletop diorama (default) or life-size. */
  scale?: XRScale;
  onXRChange?: (active: boolean) => void;
  /** Volumetric (voxel-extruded) sprites. "auto" (default): on in XR and on full-arena screens, off (flat billboards)
   *  on the phone follow camera, the LOD for small screens. */
  voxels?: boolean | "auto";
  /** debug/gallery: orbit the screen camera this many degrees around the arena centre (and zoom in by orbitZoom) */
  debugOrbit?: number;
  orbitZoom?: number;
  /** voxel bullets (default true); false keeps bullets as flat glyph quads */
  voxelBullets?: boolean;
  /** XR frame timing hook: ms since the previous XR frame, and ms spent updating the scene (CPU, before the GPU draw) */
  onXRFrame?: (dtMs: number, updateMs: number) => void;
}

export interface Stage25d {
  /** the WebGL canvas (mount it; size it with CSS + resize()) */
  readonly canvas: HTMLCanvasElement;
  resize(cssW: number, cssH: number, dpr: number): void;
  setFollow(playerId: string | null): void;
  setScale(scale: XRScale): void;
  setTableHeightOffset(meters: number): void;
  getTableHeightOffset(): number;
  render(ctx: CanvasRenderingContext2D, state: MatchState, time: number, view?: StageView, extras?: Stage25dExtras): void;
  screenToWorld(sx: number, sy: number): { x: number; y: number };
  worldToScreen(x: number, y: number, z?: number): { x: number; y: number; scale: number };
  xrSupported(): Promise<boolean>;
  /** Call directly in the click/pinch handler (no awaits before it). mode "auto" = AR where the runtime truly
   *  supports it (passthrough tabletop on a real surface), else VR (Vision Pro today). */
  enterXR(mode?: "auto" | "immersive-vr" | "immersive-ar"): Promise<void>;
  /** Native USDZ snapshot of the current scene (voxel columns baked), for <model> previews. */
  exportUSDZ(): Promise<Blob>;
  /** the immersive session mode in use, or null */
  readonly xrMode: "immersive-vr" | "immersive-ar" | null;
  exitXR(): Promise<void>;
  readonly xrActive: boolean;
  /** debug (gallery): the 2D canvases behind the floor / sprite / bullet textures */
  readonly debugCanvases: { floor: HTMLCanvasElement; atlas: HTMLCanvasElement; bullets: HTMLCanvasElement; fx: HTMLCanvasElement; hud: HTMLCanvasElement };
  readonly debugScene: THREE.Scene;
  readonly cpuMs: number;
  readonly xrLodFlat: boolean;
  /** debug: the XR session's tracking/height debug info (null outside XR) */
  readonly debugXR: XRHandle["debug"] | null;
  /** debug: AR surface placement state (null outside AR) */
  readonly debugPlacement: { status: string; source: string; pos: number[]; scale: number; cam: number[] } | null;
  destroy(): void;
}

const RETICLE_FLAT = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

export function createStage25d(opts: Stage25dOptions = {}): Stage25d {
  const look = new StageLook();
  // Input-owned comfort/debug plumbing; scene and UI buttons remain look/UI-owned.
  const heightReadout = createXRHeightReadout(look.scene);
  let tableHeightOffset = getTableHeightOffset();
  look.voxBullets = opts.voxelBullets !== false;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  const rigs: Record<"full" | "phone", CameraRig | null> = { full: null, phone: null };
  let rig: CameraRig | null = null;
  let outW = 480, outH = 288;
  let xr: XRHandle | null = null;
  let xrScale: XRScale = opts.scale ?? "table";
  let follow: string | null = null;
  let cpuMs = 0;
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
    let yaw = 0;
    if (opts.debugOrbit) {
      const cam = rig.camera, a = (opts.debugOrbit * Math.PI) / 180, z = opts.orbitZoom ?? 1;
      const cx = W / 2, cz = H / 2, dx = (cam.position.x - cx) / z, dz = (cam.position.z - cz) / z;
      cam.position.set(cx + dx * Math.cos(a) + dz * Math.sin(a), cam.position.y / z, cz - dx * Math.sin(a) + dz * Math.cos(a));
      cam.lookAt(cx, 20, cz); cam.updateMatrixWorld(true);
      yaw = a;
    }
    const vox = opts.voxels === undefined || opts.voxels === "auto" ? !phone : opts.voxels;
    const c0 = performance.now();
    look.update(state, time, { ...extras, theme: extras.theme as LookExtras["theme"] }, yaw, rig.camera.quaternion, false, vox);
    look.updateHud(state, false);
    look.table.visible = false;
    renderer.render(look.scene, rig.camera);
    cpuMs = performance.now() - c0;
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
  let xrPlaceKey = "";
  /** raw (pre-offset) head y at session start: undefined = not captured yet this session */
  let xrInitialRawY: number | null | undefined;
  let xrUpd = 0;
  let support: SpatialSupport | null = null;
  void detectSpatialSupport().then((v) => (support = v), () => {});
  let placement: SurfacePlacement | null = null;
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.06, 32), new THREE.MeshBasicMaterial({ color: 0x2ee6c8, side: THREE.DoubleSide }));
  reticle.matrixAutoUpdate = false; reticle.visible = false;
  look.scene.add(reticle);
  // adaptive LOD (voxels "auto" in XR): keep the headset at its refresh rate; if frames run long for ~1 s, drop to
  // flat billboards for the rest of the session (one-way, so it can't oscillate).
  let xrSlow = 0, xrFlat = false, xrEma = 0;
  // XR clock: the caller's `time` may stand still while the headset presents (game.ts advances it in the page rAF,
  // which Vision Pro pauses), so when it stalls the stage keeps its own time running from the XR frames (monotonic).
  let xrClock = 0, xrSrcTime = NaN;
  function xrFrame(t: number, frame?: XRFrame) {
    let dtS = 0;
    if (xrLast >= 0) {
      const dt = t - xrLast;
      dtS = Math.min(0.1, Math.max(0, dt / 1000));
      opts.onXRFrame?.(dt, xrUpd);
      if (!xrFlat && (opts.voxels === undefined || opts.voxels === "auto")) {
        // moving average (frames can arrive in bursts), judged after a 1 s warm-up
        xrEma = xrSlow === 0 ? dt : xrEma * 0.95 + dt * 0.05;
        xrSlow++;
        if (xrSlow > 90 && xrEma > 12.5) { xrFlat = true; console.info("[stage25d] XR frames > 12.5 ms: switching to flat billboards (LOD)"); }
      }
    }
    xrLast = t;
    const u0 = performance.now();
    const src = opts.pull?.() ?? last;
    if (!src) return;
    const { state } = src;
    if (src.time !== xrSrcTime) { xrSrcTime = src.time; xrClock = Math.max(xrClock, src.time); }
    else xrClock += dtS;
    const time = xrClock;
    const ex = src.extras ?? last?.extras ?? {};
    const W = ex.world?.w ?? 480, H = ex.world?.h ?? 288;
    const cam = renderer.xr.getCamera();
    if (xr?.mode === "immersive-ar" && placement) {
      // AR: the arena sits on a real surface (hit-test); until placed, show a reticle where it would go
      if (frame) placement.update(frame);
      // only "placed" has a valid root matrix; "manual" waits for a tap on an estimated plane, "candidate" has a live hit
      const placed = placement.status === "placed";
      reticle.visible = !placed && placement.status === "candidate";
      if (reticle.visible) { reticle.matrix.copy(placement.surface).multiply(RETICLE_FLAT); }
      look.root.visible = placed;
      look.table.visible = false;
      if (!placed) { renderer.render(look.scene, cam); return; }
      look.root.matrixAutoUpdate = false;
      look.root.matrix.copy(placement.matrix);
      look.root.matrixWorldNeedsUpdate = true;
      look.root.updateMatrixWorld(true);
      cam.getWorldPosition(camPos);
      look.root.worldToLocal(camPos);
      const yawAR = Math.atan2(camPos.x - W / 2, camPos.z - H / 2);
      prepare(state);
      look.update(state, time, { ...ex, theme: ex.theme as LookExtras["theme"], events: src.events ?? ex.events, follow }, yawAR, cam.quaternion, true, opts.voxels !== false && !xrFlat);
      look.updateHud(state, true);
      xrUpd = performance.now() - u0;
      renderer.render(look.scene, cam);
      return;
    }
    cam.getWorldPosition(camPos);
    // anchor the diorama to where the viewer's head was when the session (or a scale change) started
    // (wait for a tracked pose: before it the camera sits at the origin)
    const trackedHead = xr?.debug.head;
    if (!trackedHead) { renderer.render(look.scene, cam); return; }
    if (!xrHome || xrHome.scale !== xrScale) xrHome = { x: trackedHead.x, y: trackedHead.y, z: trackedHead.z, scale: xrScale };
    const table = xrScale === "table";
    // World-locked: the arena root + table are placed when the session starts and again only on an explicit change
    // (scale button, table height, arena size). Never per frame from the head or the followed hero (follow is a marker).
    // The head pose is read once (xrHome); the root lives in reference-space coordinates, so head motion can't drag it.
    // table height (take-ui's height.ts): 0.50 m above the floor, calibrated from the raw head y captured ONCE per session
    if (xrInitialRawY === undefined) xrInitialRawY = xr!.debug.rawHeadY;
    const hp = table ? getTableHeightPlacement({ referenceSpaceType: xr!.debug.referenceSpaceType, initialHeadY: xrInitialRawY,
      referenceOffsetY: xr!.debug.referenceOffsetY, userOffset: tableHeightOffset }) : null;
    const tableHeight = hp?.tableY;
    const placeKey = `${xrScale}|${tableHeight}|${W}x${H}|${xrHome.x},${xrHome.z}`;
    if (placeKey !== xrPlaceKey) {
      xrPlaceKey = placeKey;
      const place = getXRPlacement({ mode: xrScale, worldWidth: W, worldHeight: H, follow: null,
        tableWidth: 1.2, tableHeight, distance: table ? 1.0 : undefined });
      place.position.x += xrHome.x;
      place.position.z += xrHome.z;
      look.root.scale.setScalar(place.scale);
      look.root.position.set(place.position.x, place.position.y, place.position.z);
      look.table.visible = table;
      if (table) {
        look.table.scale.set(W * place.scale + 0.08, 0.04, H * place.scale + 0.08);
        look.table.position.set(place.position.x + (W * place.scale) / 2, place.position.y - 0.022, place.position.z + (H * place.scale) / 2);
      }
      if (xr) {
        xr.debug.tableY = place.position.y;
        if (hp) { xr.debug.baseTableY = hp.baseTableY; xr.debug.estimatedEyeHeight = hp.estimatedEyeHeight; xr.debug.heightSource = hp.heightSource; }
      }
    }
    if (xr) { xr.debug.tableHeightOffset = tableHeightOffset; heightReadout.update(xr.debug, cam); }
    look.root.updateMatrixWorld(true);
    look.root.worldToLocal(camPos);
    const yaw = Math.atan2(camPos.x - W / 2, camPos.z - H / 2);
    prepare(state);
    look.update(state, time, { ...ex, theme: ex.theme as LookExtras["theme"], events: src.events ?? ex.events, follow }, yaw, cam.quaternion, true, opts.voxels !== false && !xrFlat);
    look.updateHud(state, true, xrScale === "table");
    xrUpd = performance.now() - u0;
    renderer.render(look.scene, cam);
  }

  const ray = new THREE.Raycaster();
  const rayM = new THREE.Matrix4();
  function onSelect(info: XRSelectInfo) {
    // AR: a pinch while searching places the arena on the surface (consumed before any UI hit-test)
    if (placement && placement.status !== "placed" && placement.select(info)) return;
    if (!info.pose) return;
    // UI only: the scale / follow / exit buttons (never gameplay input)
    rayM.fromArray(info.pose.transform.matrix);
    ray.ray.origin.setFromMatrixPosition(rayM);
    ray.ray.direction.set(0, 0, -1).transformDirection(rayM);
    look.scene.updateMatrixWorld(true);
    const hit = ray.intersectObjects(look.buttons.filter((b) => b.visible), false)[0];
    if (!hit) return;
    const name = hit.object.name;
    if (name === "scale") {
      xrScale = xrScale === "table" ? "life" : "table";
      const W = last?.extras?.world?.w ?? 480;
      placement?.setTableWidth(xrScale === "table" ? 1.2 : (W * 1.7) / 28);
    }
    else if (name === "exit") void exitXR();
    // ▲ / ▼: nudge the tabletop by one step (codex-input's persisted comfort offset, height.ts)
    else if (name === "up" || name === "down") api.setTableHeightOffset(api.getTableHeightOffset() + (name === "up" ? TABLE_HEIGHT_STEP : -TABLE_HEIGHT_STEP));
    else if (name === "follow") {
      const ids = (last?.state.players ?? []).filter((p) => !p.eliminated).map((p) => p.id);
      const i = follow ? ids.indexOf(follow) : -1;
      follow = i + 1 < ids.length ? ids[i + 1] : null;
    }
  }

  async function enterXR(mode: "auto" | "immersive-vr" | "immersive-ar" = "auto") {
    if (xr) return;
    xrLast = -1;
    xrHome = null; xrPlaceKey = ""; xrInitialRawY = undefined;
    xrSlow = 0; xrFlat = false;
    xrClock = 0; xrSrcTime = NaN;
    // no awaits before requestSession (inside xrEnter): the click/pinch activation must still be live
    const want = mode === "auto" ? (support ? chooseSpatialMode(support) ?? "immersive-vr" : "immersive-vr") : mode;
    xr = await xrEnter(renderer, {
      mode: want,
      fallbackToVR: true,
      handTracking: true,
      onFrame: xrFrame,
      onSelect,
      onEnd: () => {
        heightReadout.hide();
        xr = null;
        placement?.dispose(); placement = null;
        reticle.visible = false;
        look.setAR(false);
        look.setXR(false); resetRoot(); opts.onXRChange?.(false);
      },
    });
    look.setXR(true);
    if (xr.mode === "immersive-ar") {
      // passthrough: no void room, the arena goes on a real surface
      look.setAR(true);
      const W = last?.extras?.world?.w ?? 480, H = last?.extras?.world?.h ?? 288;
      placement = await createSurfacePlacement(xr, { worldWidth: W, worldHeight: H, tableWidth: 1.2 });
    }
    opts.onXRChange?.(true);
  }
  function resetRoot() {
    xrPlaceKey = "";
    look.root.matrixAutoUpdate = true;
    look.root.visible = true;
    look.root.scale.setScalar(1);
    look.root.position.set(0, 0, 0);
    look.table.visible = false;
    look.updateHud(last?.state ?? ({} as MatchState), false);
  }
  async function exitXR() { await xrExit(xr); }

  const api: Stage25d = {
    canvas: renderer.domElement,
    resize(cssW, cssH, dpr) {
      mounted = true;
      renderer.setSize(Math.max(1, Math.round(cssW * dpr)), Math.max(1, Math.round(cssH * dpr)), false);
    },
    setFollow(id) { follow = id; },
    setScale(sc) { xrScale = sc; },
    setTableHeightOffset(meters) { tableHeightOffset = setTableHeightOffset(meters); },
    getTableHeightOffset: () => tableHeightOffset,
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
    xrSupported: () => xrIsSupported(),
    exportUSDZ: () => exportSpatialUSDZ(look.root, { metersPerPixel: 1.2 / (last?.extras?.world?.w ?? 480) }),
    get xrMode() { return xr?.mode ?? null; },
    get debugXR() { return xr?.debug ?? null; },
    /** debug: AR placement state */
    get debugPlacement() {
      if (!placement) return null;
      const e = placement.matrix.elements, c = renderer.xr.getCamera().position;
      return { status: placement.status, source: placement.source, pos: [e[12], e[13], e[14]].map((v) => +v.toFixed(3)), scale: +Math.hypot(e[0], e[1], e[2]).toFixed(5), cam: [c.x, c.y, c.z].map((v) => +v.toFixed(3)) };
    },
    enterXR,
    exitXR,
    get xrActive() { return !!xr; },
    /** debug (gallery): the sprite/floor/bullet canvases behind the textures */
    get debugCanvases() { return look.debugCanvases; },
    get debugScene() { return look.scene; },
    /** CPU ms of the last screen frame: scene update + draw submission */
    get cpuMs() { return cpuMs; },
    /** XR adaptive LOD has dropped to flat billboards */
    get xrLodFlat() { return xrFlat; },
    destroy() {
      heightReadout.dispose();
      void exitXR();
      fx.project = null;
      look.dispose();
      renderer.dispose();
    },
  };
  return api;
}
