import { openSettings } from './settings';
import { t } from '../i18n';
// Game screen: integer-scaled pixel canvas, snapshot interpolation (~100ms buffer), render composition,
// camera shake / hit-stop / slow-mo driven by events, boss intro + victory/defeat outro, input + motion setup.
// Landscape/desktop/big screen show the whole 480x288 arena. Phones in portrait get a camera viewport that follows
// the hero (full arena height, ~230 px of width), edge indicators, a minimap and a control deck under the viewport.
import type { GameEvent, MatchState, PlayerState, ServerMsg } from "../../shared/types";
import { ARENA_H, ARENA_W } from "../../shared/types";
import { type AppCtx, type Screen, isOwner } from "./app";
import { createHud, rankPvp } from "./hud";
import { createElimTracker, createKillFeed, createSpectateBanner, handle, royaleOf, worldSize } from "./royale";
import { ARCH, archetypeWhy } from "./archetype";
import { markCanvas } from "./mark";
import { wordmark } from "./wordmark";
import { loadGestureProfile, toThresholds } from "./training";
import { type GenesisHandle, playGenesis } from "../genesis";
import { createLessonFeed, createQuizOverlay, type LessonFeed, type QuizOverlay } from "../edu";
import { requestMotionPermission, saveMotionProfile, subscribeMotionPermission } from "../input";
import { audio, muteBtn } from "./sound";
import { createPauseOverlay } from "./pause";
import { pairPanel } from "./pair";
import { isHeadset, usesLocalControls } from "./device";
import { type Stage25d, createStage, emulateXrIfAsked, floorAffine, onView25dChange, view25dWanted, xrSupported, xrView } from "./view25d";
import { bossPortraitCanvas } from "./lobby";
import { type InputHandle, R, X, createInput, loadModules, loaded, safe } from "./renderers";
import { asciiBar, clamp, fmtTime, h, isPhone, isTouchDevice, lerp, vibrate } from "./util";

// interpolation delay: snapshot spacing + measured network jitter, between these bounds (seconds)
const BUFFER_MIN = 0.07, BUFFER_MAX = 0.35;
const RES = 1; // internal render scale (logical px -> canvas px)

// Avoid replacing text nodes (and invalidating phone layout) when status is unchanged.
const setText = (el: HTMLElement, text: string) => { if (el.textContent !== text) el.textContent = text; };

interface Snap {
  t: number;
  s: MatchState;
}

export function createGame(app: AppCtx): Screen & { outroDone: boolean } {
  const spectator = app.role === "screen";
  const canvas = h("canvas.game-canvas", { "data-testid": "game-canvas", width: ARENA_W * RES, height: ARENA_H * RES }) as HTMLCanvasElement;
  const ctx0 = canvas.getContext("2d", { alpha: false })!;
  // the 2D drawing target: the opaque game canvas, or (3D view) a transparent overlay above the WebGL stage
  let ctx = ctx0;
  ctx.imageSmoothingEnabled = false;
  const flash = h("div.fx-flash");
  const danger = h("div.fx-danger");
  const stage = h("div.stage", null, canvas, flash, danger);
  const hud = createHud(spectator);
  const overlay = h("div.game-overlay");
  // blurred, dimmed copy of the arena that fills the letterbox margins
  const ambient = h("canvas.ambient", { width: 96, height: 58 }) as HTMLCanvasElement;
  const actx = ambient.getContext("2d")!;
  const minimap = h("canvas.minimap", { width: ARENA_W / 4, height: ARENA_H / 4 }) as HTMLCanvasElement;
  const mctx = minimap.getContext("2d")!;
  // editor-style tab over the minimap: the arena is the boss's source file
  const miniTab = h("div.mini-tab", { title: "minimap of the whole arena" }, "▾ arena.map");
  stage.append(h("div.mini-wrap", null, miniTab, minimap));
  // portrait control deck: HUD panels are re-homed here; the DASH/SKILL buttons (client/input) dock at its bottom
  const sensorRow = h("div.deck-sensors");
  const deckMid = h("div.deck-mid");
  // motion v3: no on-screen controls — the deck only says what the gestures are ready to do
  const gsSkillState = h("b"), gsDashState = h("b");
  const gsSkillLbl = h("span", null, "✦ spin or hold"), gsDashLbl = h("span", null, "⚡ twist");
  const gsSkill = h("div.gs-pill.skill", null, gsSkillLbl, gsSkillState);
  const gsDash = h("div.gs-pill.dash", null, gsDashLbl, gsDashState);
  const gestStatus = h("div.gest-status", { "data-testid": "gesture-status" }, gsSkill, gsDash);
  const deck = h("div.deck", null, sensorRow, gestStatus, deckMid);
  const lateQr = spectator
    ? h("div.late-qr", null, h("div.lq-brand", null, markCanvas(2), wordmark({ width: "120px" })), h("img", { src: `/api/qr?text=${encodeURIComponent(`${location.origin}/r/${app.room}`)}`, alt: "join QR" }), h("div", null, `join: ${app.room}`))
    : null;
  // ☰ menu: leave the fight (with a confirm), resume
  // ---------------- host pause (ClientMsg pause / MatchState.paused) ----------------
  const isHost = () => isOwner(app);
  const sendPause = (paused: boolean) => app.conn.send({ t: "pause", paused });
  const menuPauseBtn = h("button.btn.btn-primary", { "data-testid": "game-pause", hidden: true, onclick: () => { menuSheet.hidden = true; sendPause(true); } }, "⏸ pause match (everyone)");
  const pauseBtn = h("button.btn.btn-tiny.pause-btn", { "data-testid": "pause-match", hidden: true, title: "pause (P / Esc)", onclick: (e: Event) => { e.stopPropagation(); sendPause(true); } }, "⏸ pause");
  const pause = createPauseOverlay({
    onResume: () => sendPause(false),
    onLeave: () => app.leave(),
    onNewRoom: () => app.leave({ newRoom: true }),
    // host: "Kick player…" (everyone in the room but you; bots are removed without a confirm)
    kickTargets: () => (app.lobby?.players ?? []).filter((p) => p.id !== app.you).map((p) => ({ id: p.id, name: p.name, bot: p.bot })),
    onKick: (id) => app.conn.send({ t: "kick", playerId: id }),
    onChange: (on) => {
      el.classList.toggle("paused", on);
      // match time stood still while paused: re-sync the interpolation clock so motion stays smooth after resume
      if (!on && latest) offset = performance.now() / 1000 - latest.t;
    },
  });
  const pauseOv = pause.el;
  let pauseState: MatchState["paused"] = null;
  const pausedNow = () => pause.active;
  const applyPause = (p: MatchState["paused"], s: MatchState) => {
    pauseState = p ?? null;
    const byName = !p ? "" : p.by === app.you ? "you" : s.players.find((x) => x.id === p.by)?.name ?? "the host";
    pause.apply(p, byName, isHost());
  };
  const tickPauseCountdown = () => void pause.tick();

  const menuSheet = h(
    "div.game-menu",
    { hidden: true, "data-testid": "game-menu" },
    h(
      "div.term-window",
      null,
      h("div.term-title", null, h("span.dots", null, "● ● ●"), " menu"),
      h(
        "div.term-body",
        null,
        h("div", null, spectator ? (app.lobby?.mode === "edu" ? "end the class / leave this screen?" : "leave this screen?") : "leave the fight?"),
        h("div.dim", null, spectator ? "the match keeps running for everyone else." : app.lobby?.mode === "pvp" ? "leaving counts as an elimination." : "your hero drops out; the squad keeps fighting."),
        menuPauseBtn,
        h("button.btn.btn-danger", { "data-testid": "game-leave", onclick: () => app.leave() }, spectator ? (app.lobby?.mode === "edu" ? "⏏ end class" : "⏏ leave room") : "⏏ leave the fight"),
        spectator ? h("button.btn", { "data-testid": "game-new-room", onclick: () => app.leave({ newRoom: true }) }, "new room") : null,
        h("button.btn", { "data-testid": "game-settings", onclick: () => { menuSheet.hidden = true; openSettings(); } }, "Settings"),
        h("button.btn.btn-primary", { onclick: () => (menuSheet.hidden = true) }, "▶ resume"),
      ),
    ),
  );
  const menuBtn = h("button.btn.btn-tiny.menu-btn", { "data-testid": "game-menu-open", "aria-label": "menu", onclick: (e: Event) => (e.stopPropagation(), (menuSheet.hidden = false)) }, "☰ menu");
  // ---------------- PvP royale: kill feed, eliminations, spectating ----------------
  const elims = createElimTracker();
  const killFeed = createKillFeed();
  let watchId: string | null = null;
  /** Keep watching the same hero while they're alive; otherwise your killer, else the KO leader. */
  const pickWatch = (s: MatchState) => {
    const r = royaleOf(s);
    if (!r || (watchId && r.alive.includes(watchId))) return;
    const me = s.players.find((p) => p.id === app.you);
    const sc = s.pvp?.scores ?? {};
    const lead = [...r.alive].sort((a, b) => (sc[b]?.kos ?? 0) - (sc[a]?.kos ?? 0))[0] ?? null;
    watchId = me?.killedBy && r.alive.includes(me.killedBy) ? me.killedBy : lead;
  };
  const cycleWatch = (dir: -1 | 1) => {
    const r = royaleOf(latest);
    if (!r?.alive.length) return;
    const order = latest!.players.filter((p) => r.alive.includes(p.id)).map((p) => p.id);
    const i = Math.max(0, order.indexOf(watchId ?? ""));
    watchId = order[(i + dir + order.length) % order.length];
    vibrate(10);
  };
  const spectate = createSpectateBanner(cycleWatch);
  /** royale: knocked out, or a player who isn't fighting at all (e.g. a host without an eligible repo) */
  const watchingRoyale = (s: MatchState | null) => !spectator && !!royaleOf(s) && !(s!.players.find((p) => p.id === app.you) && !s!.players.find((p) => p.id === app.you)!.eliminated);
  const el = h("div.screen.game.waiting", null, ambient, stage, hud.el, deck, overlay, lateQr, pauseBtn, pauseOv, menuSheet);
  stage.append(killFeed.el);
  overlay.append(spectate.el);

  // ---------------- 3D view (client/render/stage25d through ./view25d; 2D whenever it's missing or off) ----------------
  // The WebGL stage canvas + a transparent 2D overlay (YOU ring, zone pointer, edge arrows, postfx) sit under the game
  // canvas, which stays on top at opacity 0 so mouse/touch input keeps landing on it. Classroom raids stay 2D.
  // the Vision Pro panel: the headset spectator page, or any seat on a headset (shown prominently there)
  const headset = isHeadset();
  const isXr = (spectator && xrView()) || headset;
  let st3d: Stage25d | null = null;
  let ov3d: HTMLCanvasElement | null = null;
  let octx: CanvasRenderingContext2D | null = null;
  let on3d = false; // the last frame was drawn by the 3D stage
  let starting3d = false;
  let gone = false;
  const size3d = (cssW: number, cssH: number) => {
    if (ov3d && (ov3d.width !== canvas.width || ov3d.height !== canvas.height)) (ov3d.width = canvas.width), (ov3d.height = canvas.height);
    st3d?.resize?.(cssW, cssH, devicePixelRatio || 1);
  };
  const start3d = async () => {
    if (st3d || starting3d || gone) return;
    starting3d = true;
    // XR: while the headset presents, the page rAF can stop; the stage's XR loop pulls fresh interpolated state itself
    const st = await createStage({
      xr: isXr, spectator, scale: xrScale,
      pull: () => {
        if (offset === null) return null;
        const now = performance.now() / 1000;
        const state = interp(now - clockOffset(now) - delay - lag);
        return state ? { state, time: visTime, extras: extras3d(state) } : null;
      },
      onXRChange: (active: boolean) => {
        inXr = active;
        syncXrPanel();
      },
      // XR frame counter for playtests (fps in the headset loop, where the page rAF may be paused)
      onXRFrame: () => {
        const g = globalThis as { __kaijuXrFrames?: number };
        g.__kaijuXrFrames = (g.__kaijuXrFrames ?? 0) + 1;
      },
    });
    starting3d = false;
    xrStatus.textContent = st ? "" : "3D view unavailable here: showing 2D";
    if (!st) return;
    if (gone || !view25dWanted()) return st.destroy();
    st3d = st;
    if (st.canvas) {
      st.canvas.classList.add("stage-3d");
      ov3d = h("canvas.game-canvas.ov-3d", { width: canvas.width, height: canvas.height, "aria-hidden": "true" }) as HTMLCanvasElement;
      octx = ov3d.getContext("2d")!;
      stage.insertBefore(st.canvas, canvas);
      stage.insertBefore(ov3d, canvas);
    }
    layout();
    syncXrPanel();
  };
  const stop3d = () => {
    if (!st3d) return;
    st3d.destroy();
    st3d.canvas?.remove();
    ov3d?.remove();
    st3d = null;
    ov3d = octx = null;
    on3d = false;
    ctx = ctx0;
    el.classList.remove("view-3d");
    layout();
    syncXrPanel();
  };
  const stopView3d = onView25dChange((on) => (on ? void start3d() : stop3d()));

  // headset spectator (?screen=1&view=xr): DOM controls before entering XR (follow a hero, tabletop / life-size)
  const xrStatus = h("div.xr-status", { role: "status" });
  const xrEnter = h("button.btn.btn-primary.xr-enter", { "data-testid": "xr-enter", hidden: true, onclick: () => toggleXr() }, "Enter Vision Pro") as HTMLButtonElement;
  let followPicked = false;
  const xrFollow = h("select.xr-follow", { "data-testid": "xr-follow", "aria-label": "follow a hero", onchange: () => { followPicked = true; st3d?.setFollow?.(xrFollow.value || null); } }, h("option", { value: "" }, "overview")) as HTMLSelectElement;
  let xrScale: "table" | "life" = "table";
  const scaleBtn = (v: "table" | "life", label: string) =>
    h("button.btn.btn-tiny.xr-scale", { "data-testid": `xr-scale-${v}`, "aria-pressed": String(v === xrScale), onclick: () => { xrScale = v; st3d?.setScale?.(v); syncXrPanel(); } }, label);
  const xrScaleRow = h("div.xr-row", null, h("span.dim", null, "scale"), scaleBtn("table", "tabletop"), scaleBtn("life", "life-size"));
  const xrPanel = isXr ? h(`div.xr-panel${headset ? ".prominent" : ""}`, { "data-testid": "xr-panel" }, h("div.xr-title", null, "Vision Pro"), xrEnter,
    h("label.xr-row", null, h("span.dim", null, "follow"), xrFollow), xrScaleRow, xrStatus) : null;
  let inXr = false;
  const toggleXr = async () => {
    if (!st3d) return;
    try {
      // enterXR runs synchronously inside the click (the browser needs the user gesture); onXRChange tracks the session
      if (inXr) await st3d.exitXR?.();
      else await st3d.enterXR?.();
      inXr = st3d?.xrActive ?? !inXr;
    } catch (e) {
      xrStatus.textContent = `could not start XR: ${(e as Error).message}`;
    }
    syncXrPanel();
  };
  function syncXrPanel() {
    if (!xrPanel) return;
    xrEnter.textContent = inXr ? "Exit Vision Pro" : "Enter Vision Pro";
    for (const b of xrScaleRow.querySelectorAll<HTMLButtonElement>(".xr-scale")) b.setAttribute("aria-pressed", String(b.dataset.testid === `xr-scale-${xrScale}`));
    for (const n of [xrFollow, ...xrScaleRow.querySelectorAll("button")] as HTMLElement[]) (n as HTMLButtonElement).disabled = !st3d;
  }
  let followSig = "";
  const syncFollow = (players: PlayerState[]) => {
    if (!xrPanel) return;
    const sig = players.map((p) => p.id + p.name).join("|");
    if (sig === followSig) return;
    followSig = sig;
    const cur = xrFollow.value;
    xrFollow.replaceChildren(h("option", { value: "" }, "overview"), ...players.map((p) => h("option", { value: p.id, translate: "no" }, p.name)));
    xrFollow.value = players.some((p) => p.id === cur) ? cur : "";
    // on a headset your own hero is the default viewpoint (until you pick another)
    if (headset && !followPicked && app.you && players.some((p) => p.id === app.you) && xrFollow.value !== app.you) {
      xrFollow.value = app.you;
      st3d?.setFollow?.(app.you);
    }
  };
  // display device: "use your phone as the controller" (claude-auth pair.ts) over the waiting / countdown screen and in the
  // XR pre-entry panel; while fighting only a paired seat keeps the small "Phone connected ✓" line (CSS .in-fight)
  const pair = pairPanel(app, { compact: true });
  (xrPanel ?? overlay).append(pair.el);
  let pairFight = false;
  const syncPair = (s: MatchState | null) => {
    pair.update(app);
    const fight = s?.status === "fighting" && !s.paused;
    if (fight !== pairFight) pair.el.classList.toggle("in-fight", (pairFight = fight));
  };
  if (xrPanel) {
    overlay.append(xrPanel);
    syncXrPanel();
    xrStatus.textContent = view25dWanted() ? "loading the 3D scene…" : "";
    // only offer the headset when the browser can actually open an immersive-vr session
    void emulateXrIfAsked().then(xrSupported).then((ok) => (xrEnter.hidden = !ok));
  }
  if (view25dWanted()) void start3d();

  // ---------------- layout ----------------
  let cssScale = 1;
  // visible window into the arena, in logical px (camera); landscape = whole arena
  const view = { x: 0, y: 0, w: ARENA_W, h: ARENA_H, cssScale: 1 };
  // world = logical arena size; battle is 480x288, PvP sims may size it for the player count (royale.worldSize)
  let WW = ARENA_W, WH = ARENA_H;
  let portrait = false;
  let phoneLayout = isPhone();
  const safeProbe = h("div.safe-probe");
  document.body.append(safeProbe);
  const placeParts = () => {
    const P = hud.parts;
    if (portrait) {
      deck.insertBefore(P.self, sensorRow);
      deckMid.replaceChildren(P.team, P.combo);
      deck.append(P.review, P.log, P.toasts);
      stage.append(P.timer);
      sensorRow.append(muteBtn, menuBtn);
    } else {
      hud.el.append(P.self, P.team, P.combo, P.log, P.review, P.toasts, P.timer);
      document.body.append(muteBtn);
      overlay.append(menuBtn);
    }
  };
  const layout = () => {
    const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
    const phone = phoneLayout = isPhone();
    el.classList.toggle("phone-landscape", phone && W > H);
    const wasPortrait = portrait;
    portrait = phone && H >= W && !spectator;
    el.classList.toggle("phone-portrait", portrait);
    if (portrait !== wasPortrait || !el.dataset.placed) {
      el.dataset.placed = "1";
      placeParts();
    }
    if (portrait) {
      const cs = getComputedStyle(safeProbe);
      const safeTop = parseFloat(cs.paddingTop) || 0, safeBot = parseFloat(cs.paddingBottom) || 0;
      const barH = 44 + safeTop; // boss bar sits directly under the notch inset
      const avail = H - barH - safeBot;
      // Height budget for the viewport: leave a full deck on tall phones, a compact one (~210px) on short ones.
      const deckMin = avail >= 640 ? 240 : 210;
      const budget = Math.min(avail * 0.66, avail - deckMin);
      // Prefer the biggest integer DEVICE-pixel scale (crisp); if that wastes >15% of the budget (e.g. 360x640 @2x
      // would floor to 1 device px = a 144px-tall arena), use a fractional scale that fills it (pixelated upscaling).
      const s = Math.max(1, Math.floor((budget * dpr) / ARENA_H));
      cssScale = (ARENA_H * s) / dpr >= budget * 0.85 ? s / dpr : budget / ARENA_H;
      // keep at least ~200 logical px of arena visible across the width
      cssScale = Math.min(cssScale, W / 200);
      view.cssScale = cssScale;
      view.w = Math.min(WW, Math.floor(W / cssScale));
      view.h = Math.min(WH, ARENA_H); // taller PvP arenas scroll vertically too
      const w = view.w < WW ? W : Math.round(view.w * cssScale), hh = Math.round(view.h * cssScale);
      const left = Math.round((W - w) / 2);
      el.classList.toggle("deck-compact", H - barH - hh - safeBot < 290);
      Object.assign(stage.style, { width: `${w}px`, height: `${hh}px`, left: `${left}px`, top: `${Math.round(barH)}px` });
      if (canvas.width !== view.w * RES) canvas.width = view.w * RES;
      if (canvas.height !== view.h * RES) canvas.height = view.h * RES;
      size3d(w, hh);
      for (const [k, v] of Object.entries({ "--gw": w, "--gh": hh, "--gx": left, "--gy": Math.round(barH), "--deck-top": Math.round(barH + hh) })) {
        el.style.setProperty(k, `${v}px`);
        document.body.style.setProperty(k, `${v}px`); // touch overlay + mute button live on <body>
      }
      for (const c of ["dock-x", "dock-narrow", "dock-y"]) el.classList.remove(c);
      return;
    }
    // Desktop/landscape players get a follow camera at 4/3 zoom (UI-6: heroes read tiny next to the kaiju when the
    // whole 480x288 arena is on screen). Spectators / the big screen keep the full arena.
    const zoomCam = !spectator && !phone && !st3d; // the 3D view frames the whole arena on desktop

    el.classList.toggle("cam", zoomCam);
    const VW = zoomCam ? Math.min(360, WW) : WW, VH = zoomCam ? Math.min(216, WH) : WH;
    if (!zoomCam) view.x = 0, view.y = 0;
    view.w = VW;
    view.h = VH;
    if (canvas.width !== VW * RES) canvas.width = VW * RES;
    if (canvas.height !== VH * RES) canvas.height = VH * RES;
    const s = Math.floor(Math.min((W * dpr) / VW, (H * dpr) / VH));
    cssScale = s >= 1 ? s / dpr : Math.min(W / VW, H / VH);
    // integer device-pixel scale wastes too much space on some phones; fall back to fractional nearest-neighbour
    if ((VH * cssScale) / H < 0.78 && (VW * cssScale) / W < 0.78) cssScale = Math.min(W / VW, H / VH);
    view.cssScale = cssScale;
    const w = Math.round(VW * cssScale), hh = Math.round(VH * cssScale);
    size3d(w, hh);
    Object.assign(stage.style, { width: `${w}px`, height: `${hh}px`, left: `${Math.round((W - w) / 2)}px`, top: `${Math.round((H - hh) / 2)}px` });
    el.style.setProperty("--gw", `${w}px`);
    el.style.setProperty("--gh", `${hh}px`);
    el.style.setProperty("--gx", `${Math.round((W - w) / 2)}px`);
    el.style.setProperty("--gy", `${Math.round((H - hh) / 2)}px`);
    // dock HUD panels into the margins when they're wide/tall enough
    const gx = (W - w) / 2, gy = (H - hh) / 2;
    el.style.setProperty("--dw", `${Math.floor(gx - 10)}px`);
    document.body.style.setProperty("--dw-btn", `${Math.floor(gx - 10)}px`); // touch overlay lives on <body>
    el.classList.toggle("dock-x", gx >= 88);
    el.classList.toggle("dock-narrow", gx >= 88 && gx < 150);
    el.classList.toggle("dock-y", gy >= 56);
  };
  layout();
  addEventListener("resize", layout);
  // aim: the 3D view inverts its floor projection (a click hits the floor point under the cursor)
  const toArena = (cx: number, cy: number): [number, number] => {
    const r = canvas.getBoundingClientRect();
    const sx = ((cx - r.left) / r.width) * view.w, sy = ((cy - r.top) / r.height) * view.h;
    if (st3d && on3d) {
      const w = st3d.screenToWorld(sx, sy);
      return [w.x, w.y];
    }
    return [view.x + sx, view.y + sy];
  };

  // ---------------- snapshots / timeline ----------------
  const snaps: Snap[] = [];
  const pendingEvents: { t: number; e: GameEvent }[] = [];
  let offset: number | null = null; // local seconds - server t (fastest arrivals), at local time offsetAt
  // Playout clock. A sim whose clock runs a little slower/faster than ours (timer drift, a busy server) made the old
  // "min + 2% creep" offset run ahead of the data: the hero froze on the newest snapshot and stepped. Now: a line fit
  // of arrival offset over the last 3 s gives the drift rate; the offset is that line shifted to its fastest packets
  // and carried forward continuously. delay = snapshot spacing + p90 jitter around the line, smoothed, so 20 Hz
  // through a 60–120 ms jittery tunnel still always has the next snapshot in hand.
  const arrivals: { at: number; o: number; t: number }[] = [];
  let delay = 0.1, drift = 0, offsetAt = 0;
  const clockOffset = (now: number) => offset! + drift * (now - offsetAt);
  let lag = 0; // extra delay accumulated by hit-stop / slow-mo
  let latest: MatchState | null = null;
  let ownBullets = new Set<number>();
  const seenBullets = new Set<number>();
  let lastDashCd = 0;

  const onSnapshot = (s: MatchState) => {
    const now = performance.now() / 1000;
    if (latest && s.t < latest.t - 1) {
      // new match (rematch): reset timeline
      snaps.length = 0;
      pendingEvents.length = 0;
      offset = null;
      arrivals.length = 0;
      introStarted = false;
      outro = null;
      elims.reset();
      watchId = null;
    }
    const world = worldSize(s);
    if (world.w !== WW || world.h !== WH) {
      WW = world.w;
      WH = world.h;
      minimap.width = Math.round(WW / 4);
      minimap.height = Math.round(WH / 4);
      layout();
    }
    if (royaleOf(s)) {
      for (const e of elims.update(s)) {
        killFeed.push(e, app.you);
        if (e.id === app.you) {
          vibrate([80, 40, 140]);
          doFlash(0.5, "255,20,40");
        }
      }
      app.royaleLog = elims.log;
      // the winner card plays as soon as the last hero stands (the autopsy follows from the server)
      if (!outro && latest && (royaleOf(s)!.winner || s.status === "victory" || s.status === "defeat")) setTimeout(() => startOutro(true), 0);
    }
    const o = now - s.t;
    arrivals.push({ at: now, o, t: s.t });
    while (arrivals.length > 2 && now - arrivals[0].at > 3) arrivals.shift();
    // least-squares drift (d offset / d local time), clamped to a sane sim speed (±15%)
    const n = arrivals.length;
    let ma = 0, mo = 0;
    for (const a of arrivals) (ma += a.at), (mo += a.o);
    ma /= n; mo /= n;
    let sxx = 0, sxy = 0;
    for (const a of arrivals) (sxx += (a.at - ma) ** 2), (sxy += (a.at - ma) * (a.o - mo));
    const slope = n >= 8 && sxx > 0 ? clamp(sxy / sxx, -0.15, 0.15) : 0;
    const res = arrivals.map((a) => a.o - (mo + slope * (a.at - ma))).sort((x, y) => x - y);
    const line = mo + slope * (now - ma) + res[0]; // fastest-packet offset, now
    const jitter = res[Math.floor((n - 1) * 0.9)] - res[0];
    const gaps: number[] = [];
    for (let i = 1; i < n; i++) gaps.push(arrivals[i].t - arrivals[i - 1].t);
    gaps.sort((x, y) => x - y);
    const gap = gaps.length ? gaps[gaps.length >> 1] : 0.05;
    const want = clamp(gap + jitter + 0.015, BUFFER_MIN, BUFFER_MAX);
    if (offset === null) (offset = line), (delay = want), (drift = 0);
    else {
      const cur = clockOffset(now);
      offset = cur + (line - cur) * 0.15; // ease, never jump the timeline
      drift += (slope - drift) * 0.2;
      delay += (want - delay) * (want > delay ? 0.2 : 0.03); // grow fast on bad links, shrink slowly
    }
    offsetAt = now;
    if (snaps.length && snaps[snaps.length - 1].t >= s.t) snaps[snaps.length - 1] = { t: s.t, s };
    else snaps.push({ t: s.t, s });
    if (snaps.length > 30) snaps.shift();
    for (const e of s.events) pendingEvents.push({ t: s.t, e });
    // audio runs on arrival (once per authoritative snapshot), not on the delayed render timeline
    audio.music(s.status === "victory" || s.status === "defeat" ? s.status : arenaTheme(s), s.boss?.phase ?? 1);
    audio.onEvents(s.events, app.you ?? "");
    // muzzle flashes for everyone: a player's new bullet ids mean they just fired
    for (const b of s.bullets)
      if (b.owner !== "boss" && !seenBullets.has(b.id)) {
        seenBullets.add(b.id);
        X.notePlayerShot(b.owner);
      }
    if (seenBullets.size > 4000) seenBullets.clear();
    const me = s.players.find((p) => p.id === app.you);
    if (me) {
      let fired = false;
      const ids = new Set<number>();
      for (const b of s.bullets)
        if (b.owner === me.id) {
          ids.add(b.id);
          if (!ownBullets.has(b.id)) fired = true;
        }
      ownBullets = ids;
      if (fired) audio.onFire(me.kit.weapon);
      if (me.dashCd > lastDashCd + 0.05) audio.onDash();
      lastDashCd = me.dashCd;
    }
    latest = s;
    el.classList.remove("waiting");
    applyPause(s.paused ?? null, s);
    const canPause = isHost() && s.status === "fighting" && !spectator;
    pauseBtn.hidden = !canPause || phoneLayout || !!s.paused;
    menuPauseBtn.hidden = !canPause || !!s.paused;
    if (s.mode === "edu") updateEdu(s);
    if (!introStarted && (s.status === "countdown" || s.t < 1.2)) startIntro(s);
    introStarted = true;
  };

  // arena look: follows the boss in battle; edu PvP (no boss) uses the notebook "classroom" theme
  const arenaSeed = [...app.room].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const arenaTheme = (s: MatchState) => s.boss?.kit.theme ?? "notebook";

  // ---------------- edu (classroom PvP): lesson cards + quiz overlay from client/edu ----------------
  let feed: LessonFeed | null = null;
  let quiz: QuizOverlay | null = null;
  const eduVariant = () => (spectator ? "screen" : portrait ? "phone" : "desktop") as "screen" | "phone" | "desktop";
  const updateEdu = (s: MatchState) => {
    const students = s.players.map((p) => ({ id: p.id, name: p.name, repo: p.kit.repo, quality: p.kit.quality }));
    if (!feed) {
      try {
        feed = createLessonFeed({ variant: eduVariant(), ctx: { mode: s.mode, you: app.you, spectator, players: students, boss: null } });
        quiz = createQuizOverlay({ variant: eduVariant(), engine: feed.engine });
        app.eduEngine = feed.engine;
        feed.el.classList.add("edu-mount");
        quiz.el.classList.add("edu-mount");
        if (portrait) sensorRow.after(feed.el); // phone: lesson cards replace the event log in the deck
        else overlay.append(feed.el);
        (portrait ? deck : overlay).append(quiz.el);
      } catch (e) {
        console.warn("[kaiju] edu components failed", e);
        return;
      }
    } else if (students.length !== lastStudentCount) feed.setContext({ players: students });
    lastStudentCount = students.length;
    try {
      feed.update(s);
      quiz?.update(s, spectator ? null : app.you);
      if (feedVariant !== eduVariant()) {
        feedVariant = eduVariant();
        feed.setVariant(feedVariant as "phone" | "desktop" | "screen");
        if (portrait) sensorRow.after(feed.el);
        else overlay.append(feed.el);
        (portrait ? deck : overlay).append(quiz!.el);
      }
    } catch (e) {
      console.warn("[kaiju] edu update failed", e);
    }
  };
  let lastStudentCount = 0;
  let feedVariant = "";

  // ---------------- juice state ----------------
  let trauma = 0;
  let hitstop = 0;
  let slowmo = 0;
  let flashA = 0;
  let flashCol = "255,255,255";
  let zoom = 1;
  let zoomTarget: [number, number] = [ARENA_W / 2, ARENA_H / 2];
  let glitchUntil = 0;
  const nudge: [number, number] = [0, 0]; // directional camera kick from hits on you
  const releasedEvents: GameEvent[] = [];

  let lastStopAt = 0;
  // prefers-reduced-motion: quarter shake, no full-screen flashes/glitches (photosensitivity)
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).has("calm");
  const kick = (t: number, stop = 0, slow = 0) => {
    trauma = Math.min(1, trauma + (calm ? t * 0.25 : t));
    // small hit-stops are rate-limited so rapid-fire crits don't turn into a stutter
    const now = performance.now();
    if (stop >= 0.06 || (stop > 0 && now - lastStopAt > 350)) {
      hitstop = Math.max(hitstop, stop);
      lastStopAt = now;
    }
    slowmo = Math.max(slowmo, slow);
  };
  let lastFlashAt = 0;
  const doFlash = (a: number, col = "255,255,255") => {
    if (calm) a = Math.min(a, 0.12); // a faint tint, never a strobe
    const now = performance.now();
    if (now - lastFlashAt < 340 && a < flashA + 0.2) return; // ≤3 full-screen flashes per second
    lastFlashAt = now;
    if (a >= flashA) flashCol = col;
    flashA = Math.max(flashA, a);
  };

  const handleEvent = (e: GameEvent, s: MatchState) => {
    const you = app.you;
    switch (e.type) {
      case "hit": {
        const impact = e.impact ?? 0.3;
        const stop = (e.hitStop ?? 0) / 1000;
        const mine = !!you && e.source === you;
        if (e.target === "boss") {
          if (e.crit && mine) kick(0.12 + impact * 0.2, Math.min(0.06, stop || 0.04));
          else if (e.combo && e.combo >= 2) kick(0.06 + e.combo * 0.03, mine ? Math.min(0.05, stop) : 0);
          else kick(mine ? 0.01 + impact * 0.05 : 0.008);
        } else if (e.target === you) {
          kick(0.25 + impact * 0.3, Math.min(0.08, stop || 0.05));
          doFlash(0.3 + impact * 0.2, "255,30,60");
          vibrate(e.crit ? [40, 30, 60] : 45);
          if (e.direction) {
            nudge[0] += e.direction[0] * (2 + impact * 4);
            nudge[1] += e.direction[1] * (2 + impact * 4);
          }
        }
        break;
      }
      case "limbBroken":
        kick(0.65, 0.06, 0.55);
        doFlash(0.5);
        vibrate([30, 30, 60]);
        break;
      case "downed":
        if (e.player === you) {
          kick(0.6, 0.09, 0.4);
          doFlash(0.55, "255,20,40");
          vibrate([80, 40, 140]);
        } else kick(0.2);
        if (Math.random() < 0.4) taunt(s);
        break;
      case "obstacleBroken":
        kick(0.18);
        break;
      case "pickup":
        if (e.player === you) vibrate(15);
        break;
      case "perk":
        if (e.player === you) {
          doFlash(0.25, "57,255,136");
          vibrate([20, 30, 20]);
        }
        break;
      case "revived":
        if (e.player === you) {
          youRingUntil = performance.now() + 4000;
          doFlash(0.4, "57,255,136");
          vibrate([20, 20, 20]);
        }
        break;
      case "telegraph":
        if (e.targetPlayer && e.targetPlayer === you) vibrate([25, 40, 25]);
        break;
      case "phase":
        taunt(s, true);
        kick(0.55, 0.05, 0.35);
        if (!calm) glitchUntil = performance.now() + 700;
        doFlash(0.3, "255,40,90");
        break;
      case "victory":
        kick(0.9, 0.1, 1.8);
        doFlash(0.8);
        startOutro(true);
        break;
      case "defeat":
        kick(0.7, 0.08, 1.2);
        doFlash(0.6, "255,0,40");
        startOutro(false);
        break;
    }
    hud.event(e, s, app.you);
  };

  // ---------------- boss taunts (Gemini design) ----------------
  const bubble = h("div.taunt");
  overlay.append(bubble);
  let bubbleUntil = 0;
  let nextTaunt = 0;
  let tauntIdx = 0;
  const taunt = (s: MatchState, force = false) => {
    const lines = s.boss?.kit.design?.taunts;
    if (!lines?.length || s.status !== "fighting") return;
    if (!force && performance.now() < bubbleUntil + 2000) return;
    const text = lines[tauntIdx++ % lines.length];
    bubble.textContent = text;
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
    bubbleUntil = performance.now() + 2800;
    nextTaunt = performance.now() + 15000;
    hud.say(text);
  };

  // ---------------- intro ----------------
  let introStarted = false;
  let introEnd = 0;
  const intro = h("div.intro", { "data-testid": "boss-intro" });
  const startIntro = (s: MatchState) => {
    if (!s.boss) return startPvpIntro(s);
    const kit = s.boss.kit;
    const t0 = performance.now();
    const lines = kit.design?.intro?.length ? kit.design.intro.slice(0, 4) : ["WARNING: KAIJU DETECTED"];
    introEnd = t0 + 2400 + lines.length * 350;
    zoom = 1.9;
    zoomTarget = [s.boss.x, s.boss.y];
    const clone = h("div.in-line.dim");
    const bar = h("div.in-line.green");
    const warn = h("div.in-lines");
    const name = h("div.in-name");
    const epithet = h("div.in-line.in-epithet");
    const meta = h("div.in-line.dim");
    let portrait: HTMLElement | null = null;
    // condensed (~4s) claude-genesis compile of the boss; falls back to the static portrait
    const gHost = mountIntroGenesis("boss", kit, app.lobby?.boss.genesis, s.mode);
    if (gHost) {
      portrait = gHost;
      introEnd = Math.max(introEnd, t0 + 4300);
    } else {
      try {
        portrait = h("div.in-portrait", null, bossPortraitCanvas(kit, 96));
      } catch {
        /* placeholder */
      }
    }
    intro.replaceChildren(
      h("div.lb.top"),
      h("div.lb.bot"),
      h("div.in-card", null, portrait, h("div.in-text", null, clone, bar, warn, name, epithet, meta)),
    );
    intro.classList.remove("out");
    overlay.append(intro);
    el.classList.add("intro-on");
    clone.textContent = `$ git clone github.com/${kit.repo}`;
    const iv = setInterval(() => {
      const k = (performance.now() - t0) / 1000;
      const p = clamp(k / 1.1, 0, 1);
      bar.textContent = `Receiving objects: ${asciiBar(p, 18)} ${Math.round(p * 100)}%`;
      const shown = Math.min(lines.length, Math.max(0, Math.floor((k - 0.8) / 0.35) + 1));
      while (warn.childElementCount < shown) warn.append(h("div.in-line.red", null, lines[warn.childElementCount]));
      const kn = k - 0.8 - lines.length * 0.35;
      if (kn > 0) name.textContent = kit.name.slice(0, Math.floor(kn * 40));
      if (kn > 0.4 && kit.design?.epithet) epithet.textContent = kit.design.epithet;
      if (kn > 0.6) {
        const knots = kit.limbs.filter((l) => l.weakPoint).length;
        const hl = kit.code?.heartLines?.find((l) => l.trim().length > 6)?.trim();
        const arch = kit.archetype && ARCH[kit.archetype] ? `${ARCH[kit.archetype].icon} ${ARCH[kit.archetype].label} — ${archetypeWhy(kit)}\n` : "";
        meta.textContent = `${arch}♥ ${kit.heart || "heart"} · ${kit.limbs.length} limbs · ${knots} knots · ${kit.theme}${hl ? `\n  > ${hl}` : ""}`;
      }
      if (performance.now() > introEnd && latest?.status !== "countdown") {
        clearInterval(iv);
        intro.classList.add("out");
        el.classList.remove("intro-on");
        const go = h("div.fight-flash", null, "$ ./fight --now");
        overlay.append(go);
        setTimeout(() => go.remove(), 1100);
        setTimeout(() => (intro.remove(), disposeIntroGenesis()), 500);
      }
    }, 50);
  };

  let introGenesis: GenesisHandle | null = null;
  const disposeIntroGenesis = () => {
    introGenesis?.dispose();
    introGenesis = null;
  };
  const mountIntroGenesis = (kind: "hero" | "boss", kit: MatchState["players"][number]["kit"] | NonNullable<MatchState["boss"]>["kit"] | undefined, genesis: Parameters<typeof playGenesis>[1]["genesis"], mode: "battle" | "edu" | "pvp"): HTMLElement | null => {
    if (!kit) return null;
    const host = h(`div.in-genesis.${kind}`, { "data-testid": "intro-genesis" });
    try {
      disposeIntroGenesis();
      introGenesis = playGenesis(host, { kind, kit, genesis, slug: kit.repo, condensed: true, interactive: false, mode, compact: portrait });
      return host;
    } catch (e) {
      console.warn("[kaiju] intro genesis failed", e);
      return null;
    }
  };

  const startPvpIntro = (s: MatchState) => {
    const t0 = performance.now();
    introEnd = t0 + 2600;
    const meP = s.players.find((p) => p.id === app.you);
    const meLobby = app.lobby?.players.find((p) => p.id === app.you);
    const gHost = meP ? mountIntroGenesis("hero", meP.kit, meLobby?.genesis, s.mode) : null;
    if (gHost) introEnd = t0 + 4300;
    intro.replaceChildren(
      h("div.lb.top"),
      h("div.lb.bot"),
      h(
        "div.in-card",
        null,
        gHost,
        h(
          "div.in-text",
          null,
          h("div.in-line.dim", null, s.mode === "pvp" ? `$ make royale ROOM=${app.room}` : `$ make class ROOM=${app.room}`),
          h("div.in-line.green", null, s.mode === "pvp" ? `${s.players.length} repositories compiled · stats from repo power` : `${s.players.length} heroes compiled · stats graded from code quality`),
          h("div.in-name", null, s.mode === "pvp" ? "PVP ROYALE" : "CLASSROOM BRAWL"),
          h("div.in-line.in-epithet", null, royaleOf(s) ? "last hero standing · no respawns" : s.pvp ? `best of ${s.pvp.rounds} rounds · most KOs wins` : "free-for-all"),
        ),
      ),
    );
    intro.classList.remove("out");
    overlay.append(intro);
    el.classList.add("intro-on");
    const iv = setInterval(() => {
      if (performance.now() > introEnd && latest?.status !== "countdown") {
        clearInterval(iv);
        intro.classList.add("out");
        el.classList.remove("intro-on");
        const go = h("div.fight-flash", null, royaleOf(latest) ? "$ ./royale --last-one-standing" : "$ ./fight --pvp");
        overlay.append(go);
        setTimeout(() => go.remove(), 1100);
        setTimeout(() => (intro.remove(), disposeIntroGenesis()), 500);
      }
    }, 50);
  };

  // ---------------- outro ----------------
  let outro: { victory: boolean; at: number } | null = null;
  const result = { outroDone: false };
  const finishOutro = () => {
    if (result.outroDone) return;
    result.outroDone = true;
    app.refresh();
  };
  // Boss-raid victory BSOD: a real "press any key". It waits for a key / tap / click / gamepad button (a projector or
  // spectator screen gives up after 60 s); defeat, royale and classroom endings keep their short auto-advance.
  let bsodWait = false, bsodReadyAt = 0, padWasDown = true;
  const continueOutro = (e?: KeyboardEvent) => {
    if (!outro) return;
    if (bsodWait) {
      if (performance.now() < bsodReadyAt || e?.repeat) return; // a key still held from the fight is not a press
      bsodWait = false;
      finishOutro();
    } else if (performance.now() - outro.at > 1200) finishOutro();
  };
  /** gamepads: any button going down while the BSOD waits (polled from the frame loop) */
  const pollPadContinue = () => {
    if (!bsodWait || performance.now() < bsodReadyAt) return;
    let down = false;
    for (const pad of navigator.getGamepads?.() ?? []) if (pad?.buttons.some((btn) => btn.pressed)) down = true;
    if (down && !padWasDown) continueOutro();
    padWasDown = down;
  };
  const startOutro = (victory: boolean) => {
    if (outro) return;
    outro = { victory, at: performance.now() };
    const bsod = victory && !!latest?.boss && !royaleOf(latest);
    const kit = latest?.boss?.kit;
    setTimeout(() => {
      const roy = royaleOf(latest);
      if (latest && roy) {
        const winnerId = roy.winner ?? roy.alive[0] ?? null;
        const winner = latest.players.find((p) => p.id === winnerId);
        const place = app.you ? (app.you === winnerId ? 1 : roy.placements[app.you]) : undefined;
        overlay.append(
          h(
            "div.defeat.pvp-end.royale-end",
            { "data-testid": "royale-end" },
            h("div.df-title", null, winnerId && winnerId === app.you ? "LAST PROCESS RUNNING" : "MERGE COMPLETE"),
            winner
              ? h("p", null, "★ ", h("b", { translate: "no" }, winnerId === app.you ? t("you") : handle(winner.name)), " ", h("span", null, "survived the merge"))
              : h("p", null, "no survivors · the GC took everyone"),
            place ? h("p", null, h("span", null, "you placed"), " ", h("b", null, `#${place} / ${latest.players.length}`)) : null,
            h("p.dim", null, "loading results…"),
          ),
        );
        return;
      }
      if (latest && !latest.boss) {
        const ranked = rankPvp(latest);
        const meIdx = ranked.findIndex((r) => r.id === app.you);
        overlay.append(
          h(
            "div.defeat.pvp-end",
            null,
            h("div.df-title", null, "CLASS DISMISSED"),
            h("p", null, `★ ${ranked[0]?.name ?? "—"} wins with ${ranked[0]?.kos ?? 0} KOs`),
            meIdx >= 0 ? h("p", null, `you placed #${meIdx + 1} of ${ranked.length}`) : null,
            h("p.dim", null, "loading report cards…"),
          ),
        );
        return;
      }
      const card = victory
        ? h(
            "div.bsod",
            null,
            h("div.bsod-title", null, ` ${kit?.name ?? "KAIJU"} `),
            h("p", null, `A fatal exception 0E has occurred at ${kit?.heart || "0028:C0011E36"} in VXD KAIJU(01).`),
            h("p", null, "The current boss will be terminated."),
            h("p", null, "*  Segmentation fault (core dumped)"),
            h("p", null, `*  boss: exit 139 (segfault) · squad: exit 0 (victory) after ${fmtTime(latest?.t ?? 0)}`),
            h("p.bsod-press", { "data-testid": "bsod-continue" }, isTouchDevice() ? "Tap anywhere to continue _" : "Press any key to continue _"),
          )
        : h(
            "div.defeat",
            null,
            h("div.df-title", null, "SQUAD TERMINATED"),
            h("p", null, "Process exited with code 1 (defeat)"),
            h("p", null, `${kit?.name ?? "the boss"} survives. tech debt wins this round.`),
            h("p.dim", null, "loading autopsy…"),
          );
      overlay.append(card);
      if (bsod) {
        bsodWait = true;
        bsodReadyAt = performance.now() + 600;
        padWasDown = true; // a button already held doesn't count until it's released
      }
    }, victory ? 1000 : 500);
    if (!bsod) setTimeout(finishOutro, victory ? 3200 : 2000);
    else if (spectator) setTimeout(() => { if (bsodWait) (bsodWait = false), finishOutro(); }, 60_000);
  };

  // ---------------- input ----------------
  let destroyed = false;
  let input: InputHandle | null = null;
  let selfPos: { x: number; y: number } | null = null;
  let sendIv: ReturnType<typeof setInterval> | null = null;
  let motionOverlay: HTMLElement | null = null;
  let hint: HTMLElement | null = null;
  let sensorBadge: HTMLElement | null = null;

  const setupInput = async () => {
    void loadModules(); // Optional art must not delay sensor listeners or the input sender.
    if (destroyed || spectator || !usesLocalControls()) return; // a headset is a display: its phone controller plays
    if (!loaded.input) {
      console.error("[kaiju] PHONE INPUT FAILURE: real input unavailable; refusing placeholder");
      return;
    }
    input = createInput({ canvas, toArena, getSelf: () => selfPos });
    if (isTouchDevice()) console.info("[kaiju] motion-v2 real input active; waiting for sensor delivery");
    // per-player thresholds from the lobby gesture training (codex-input motion v3 consumes them when available)
    const prof = loadGestureProfile();
    if (prof && typeof input.setProfile === "function") {
      try {
        input.setProfile(toThresholds(prof));
      } catch (e) {
        console.warn("[kaiju] setProfile failed", e);
      }
    }
    let lastNoticeAt = 0;
    let wasFiring = false, lastAttackToast = 0;
    let localActive = false;
    sendIv = setInterval(() => {
      if (!input || !latest || latest.status === "victory" || latest.status === "defeat") return;
      if (pausedNow()) return;
      if (watchingRoyale(latest)) return; // spectating
      const frame = input.sample();
      // Paired seat: the phone controller drives this hero. This display only sends while its own keys/buttons are in
      // use (mouse aim alone doesn't count, it would zero the phone's movement), plus one release frame when they stop;
      // otherwise its 30 Hz neutral frames fight the phone's. (No local prediction here: the hero is always drawn
      // from interpolated server snapshots.)
      if (app.lobby?.players.find((p) => p.id === app.you)?.paired) {
        const active = !!(frame.move[0] || frame.move[1] || frame.fire || frame.dash || frame.skill);
        if (!active && !localActive) return;
        localActive = active;
      }
      app.conn.send({ t: "input", frame });
      if (el.dataset.input !== input.mode) el.dataset.input = input.mode;
      const notice = input.lastGesture;
      if (input.mode !== "keyboard" && notice && notice.at !== lastNoticeAt) {
        // codex-input says exactly what fired and how ("⚡ dash · twist")
        lastNoticeAt = notice.at;
        const label = notice.kind === "dash" ? "⚡ dash" : notice.kind === "skill" ? "✦ skill" : "▸ attack";
        gestureToast(notice.via ? `${label} · ${notice.via}` : label, notice.kind);
      } else if (input.mode !== "keyboard" && notice === undefined) {
        // older input module: derive from frames
        if (frame.dash) gestureToast("⚡ dash", "dash");
        if (frame.skill) gestureToast("✦ skill", "skill");
        if (frame.fire && !wasFiring && performance.now() - lastAttackToast > 700) {
          lastAttackToast = performance.now();
          gestureToast("▸ attack", "attack");
        }
      }
      wasFiring = frame.fire;
      updatePhoneControls();
    }, 1000 / 30);
    if (input.mode === "keyboard") showKeyHint();
    else showMotionFlow();
  };

  const showKeyHint = () => {
    hint = h(
      "div.key-hint",
      null,
      h("span", null, h("kbd", null, "WASD"), " move"),
      h("span", null, h("kbd", null, "MOUSE"), " aim"),
      h("span", null, h("kbd", null, "LMB"), "/", h("kbd", null, "J"), " fire"),
      h("span", null, h("kbd", null, "SPACE"), " dash"),
      h("span", null, h("kbd", null, "E"), " skill"),
      h("span.dim", null, h("kbd", null, "H"), " hide"),
    );
    overlay.append(hint);
    setTimeout(() => hint?.classList.add("fade"), 9000);
  };
  const onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (isHost() && !spectator && (k === "p" || k === "escape") && latest?.status === "fighting" && !(e.target instanceof HTMLInputElement)) {
      if (!pauseState) sendPause(true);
      else if (pauseState.resumeAt === null) sendPause(false);
      return;
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && watchingRoyale(latest)) {
      cycleWatch(e.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (e.key === "Escape") menuSheet.hidden = !menuSheet.hidden;
    if (e.key.toLowerCase() === "h" && hint) hint.classList.toggle("fade");
    continueOutro(e);
  };
  addEventListener("keydown", onKey);
  // tap / click anywhere (the BSOD covers the overlay; phones: tap anywhere)
  overlay.addEventListener("pointerdown", () => continueOutro());
  stage.addEventListener("pointerdown", () => {
    if (!outro && watchingRoyale(latest)) cycleWatch(1);
  });
  // phones: first tap goes fullscreen and tries to lock portrait (both may fail; that's fine)
  const lockPortrait = () => {
    if (!isPhone()) return;
    try {
      const d = document.documentElement;
      const lock = () => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("portrait").catch(() => {});
      if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen({ navigationUI: "hide" }).then(lock, () => {});
      else lock();
    } catch {
      /* unsupported */
    }
  };

  const gToast = h("div.gesture-toast");
  stage.append(gToast);
  const gestureToast = (text: string, kind: string) => {
    gToast.textContent = text;
    gToast.className = `gesture-toast show ${kind}`;
    clearTimeout(gToastTimer);
    gToastTimer = window.setTimeout(() => gToast.classList.remove("show"), 400);
  };
  let gToastTimer = 0;
  // long-press = skill (motion v3): a charging ring grows under the finger; it only draws — input owns the gesture
  const pressRing = h("div.press-ring");
  let pressTimer = 0;
  const ringDown = (e: PointerEvent) => {
    if (!input || input.mode === "keyboard" || (e.target as Element).closest("button, .game-menu")) return;
    if (document.querySelector('[data-testid="input-charge"]')) return; // the input module draws its own (real) charge ring
    pressRing.style.left = `${e.clientX}px`;
    pressRing.style.top = `${e.clientY}px`;
    pressRing.classList.remove("go");
    pressTimer = window.setTimeout(() => {
      document.body.append(pressRing);
      void pressRing.offsetWidth;
      pressRing.classList.add("go"); // starts after the tap window so quick taps don't flash a ring
    }, 180);
  };
  const ringUp = () => {
    clearTimeout(pressTimer);
    setTimeout(() => pressRing.remove(), 80);
  };
  el.addEventListener("pointerdown", ringDown);
  addEventListener("pointerup", ringUp);
  addEventListener("pointercancel", ringUp);

  // Phones (motion or touch): sensor pill, recalibrate, a compact "enable tilt" pill, and mode-specific hints.
  // Nothing covers the arena during the intro; permission is normally granted in the lobby controls card.
  let enablePill: HTMLButtonElement | null = null;
  let recalBtn: HTMLElement | null = null;
  let tipsShown = false;
  const showMotionFlow = () => {
    sensorBadge = h("div.kj-sensor-status", { "data-testid": "input-sensors" }, "tap to enable tilt");
    recalBtn = h("button.btn.btn-tiny.recal", { "data-testid": "motion-recalibrate", onclick: () => (input?.calibrate(), vibrate(20)) }, "⟲ recalibrate");
    enablePill = h("button.btn.btn-tiny.enable-pill", { "data-testid": "motion-enable", hidden: true }, "tap to enable tilt") as HTMLButtonElement;
    // The portrait deck is pointer-events:none; this permission button must opt in.
    enablePill.style.pointerEvents = "auto";
    enablePill.addEventListener("click", (event) => {
      event.stopPropagation();
      // Both native permission calls execute synchronously inside this gesture.
      void input!.requestPermission().then(updatePhoneControls);
    });
    // portrait: pill + buttons live in the control deck; landscape: top-left of the arena
    if (portrait) sensorRow.append(sensorBadge, enablePill, recalBtn);
    else {
      sensorBadge.classList.add("floating");
      overlay.append(sensorBadge, enablePill, recalBtn);
    }
  };
  /** Called every input tick: keeps the phone controls UI truthful about the live input mode. */
  const updatePhoneControls = () => {
    if (!input || !sensorBadge) return;
    const mode = input.mode, st = input.sensorStatus ?? "off";
    const motionReady = st === "on";
    setText(sensorBadge, motionReady ? "motion: on" : input.motionProfile === "tap-only" ? "touch controls" : "tap to enable tilt");
    const status = mode === "touch" ? "touch" : st;
    if (sensorBadge.dataset.status !== status) sensorBadge.dataset.status = status;
    if (sensorBadge.dataset.mode !== mode) sensorBadge.dataset.mode = mode;
    if (recalBtn && recalBtn.hidden !== !motionReady) recalBtn.hidden = !motionReady;
    const introOver = performance.now() > introEnd;
    const hideEnable = motionReady || input.motionProfile === "tap-only";
    if (enablePill && enablePill.hidden !== hideEnable) enablePill.hidden = hideEnable;
    if (introOver && !tipsShown && latest?.status === "fighting") {
      tipsShown = true;
      const tips = h("div.motion-tips", null, mode === "touch" ? "drag to move · tap = attack · double-tap = dash · hold = skill" : "tilt = move · swing/tap = attack · twist = dash · spin/hold = skill");
      overlay.append(tips);
      setTimeout(() => tips.classList.add("fade"), 6000);
      if (mode === "touch") setTimeout(showTouchSplit, 1200); // after the "$ ./fight --now" flash
    }
  };
  /** 5s ghost hint over the viewport for touch mode: what the left/right of the arena do. */
  const showTouchSplit = () => {
    const ghost = h("div.touch-ghost", { "aria-hidden": "true" }, h("div.tg-l", null, "MOVE", h("small", null, "drag here")), h("div.tg-r", null, "ATTACK", h("small", null, "tap here")));
    stage.append(ghost);
    const off = () => ghost.classList.add("fade");
    setTimeout(off, 5000);
    addEventListener("pointerdown", off, { once: true });
    setTimeout(() => ghost.remove(), 6500);
  };
  // Portrait works too: removed the old rotate-only blocker and forced landscape lock.

  setupInput();
  // Rejoined phones can arrive directly in countdown; gate them before the first snapshot.
  let touchChosen = false; // "touch only" answers the gate for this page even if the permission state stays pending
  const stopPermission = subscribeMotionPermission(state => {
    if (spectator || watchingRoyale(latest) || !usesLocalControls()) return;
    if (state.ready || touchChosen) { motionOverlay?.remove(); motionOverlay = null; return; }
    if (!motionOverlay) {
      motionOverlay = h("div.motion-gate", { "data-testid": "motion-gate", role: "dialog", "aria-label": "enable controls" },
        h("div.term-window", null, h("h2", null, "📱 enable your controls"),
          h("p", null, "Enable motion for this page before the countdown ends, or choose touch only."),
          h("button.btn.btn-primary", { "data-testid": "countdown-motion-enable", onclick: () => { void requestMotionPermission(); } }, "📱 tap to enable motion"),
          h("button.btn", { "data-testid": "countdown-touch-only", onclick: () => { saveMotionProfile("tap-only"); input?.setMotionProfile?.("tap-only"); touchChosen = true; motionOverlay?.remove(); motionOverlay = null; } }, "touch only")));
      el.append(motionOverlay);
    }
    motionOverlay.dataset.state = state.permission;
  });
  // Bubble after the touchend capture / target onclick permission handlers. A touch
  // pointerdown is not activation, and fullscreen must not run ahead of a button's request.
  addEventListener("click", lockPortrait, { once: true });

  // ---------------- render loop ----------------
  let raf = 0;
  let last = performance.now();
  let visTime = 0;
  let skillCdMax = 1;
  let ambientTick = 0;
  let miniTick = 0;
  let lastHudMs = -Infinity;
  // "where am I?": pulsing ring + YOU tag under your hero for the first seconds and after a revive
  let youRingUntil = 0;
  let youRingStarted = false;
  let meWasDown = false;
  // strong = pulsing ring + YOU label (first seconds, after respawn); otherwise a steady ring so you never lose yourself
  const drawYouRing = (me: PlayerState, now: number, scale: number, strong = true, label = "YOU", rgb = "255,210,61") => {
    if (!strong) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,210,61,.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(Math.round(me.x) + 0.5, Math.round(me.y + 8 * scale) + 0.5, 9 * scale, 3.5 * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const pulse = 0.5 + 0.5 * Math.sin(now * 8);
    const rx = (10 + pulse * 3) * scale, ry = (4 + pulse) * scale;
    ctx.save();
    ctx.strokeStyle = `rgba(${rgb},${0.55 + 0.45 * pulse})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(Math.round(me.x) + 0.5, Math.round(me.y + 8 * scale) + 0.5, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.fillStyle = "#000";
    ctx.fillText(t(label), Math.round(me.x) + 1, Math.round(me.y + 22 * scale) + 1);
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.fillText(t(label), Math.round(me.x), Math.round(me.y + 22 * scale));
    ctx.textAlign = "left";
    ctx.restore();
  };
  let camX = 0;
  let camY = 0;
  let camInit = false;

  // ---------------- portrait: edge indicators + minimap ----------------
  const FONT8 = '8px "Press Start 2P", monospace';
  // pixel triangle whose tip is at (x, y), pointing outward (dir = +1 right edge, -1 left edge)
  const arrow = (x: number, y: number, dir: -1 | 1, col: string) => {
    ctx.fillStyle = "#000";
    for (let i = 0; i <= 6; i++) ctx.fillRect(x - dir * i - (dir > 0 ? 0 : 0), y - i - 1, 1, i * 2 + 3);
    ctx.fillStyle = col;
    for (let i = 1; i <= 5; i++) ctx.fillRect(x - dir * i, y - i + 1, 1, i * 2 - 1);
  };
  const edgeLabel = (x: number, y: number, dir: -1 | 1, text: string, col: string) => {
    ctx.font = FONT8;
    ctx.textBaseline = "middle";
    ctx.textAlign = dir > 0 ? "right" : "left";
    const tx = x - dir * 9;
    ctx.fillStyle = "#000";
    ctx.fillText(t(text), tx + 1, y + 1);
    ctx.fillStyle = col;
    ctx.fillText(t(text), tx, y);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  };
  const pixHeart = (x: number, y: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 2, 2);
    ctx.fillRect(x + 3, y, 2, 2);
    ctx.fillRect(x - 0, y + 1, 5, 2);
    ctx.fillRect(x + 1, y + 3, 3, 1);
    ctx.fillRect(x + 2, y + 4, 1, 1);
  };
  const drawIndicators = (s: MatchState, me: PlayerState | null, now: number) => {
    const offscreen = (x: number) => x < view.x + 6 || x > view.x + view.w - 6;
    const place = (x: number, y: number) => {
      const dir: -1 | 1 = x < view.x ? -1 : 1;
      return { ex: dir < 0 ? 2 : view.w - 2, ey: clamp(y - view.y, 22, view.h - 14), dir };
    };
    const pulse = 0.5 + 0.5 * Math.sin(now * 10);
    // boss (or an attack aimed at you, which outranks it)
    const b = s.boss;
    if (b && offscreen(b.x)) {
      const { ex, ey, dir } = place(b.x, b.y);
      const atMe = !!b.casting && b.targetPlayer === app.you;
      if (atMe) {
        const name = b.kit.attacks.find((a) => a.id === b.casting!.attackId)?.name ?? "incoming";
        arrow(dir < 0 ? ex + 6 : ex, ey, dir, pulse > 0.5 ? "#ff3355" : "#ffd23d");
        edgeLabel(dir < 0 ? ex + 6 : ex, ey, dir, `! ${name.slice(0, 16)}`, "#ff3355");
      } else {
        arrow(dir < 0 ? ex + 6 : ex, ey, dir, "#ff3355");
        pixHeart(dir < 0 ? ex + 9 : ex - 15, ey - 2, pulse > 0.3 ? "#ff3355" : "#ff8fa0");
        edgeLabel(dir < 0 ? ex + 10 : ex - 4, ey, dir, b.airborne ? (b.kit.archetype === "abyssal" ? "BOSS ⇣" : "BOSS ✈") : "BOSS", "#ffd0d8");
      }
    }
    // royale: the nearest off-screen rivals (still alive)
    if (royaleOf(s)) {
      const from = me && !me.eliminated ? me : { x: view.x + view.w / 2, y: view.y + view.h / 2 };
      const rivals = s.players.filter((p) => p.id !== app.you && !p.eliminated && p.alive && offscreen(p.x)).sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
      for (const p of rivals.slice(0, 2)) {
        const { ex, ey, dir } = place(p.x, p.y);
        arrow(dir < 0 ? ex + 6 : ex, ey, dir, "#ff8fa0");
        edgeLabel(dir < 0 ? ex + 6 : ex, ey, dir, p.name.slice(0, 8), "#ffd0d8");
      }
      return;
    }
    // downed teammates
    for (const p of s.players) {
      if (p.alive || p.id === app.you || !offscreen(p.x)) continue;
      const { ex, ey, dir } = place(p.x, p.y);
      arrow(dir < 0 ? ex + 6 : ex, ey, dir, "#39ff88");
      edgeLabel(dir < 0 ? ex + 6 : ex, ey, dir, `${p.name.slice(0, 8)} ${Math.round(p.reviveProgress * 100)}%`, "#39ff88");
    }
    void me;
  };
  // royale: outside (or about to be outside) the GC zone, a chevron next to your hero points at the safe circle
  const drawZonePointer = (z: NonNullable<NonNullable<MatchState["pvp"]>["royale"]>["zone"], me: PlayerState, s: MatchState, now: number) => {
    if (!z) return;
    const d = Math.hypot(me.x - z.cx, me.y - z.cy);
    const outNow = d > z.r - 2;
    const outNext = !outNow && z.targetR < z.r - 0.5 && s.t < z.shrinkEnd && d > z.targetR;
    if (!outNow && !outNext) return;
    const a = Math.atan2(z.cy - me.y, z.cx - me.x);
    const sc = s.heroScale ?? 1;
    const R0 = 16 * sc + 4 * Math.sin(now * 8);
    const px = Math.round(me.x + Math.cos(a) * R0), py = Math.round(me.y - 4 * sc + Math.sin(a) * R0);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a);
    const col = outNow ? (Math.floor(now * 6) % 2 ? "#ff3355" : "#ffd23d") : "#ffd23d";
    ctx.fillStyle = "#000";
    ctx.fillRect(-2, -5, 3, 11);
    for (let i = 0; i < 5; i++) ctx.fillRect(i, -5 + i, 2, 11 - i * 2);
    ctx.fillStyle = col;
    for (let i = 0; i < 4; i++) ctx.fillRect(i, -4 + i, 1, 9 - i * 2);
    ctx.restore();
    if (outNow) {
      ctx.font = FONT8;
      ctx.textAlign = "center";
      const label = t("GC ZONE");
      const lx = Math.round(me.x + Math.cos(a) * (R0 + 14)), ly = Math.round(me.y - 4 * sc + Math.sin(a) * (R0 + 14)) + 3;
      ctx.fillStyle = "#000";
      ctx.fillText(label, lx + 1, ly + 1);
      ctx.fillStyle = col;
      ctx.fillText(label, lx, ly);
      ctx.textAlign = "left";
    }
  };
  const drawMinimap = (s: MatchState, now: number) => {
    const g = mctx, k = 0.25;
    g.clearRect(0, 0, minimap.width, minimap.height);
    g.fillStyle = "rgba(3,6,5,.78)";
    g.fillRect(0, 0, minimap.width, minimap.height);
    // faint "code" rows like an editor minimap, shaped by the boss's real heart lines
    const lines = s.boss?.kit.code?.heartLines?.length ? s.boss.kit.code.heartLines : ["function f() {", "  return x;", "}"];
    const SYN = ["rgba(97,175,239,.16)", "rgba(198,120,221,.16)", "rgba(152,195,121,.14)", "rgba(171,178,191,.1)"];
    for (let row = 0, i = 0; row < minimap.height; row += 3, i++) {
      const ln = lines[i % lines.length];
      const indent = Math.min(16, (ln.length - ln.trimStart().length) * 2);
      const words = ln.trim().split(/\s+/);
      let x = 2 + indent;
      for (let w = 0; w < words.length && x < minimap.width - 2; w++) {
        const len = Math.max(2, Math.min(18, words[w].length * 1.5));
        g.fillStyle = SYN[(i + w) % SYN.length];
        g.fillRect(x, row + 1, len, 1);
        x += len + 2;
      }
    }
    g.fillStyle = "#24343c";
    for (const o of s.obstacles ?? []) g.fillRect(Math.round((o.x - o.w / 2) * k), Math.round((o.y - o.h / 2) * k), Math.max(2, Math.round(o.w * k)), Math.max(2, Math.round(o.h * k)));
    if (s.perkOffer) {
      g.fillStyle = "#39ff88";
      for (const pad of s.perkOffer.pads) g.fillRect(Math.round(pad.x * k) - 2, Math.round(pad.y * k) - 2, 4, 4);
    }
    for (const z of s.hazards) {
      g.fillStyle = z.armed ? "rgba(255,51,85,.8)" : "rgba(255,51,85,.4)";
      if (z.kind === "laser") {
        for (let d = 0; d < 140; d += 4) g.fillRect(Math.round((z.x + Math.cos(z.angle) * d) * k), Math.round((z.y + Math.sin(z.angle) * d) * k), 1, 1);
      } else g.fillRect(Math.round((z.x - z.r) * k), Math.round((z.y - z.r) * k), Math.max(2, Math.round(z.r * 2 * k)), Math.max(2, Math.round(z.r * 2 * k)));
    }
    const PK: Record<string, string> = { heart: "#ff3355", energy: "#3de8ff", armor: "#c8d4e0" };
    for (const p of s.pickups ?? []) {
      g.fillStyle = PK[p.kind] ?? "#fff";
      g.fillRect(Math.round(p.x * k), Math.round(p.y * k), 1, 1);
    }
    g.fillStyle = "#8a1328";
    for (const r of s.boss?.regions ?? []) g.fillRect(Math.round((r.x - r.r) * k), Math.round((r.y - r.r) * k), Math.max(2, Math.round(r.r * 2 * k)), Math.max(2, Math.round(r.r * 2 * k)));
    g.fillStyle = "#ff3355";
    if (s.boss) g.fillRect(Math.round(s.boss.x * k) - 1, Math.round(s.boss.y * k) - 1, 3, 3);
    const zone = royaleOf(s)?.zone;
    if (zone) {
      g.save();
      g.beginPath();
      g.rect(0, 0, minimap.width, minimap.height);
      g.arc(zone.cx * k, zone.cy * k, Math.max(0, zone.r * k), 0, Math.PI * 2, true);
      g.fillStyle = "rgba(40,0,30,.55)";
      g.fill("evenodd");
      g.strokeStyle = "#ff3d7f";
      g.beginPath();
      g.arc(zone.cx * k, zone.cy * k, Math.max(0, zone.r * k), 0, Math.PI * 2);
      g.stroke();
      if (zone.targetR < zone.r - 0.5) {
        g.setLineDash([2, 2]);
        g.strokeStyle = "#ffd23d";
        g.beginPath();
        g.arc(zone.cx * k, zone.cy * k, Math.max(0, zone.targetR * k), 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
    }
    for (const p of s.players) {
      if (p.id === app.you) continue;
      g.fillStyle = "#000";
      g.fillRect(Math.round(p.x * k) - 2, Math.round(p.y * k) - 2, 4, 4);
      g.fillStyle = p.alive ? "#3de8ff" : "#777";
      g.fillRect(Math.round(p.x * k) - 1, Math.round(p.y * k) - 1, 2, 2);
    }
    const me = s.players.find((p) => p.id === app.you);
    if (me) {
      g.fillStyle = "#000";
      g.fillRect(Math.round(me.x * k) - 3, Math.round(me.y * k) - 3, 6, 6);
      g.fillStyle = Math.floor(now * 4) % 2 ? "#ffffff" : "#ffd23d";
      g.fillRect(Math.round(me.x * k) - 2, Math.round(me.y * k) - 2, 4, 4);
    }
    g.strokeStyle = "rgba(255,255,255,.55)";
    g.strokeRect(Math.round(view.x * k) + 0.5, Math.round(view.y * k) + 0.5, Math.round(view.w * k) - 1, Math.round(view.h * k) - 1);
  };

  const interp = (rt: number): MatchState | null => {
    if (!snaps.length) return null;
    let a = snaps[0], b = snaps[snaps.length - 1];
    if (rt <= a.t) b = a;
    else if (rt >= b.t) a = b;
    else
      for (let i = snaps.length - 1; i > 0; i--) {
        if (snaps[i - 1].t <= rt) {
          a = snaps[i - 1];
          b = snaps[i];
          break;
        }
      }
    const span = b.t - a.t;
    const f = span > 0 ? clamp((rt - a.t) / span, 0, 1) : 1;
    const S = b.s, A = a.s;
    // ran past the newest snapshot (late packet): keep heroes moving on their velocity for up to 100 ms instead of freezing
    const ahead = a === b && rt > b.t ? Math.min(rt - b.t, 0.1) : 0;
    const players: PlayerState[] = S.players.map((p) => {
      if (ahead) return p.alive && (p.vx || p.vy) ? { ...p, x: clamp(p.x + p.vx * ahead, 0, WW), y: clamp(p.y + p.vy * ahead, 0, WH) } : p;
      const q = A.players.find((x) => x.id === p.id);
      if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 80) return p;
      return { ...p, x: lerp(q.x, p.x, f), y: lerp(q.y, p.y, f) };
    });
    const SB = S.boss, AB = A.boss ?? S.boss;
    const dtB = clamp(rt - b.t, -0.15, 0.1);
    const bullets = S.bullets.map((u) => ({ ...u, x: u.x + u.vx * dtB, y: u.y + u.vy * dtB }));
    const minions = S.minions.map((m) => {
      const q = A.minions.find((x) => x.id === m.id);
      return q ? { ...m, x: lerp(q.x, m.x, f), y: lerp(q.y, m.y, f) } : m;
    });
    const hazards = S.hazards.map((z) => ({ ...z, t: clamp(z.t + dtB, 0, z.total) }));
    let boss: MatchState["boss"] = null;
    if (SB && AB) {
      const regions = (SB.regions ?? []).map((r) => {
        const q = AB.regions?.find((x) => x.id === r.id);
        return q ? { ...r, x: lerp(q.x, r.x, f), y: lerp(q.y, r.y, f) } : r;
      });
      const casting = SB.casting ? { ...SB.casting, t: clamp(SB.casting.t + dtB, 0, SB.casting.total) } : null;
      // poses are sim-driven; extrapolate their clock like casting so animations don't step at 20 Hz
      const pose = SB.pose ? { ...SB.pose, t: clamp(SB.pose.t + dtB, 0, Math.max(SB.pose.total, SB.pose.t)) } : SB.pose;
      boss = { ...SB, x: lerp(AB.x, SB.x, f), y: lerp(AB.y, SB.y, f), regions, casting, pose };
    }
    return { ...S, t: lerp(A.t, S.t, f), players, bullets, minions, hazards, boss };
  };

  /** 3D frame: the stage draws the world (into its WebGL canvas, or into ctx), then the 2D floor overlays go on the
   *  transparent overlay through the floor's local affine so they lie flat under the heroes. */
  const extras3d = (s: MatchState, focusId: string | null = app.you) => ({
    you: app.you, focusId, events: [] as GameEvent[], theme: arenaTheme(s), seed: s.boss?.kit.seed ?? arenaSeed,
    variant: s.boss ? undefined : royaleOf(s) ? "royale" as const : undefined, world: { w: WW, h: WH }, shake: { x: 0, y: 0 },
  });
  const draw3d = (s: MatchState, me: PlayerState | null, watched: PlayerState | null, roy: ReturnType<typeof royaleOf>, now: number, sx: number, sy: number) => {
    const st = st3d!;
    if (octx) ctx.clearRect(0, 0, view.w, view.h);
    else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, view.w, view.h);
    }
    const variant = s.boss ? undefined : roy ? "royale" as const : undefined;
    // shake moves the final composite (the WebGL canvas by CSS, the overlay by ctx), never the stage camera, so
    // screenToWorld stays exact for aim while the picture shakes
    const shakeCss = sx || sy ? `translate(${sx * cssScale}px, ${sy * cssScale}px)` : "";
    if (st.canvas && st.canvas.style.transform !== shakeCss) st.canvas.style.transform = shakeCss;
    ctx.save();
    ctx.translate(sx, sy);
    safe("stage25d", st.render.bind(st), ctx, s, visTime, view, { ...extras3d(s, watched?.id ?? me?.id ?? null), events: releasedEvents, variant });
    ctx.restore();
    const onFloor = (x: number, y: number, draw: () => void) => {
      const [a, b, c, d, e, f] = floorAffine(st, x, y);
      ctx.save();
      ctx.setTransform(RES * a, RES * b, RES * c, RES * d, RES * e, RES * f);
      draw();
      ctx.restore();
    };
    const hs = s.heroScale ?? 1;
    if (me && me.alive && !me.eliminated) onFloor(me.x, me.y, () => drawYouRing(me, now, hs, performance.now() < youRingUntil));
    if (watched) onFloor(watched.x, watched.y, () => drawYouRing(watched, now, hs, true, watched.name, "61,232,255"));
    if (roy && me && !me.eliminated && me.alive) onFloor(me.x, me.y, () => drawZonePointer(roy.zone, me, s, now));
  };

  const frame = (nowMs: number) => {
    raf = requestAnimationFrame(frame);
    pollPadContinue();
    if (document.hidden) { last = nowMs; return; }
    // Bound sustained phone CPU/GPU work instead of running the elaborate pixel
    // effects at the display's maximum refresh rate. The independent 30 Hz input
    // sender and authoritative snapshot stream are never throttled here.
    // 4 ms tolerance: every 2nd frame at 60 Hz / 4th at 120 Hz. (With 1 ms, normal rAF timestamp jitter made a 33 ms
    // gap read as 32.x, skipped it, and the phone alternated 33/50 ms frames: ~22 fps judder.)
    if (phoneLayout && nowMs - last < 1000 / 30 - 4) return;
    const dtReal = Math.min(0.1, (nowMs - last) / 1000);
    last = nowMs;
    const now = nowMs / 1000;

    // time dilation
    let rate = 1;
    tickPauseCountdown();
    if (pausedNow()) {
      rate = 0;
      lag = Math.max(0, lag - dtReal); // don't build an interpolation backlog while frozen
    } else if (hitstop > 0) {
      hitstop -= dtReal;
      rate = 0;
    } else if (slowmo > 0) {
      slowmo -= dtReal;
      rate = 0.3;
    }
    if (!pausedNow()) lag += dtReal * (1 - rate);
    if (rate === 1 && lag > 0) lag = Math.max(0, lag - dtReal * 0.35);
    lag = Math.min(lag, 0.8);
    visTime += dtReal * rate;

    if (offset === null) {
      drawWaiting(now);
      return;
    }
    const rt = now - clockOffset(now) - delay - lag;
    while (pendingEvents.length && pendingEvents[0].t <= rt) releasedEvents.push(pendingEvents.shift()!.e);
    const s = interp(rt);
    if (!s) return;
    for (const e of releasedEvents) handleEvent(e, s);

    const me = s.players.find((p) => p.id === app.you);
    selfPos = me ? { x: me.x, y: me.y } : null;
    // smoothness playtests: a page that defines globalThis.__kaijuTrace gets your hero per drawn frame
    const tg = globalThis as { __kaijuTrace?: number[][]; __kaijuTraceId?: string };
    const traced = tg.__kaijuTrace && (tg.__kaijuTraceId ? s.players.find((p) => p.id === tg.__kaijuTraceId) : me);
    if (traced) tg.__kaijuTrace!.push([nowMs, traced.x, traced.y, rt - snaps[snaps.length - 1].t, rate]); // + how far past the newest snapshot, time rate
    // royale: an eliminated player's camera follows the hero they're watching (killer / leader, cycle with ◀ ▶ / arrows)
    const roy = royaleOf(s);
    const watching = watchingRoyale(s);
    if (watching) pickWatch(s);
    const watched = watching ? s.players.find((p) => p.id === watchId) ?? null : null;
    const focus = watched ?? me ?? null;
    if (me && me.alive && meWasDown) youRingUntil = Math.max(youRingUntil, performance.now() + 3000); // respawn / revive
    meWasDown = !!me && !me.alive;

    // camera
    trauma = Math.max(0, trauma - dtReal * 1.6);
    const sh = trauma * trauma;
    nudge[0] *= Math.exp(-dtReal * 12);
    nudge[1] *= Math.exp(-dtReal * 12);
    const sx = Math.round((Math.random() * 2 - 1) * sh * 7 + nudge[0]);
    const sy = Math.round((Math.random() * 2 - 1) * sh * 7 + nudge[1]);
    zoom = lerp(zoom, 1, performance.now() < introEnd - 900 ? 0.01 : 0.06);
    if (zoom < 1.003) zoom = 1;

    // camera: portrait follows the hero (slight lead in the move direction); the intro looks at the boss first
    if (view.w < WW || view.h < WH) {
      const introLook = (performance.now() < introEnd - 600 || !me) && !!s.boss;
      const fx = introLook ? s.boss!.x : focus ? focus.x + clamp(focus.vx * 0.35, -36, 36) : WW / 2;
      const fy = introLook ? s.boss!.y : focus ? focus.y + clamp(focus.vy * 0.25, -24, 24) : WH / 2;
      const tx = clamp(fx - view.w / 2, 0, WW - view.w), ty = clamp(fy - view.h / 2, 0, WH - view.h);
      const k = 1 - Math.exp(-dtReal * 5);
      camX = camInit ? camX + (tx - camX) * k : tx;
      camY = camInit ? camY + (ty - camY) * k : ty;
      camInit = true;
      view.x = Math.round(camX);
      view.y = Math.round(camY);
    }
    const use3d = !!st3d && s.mode !== "edu";
    if (use3d !== on3d) {
      on3d = use3d;
      el.classList.toggle("view-3d", use3d);
    }
    ctx = use3d && octx ? octx : ctx0;
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (use3d) {
      draw3d(s, me ?? null, watched, roy, now, sx, sy);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.save();
      {
        const zx = zoom === 1 ? view.x + view.w / 2 : clamp(zoomTarget[0], view.w / 2 / zoom, WW - view.w / 2 / zoom);
        const zy = zoom === 1 ? view.y + view.h / 2 : clamp(zoomTarget[1], view.h / 2 / zoom, WH - view.h / 2 / zoom);
        ctx.translate(view.w / 2, view.h / 2);
        if (zoom !== 1) ctx.scale(zoom, zoom);
        ctx.translate(-zx, -zy);
      }
      ctx.translate(sx, sy);
      X.trackPlayers(s.players);
      const tgt = s.boss ? s.players.find((p) => p.id === s.boss!.targetPlayer) : null;
      if (tgt) X.bossLookAt(tgt.x, tgt.y);
      const variant = s.boss ? undefined : roy ? "royale" as const : s.mode === "edu" ? "classroom" as const : undefined;
      safe("drawArenaBackground", R.drawArenaBackground, ctx, arenaTheme(s), s.boss?.kit.seed ?? arenaSeed, visTime, variant, WW !== ARENA_W || WH !== ARENA_H ? { w: WW, h: WH } : undefined);
      if (roy) safe("drawRoyaleZone", X.drawRoyaleZone, ctx, s.pvp, s.t, visTime, { w: WW, h: WH });
      safe("drawPerkPads", R.drawPerkPads, ctx, s.perkOffer ?? null, s.players, visTime);
      safe("drawObstacles", R.drawObstacles, ctx, s.obstacles ?? [], visTime);
      safe("drawPickups", R.drawPickups, ctx, s.pickups ?? [], visTime);
      safe("drawHazards", R.drawHazards, ctx, s.hazards, visTime);
      safe("drawMinions", R.drawMinions, ctx, s.minions, visTime);
      if (s.boss) safe("drawBoss", R.drawBoss, ctx, s.boss, visTime);
      const order = [...s.players].sort((a, b) => a.y - b.y);
      for (const p of order) safe("drawPlayer", R.drawPlayer, ctx, p, visTime, p.id === app.you);
      if (me && me.alive && !me.eliminated) drawYouRing(me, now, s.heroScale ?? 1, performance.now() < youRingUntil);
      if (watched) drawYouRing(watched, now, s.heroScale ?? 1, true, watched.name, "61,232,255");
      if (roy && me && !me.eliminated && me.alive) drawZonePointer(roy.zone, me, s, now);
      safe("drawBullets", R.drawBullets, ctx, s.bullets, visTime);
      safe("drawEvents", R.drawEvents, ctx, releasedEvents, visTime, view);
      ctx.restore();
    }
    // 3D: the overlay canvas is view-sized with no world offset (phones scroll view.x/y)
    if (use3d) safe("drawPostFx", R.drawPostFx, ctx, visTime, sh, { x: 0, y: 0, w: view.w, h: view.h }, { overlay: true });
    else safe("drawPostFx", R.drawPostFx, ctx, visTime, sh, view);
    if (portrait || view.w < WW) {
      drawIndicators(s, me ?? null, now);
      if ((miniTick = (miniTick + 1) % 2) === 0) drawMinimap(s, now);
    }
    if (!portrait && !use3d && (ambientTick = (ambientTick + 1) % 6) === 0) actx.drawImage(canvas, 0, 0, ambient.width, ambient.height);
    releasedEvents.length = 0;

    // DOM fx
    flashA = Math.max(0, flashA - dtReal * 3);
    flash.style.background = flashA > 0.01 ? `rgba(${flashCol},${flashA.toFixed(3)})` : "transparent";
    stage.classList.toggle("glitch", performance.now() < glitchUntil);
    let inDanger = false;
    const z0 = roy?.zone;
    if (z0 && me && me.alive && !me.eliminated && Math.hypot(me.x - z0.cx, me.y - z0.cy) > z0.r) inDanger = true; // outside the GC zone
    if (me && me.alive)
      for (const z of s.hazards) {
        if (z.armed || z.kind === "firewall") continue;
        if (z.kind === "laser") {
          const dx = me.x - z.x, dy = me.y - z.y;
          const along = dx * Math.cos(z.angle) + dy * Math.sin(z.angle);
          const perp = Math.abs(-dx * Math.sin(z.angle) + dy * Math.cos(z.angle));
          if (along > 0 && perp < z.r + 6) inDanger = true;
        } else if (Math.hypot(me.x - z.x, me.y - z.y) < z.r + 6) inDanger = true;
      }
    danger.classList.toggle("on", inDanger);
    spectate.update(s, me ?? null, watchId, watching);
    el.classList.toggle("spectating", watching);
    el.classList.toggle("royale", !!roy);
    if (watching && motionOverlay) (motionOverlay.remove(), (motionOverlay = null)); // knocked out: no controls to enable
    stage.classList.toggle("enraged", !!s.boss && (s.boss.enraged || s.boss.phase >= 2));

    // Cooldown text and status bars don't need the canvas refresh rate. Keep
    // input sampling, snapshot interpolation and world rendering independent.
    if (!phoneLayout || nowMs - lastHudMs >= 1000 / 15) {
      lastHudMs = nowMs;
      hud.update(s, app.you, input?.mode ?? null);
      syncFollow(s.players);
      syncPair(s);
      if (me) {
        // on-screen DASH/SKILL buttons (touch fallback and motion-v2) get cooldown fill + countdown
        const sk = document.querySelector<HTMLElement>(".kj-touch-skill");
        const da = document.querySelector<HTMLElement>(".kj-touch-dash");
        skillCdMax = Math.max(skillCdMax, me.skillCd);
        const touchMode = input?.mode === "touch";
        setText(gsSkillLbl, touchMode ? "✦ hold" : "✦ spin or hold");
        setText(gsDashLbl, touchMode ? "⚡ double-tap" : "⚡ twist");
        setText(gsSkillState, me.skillCd > 0 ? `${me.skillCd.toFixed(1)}s` : "READY");
        gsSkill.classList.toggle("ready", me.skillCd <= 0);
        gsSkill.style.setProperty("--cd", me.skillCd > 0 ? (1 - me.skillCd / skillCdMax).toFixed(2) : "1");
        setText(gsDashState, me.dashCd > 0 ? `${me.dashCd.toFixed(1)}s` : "READY");
        gsDash.classList.toggle("ready", me.dashCd <= 0);
        gsDash.style.setProperty("--cd", me.dashCd > 0 ? Math.max(0, 1 - me.dashCd / 1.2).toFixed(2) : "1");
        if (sk) {
          sk.style.setProperty("--cd", me.skillCd > 0 ? (1 - me.skillCd / skillCdMax).toFixed(2) : "1");
          sk.dataset.ready = me.skillCd > 0 ? "0" : "1";
          sk.dataset.cd = me.skillCd > 0 ? me.skillCd.toFixed(1) : "";
          sk.dataset.code = `$ ${me.kit.skill}`;
        }
        if (da) {
          da.style.setProperty("--cd", me.dashCd > 0 ? Math.max(0, 1 - me.dashCd / 1.2).toFixed(2) : "1");
          da.dataset.ready = me.dashCd > 0 ? "0" : "1";
          da.dataset.cd = me.dashCd > 0 ? me.dashCd.toFixed(1) : "";
        }
      }
      const mapKey = s.boss?.kit.repo ?? "pvp";
      if (portrait && miniTab.dataset.boss !== mapKey) {
        miniTab.dataset.boss = mapKey;
        miniTab.textContent = s.boss ? `▾ ${(s.boss.kit.heart || "arena").split("/").pop()} · map` : "▾ classroom.map";
      }
    }
    if (s.status === "fighting" && !youRingStarted && performance.now() > introEnd) {
      youRingStarted = true;
      youRingUntil = performance.now() + 10000;
    }
    if (s.status === "fighting") {
      if (!nextTaunt) nextTaunt = performance.now() + 5000;
      else if (performance.now() > nextTaunt) taunt(s);
    }
    const showBubble = performance.now() < bubbleUntil && !!s.boss;
    bubble.classList.toggle("show", showBubble);
    if (showBubble) {
      const b = s.boss!;
      const top = b.regions?.length ? Math.min(...b.regions.map((r) => r.y - r.r)) : b.y - 50;
      // 3D: the bubble sits over the projected head (regions are at sprite height there)
      const p = use3d && st3d ? st3d.worldToScreen(b.x, b.y, Math.max(0, b.y - top)) : { x: b.x - view.x, y: top - view.y };
      bubble.style.left = `${parseFloat(stage.style.left) + clamp(p.x, 30, view.w - 30) * cssScale}px`;
      bubble.style.top = `${parseFloat(stage.style.top) + Math.max(20, p.y) * cssScale}px`;
    }

  };

  const drawWaiting = (now: number) => {
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = "#39ff88";
    ctx.textAlign = "center";
    ctx.fillText(t(`booting arena${".".repeat(Math.floor(now * 3) % 4)}`), view.w / 2, view.h / 2);
    ctx.textAlign = "left";
  };
  raf = requestAnimationFrame(frame);

  return Object.assign(result, {
    el,
    update() {
      syncPair(latest);
    },
    onMsg(m: ServerMsg) {
      if (m.t === "snapshot") onSnapshot(m.state);
      if (m.t === "autopsy" && !outro) {
        // nothing was ever shown (reload/reconnect during the autopsy): go straight to it, no outro over a blank arena
        if (!latest) {
          outro = { victory: m.result.victory, at: performance.now() };
          setTimeout(finishOutro, 0);
        } else startOutro(m.result.victory);
      }
    },
    destroy() {
      destroyed = true;
      gone = true;
      stopView3d();
      pair.destroy();
      st3d?.destroy();
      stopPermission();
      cancelAnimationFrame(raf);
      removeEventListener("resize", layout);
      safeProbe.remove();
      document.body.append(muteBtn);
      removeEventListener("keydown", onKey);
      removeEventListener("pointerup", ringUp);
      removeEventListener("pointercancel", ringUp);
      pressRing.remove();
      if (sendIv) clearInterval(sendIv);
      input?.dispose();
      pause.dispose();
      feed?.dispose();
      disposeIntroGenesis();
      quiz?.dispose();
      el.remove();
    },
  });
}
