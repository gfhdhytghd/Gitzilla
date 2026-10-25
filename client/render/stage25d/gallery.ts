// 3D stage gallery: the real sim (raid with bot heroes, or an 8-bot royale) rendered through createStage25d.
//   ?scene=raid|royale  &boss=<slug> &form=<body plan>  &phone=1 (portrait follow camera)  &scale=<int>  &xr=emulate (IWER headset) &xrmode=vr|ar
// window.__stats = { fps, frameMs, renderMs } for automated checks.
// ?end=victory|defeat &endat=<s> (default 4): freeze the sim then and declare the result (the XR end screen; screen view
//   too with &endscreen=1). window.__continued counts onContinue (a pinch on the ready end screen). &slowend=N plays
//   everything after the end N times slower (frame-by-frame captures of the dissolve on software GL).
// ?hudcheck=1 (with xr=emulate): the XR HUD panel check. The pull() time is frozen (like game.ts while a headset pauses
//   the page rAF) and the boss steps through scripted HP levels / a limb break / phases 2-3; each settled level logs the
//   panel's drawn bar width (read back from its canvas) next to hudInfo() and the 2D bar's numbers: window.__hudCheck.
import type { BossKit, InputFrame, MatchState, PlayerState, RepoProfile } from "../../../shared/types.ts";
import { bossKitFromProfile, createMatch, createPvpController, playerKitFromProfile, pvpArenaSize } from "../../../sim/index.ts";
import { drawPostFx, getFxCues } from "../arena/index.ts";
import { createStage25d } from "./index.ts";
import { kaijuAnchors } from "../../../shared/kaiju-anatomy.ts";
import { HUD_BAR_W, hudInfo } from "./hud.ts";

const q = new URLSearchParams(location.search);
const scene = q.get("scene") ?? "raid";
const phone = q.get("phone") === "1";
const profiles = Object.values(import.meta.glob("/data/fallback/*.json", { eager: true, import: "default" })) as RepoProfile[];
const pick = (s: string | null, i: number) => (s ? profiles.find((p) => p.slug.includes(s)) : undefined) ?? profiles[i % profiles.length];

document.getElementById("nav")!.innerHTML = [["raid", "?scene=raid"], ["raid react", "?scene=raid&boss=react"], ["royale", "?scene=royale"], ["phone raid", "?scene=raid&phone=1"], ["phone royale", "?scene=royale&phone=1"], ["xr (emulated)", "?scene=raid&xr=emulate"]]
  .map(([t, h]) => `<a href="${h}">${t}</a>`).join("");

async function main() {
  if (q.get("xr") === "emulate") {
    // Meta's Immersive Web Emulation Runtime: an emulated headset behind navigator.xr (dev/test only)
    const { XRDevice, metaQuest3 } = await import("iwer");
    const dev = new XRDevice(metaQuest3);
    dev.installRuntime({ forceInstall: true });
    dev.position.set(0, 1.6, 0.4);
    // look down ~15 degrees toward the tabletop (its top sits 0.15 m below eye height)
    const pitch = (-15 * Math.PI) / 180;
    if (q.get("look") !== "ahead") dev.quaternion.set(Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2));
    (globalThis as unknown as { __xrDevice: unknown }).__xrDevice = dev;
  }

  // ---- match ----
  const n = scene === "royale" ? 8 : 4;
  const world = scene === "royale" ? (() => { const s = pvpArenaSize(n); return { w: s.width, h: s.height }; })() : { w: 480, h: 288 };
  const roster = Array.from({ length: n }, (_, i) => {
    const p = profiles[(i * 3 + 1) % profiles.length];
    const kit = playerKitFromProfile(p, scene === "royale" ? { mode: "pvp" } : undefined);
    return { id: (scene === "royale" ? "bot-" : "p") + i, name: p.slug.split("/")[1].slice(0, 10), kit };
  });
  let boss: BossKit | null = scene === "royale" ? null : bossKitFromProfile(pick(q.get("boss"), 0), n);
  if (boss && q.get("form")) boss = { ...boss, forceForm: q.get("form") } as BossKit; // body plan (boss/variety.ts)
  if (boss && q.get("fast")) boss = { ...boss, maxHp: Math.round(boss.maxHp / 4), limbs: boss.limbs.map((l) => ({ ...l, maxHp: Math.round(l.maxHp / 4) })) };
  let match = scene === "royale" ? createMatch(roster, null, { mode: "pvp" }) : createMatch(roster, boss!);
  const bots = roster.map((_, i) => (scene === "royale" ? createPvpController(1000 + i) : raidBot(i)));

  // ---- screen ----
  const scale = Number(q.get("scale") ?? (phone ? 1 : Math.max(1, Math.floor(Math.min(innerWidth / world.w, innerHeight / world.h)))));
  // like game.ts: the stage's WebGL canvas underneath, a transparent 2D overlay (FX, postfx) on top
  const wrap = document.getElementById("wrap")!;
  const box = document.createElement("div");
  box.style.position = "relative";
  wrap.appendChild(box);
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute"; canvas.style.left = "0"; canvas.style.top = "0";
  const ctx = canvas.getContext("2d")!;
  const dpr = devicePixelRatio || 1;
  let vw = world.w, vh = world.h;
  if (phone) { vh = world.h; vw = Math.round(world.h * (innerWidth / innerHeight)); }
  const cssScale = phone ? innerHeight / vh : scale;
  const cssW = Math.round(vw * cssScale), cssH = Math.round(vh * cssScale);
  box.style.width = cssW + "px"; box.style.height = cssH + "px";
  canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);

  let state: MatchState = match.snapshot() as MatchState;
  let pending: MatchState["events"] = [];
  const xrDts: number[] = [], xrUps: number[] = [];
  const stage = createStage25d({ voxelBullets: q.get("voxbul") !== "0", debugOrbit: Number(q.get("orbit") ?? 0), orbitZoom: Number(q.get("zoom") ?? 1), xr: q.get("xr") !== null, voxels: q.get("vox") === "0" ? false : q.get("vox") === "1" ? true : "auto", debugEnding: q.get("endscreen") === "1", onContinue: () => { const g = globalThis as unknown as { __continued?: number }; g.__continued = (g.__continued ?? 0) + 1; }, onXRFrame: (dt, upd) => { xrUps.push(upd); if (xrUps.length > 180) xrUps.shift(); stats.xrUpdateMs = xrUps.reduce((a, b) => a + b, 0) / xrUps.length; xrDts.push(dt); if (xrDts.length > 180) xrDts.shift(); const m = xrDts.reduce((a, b) => a + b, 0) / xrDts.length; stats.xrFrames++; stats.xrFps = 1000 / m; }, pull: () => ({ state: hudCheck ? hudCheck.apply(state) : state, time: hudCheck ? 12.34 : galleryTime(performance.now()), events: pending, extras: extrasFor() }) });
  stage.canvas.style.position = "absolute"; stage.canvas.style.left = "0"; stage.canvas.style.top = "0";
  stage.canvas.style.width = cssW + "px"; stage.canvas.style.height = cssH + "px";
  stage.canvas.style.imageRendering = "pixelated";
  box.append(stage.canvas, canvas);
  stage.resize(cssW, cssH, dpr);
  const extrasFor = () => ({ you: roster[0].id, world, events: pending, shake: getFxCues().shake });

  (globalThis as unknown as { __stage: unknown }).__stage = stage;
  const hudCheck = q.get("hudcheck") ? createHudCheck(stage.debugCanvases.hud) : null;
  (globalThis as unknown as { __dbgPlayers: unknown }).__dbgPlayers = () => state.players.filter((p) => !p.eliminated).map((p) => [p.id, Math.round(p.hp * 10) / 10, +p.invuln.toFixed(2), p.buffs.join("+"), p.alive]);
  if (q.get("atlas")) {
    const dbg = (stage as unknown as { debugCanvases: { atlas: HTMLCanvasElement } }).debugCanvases.atlas;
    Object.assign(dbg.style, { position: "fixed", right: "0", bottom: "0", width: "1024px", zIndex: "5", background: "#203", imageRendering: "pixelated" });
    document.body.appendChild(dbg);
  }
  const enter = document.getElementById("enter")!;
  if (await stage.xrSupported()) {
    enter.style.display = "block";
    enter.onclick = () => {
      if (stage.xrActive) void stage.exitXR().then(() => (enter.textContent = "Enter Vision Pro"));
      else stage.enterXR(q.get("xrmode") === "vr" ? "immersive-vr" : q.get("xrmode") === "ar" ? "immersive-ar" : "auto").then(() => (enter.textContent = "Exit Vision Pro"), (e) => console.error("enterXR failed:", e));
    };
  }

  // ---- loop ----
  const stats = { fps: 0, frameMs: 0, renderMs: 0, frames: 0, xrFrames: 0, xrFps: 0, xrUpdateMs: 0, stageCpuMs: 0 };
  (globalThis as unknown as { __stats: typeof stats }).__stats = stats;
  let last = performance.now(), acc = 0, camX = 0, endAt = 0;
  const intervals: number[] = [], renders: number[] = [], cpus: number[] = [];
  const endKind = q.get("end") as "victory" | "defeat" | null, forceEndMs = Number(q.get("endat") ?? 4) * 1000;
  let started = -1, ended = false, endedMs = 0;
  const slow = Math.max(1, Number(q.get("slowend") ?? 1));
  // the time the stage sees: real time, slowed down after a forced end (&slowend)
  function galleryTime(nowMs: number) { return (ended && slow > 1 ? endedMs + (nowMs - endedMs) / slow : nowMs) / 1000; }
  function step(now: number) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    if (endKind && scene !== "royale") {
      if (started < 0) started = now;
      if (ended) return;
      if (now - started > forceEndMs) {
        // the result is in: freeze the fight as it stood and declare it (with its event, like the server)
        ended = true;
        endedMs = now;
        const s = structuredClone(state) as MatchState;
        s.status = endKind;
        if (endKind === "victory" && s.boss) s.boss.hp = 0;
        if (endKind === "defeat") s.players.forEach((p) => (p.alive = false));
        s.bullets = []; s.hazards = [];
        s.events = [{ type: endKind }];
        pending = pending.concat(s.events);
        state = s;
        return;
      }
    }
    while (acc >= 1 / 30) {
      const inputs = new Map<string, InputFrame>();
      state.players.forEach((p, i) => inputs.set(p.id, bots[i](state, p)));
      match.step(1 / 30, inputs);
      const snap = match.snapshot() as MatchState;
      pending = pending.concat(snap.events);
      state = snap;
      acc -= 1 / 30;
    }
    if (match.over && !endAt) endAt = now;
    if (endAt && now - endAt > 6000) {
      match = scene === "royale" ? createMatch(roster, null, { mode: "pvp" }) : createMatch(roster, boss!);
      state = match.snapshot() as MatchState; endAt = 0;
    }
  }
  function frame(now: number) {
    requestAnimationFrame(frame);
    if (intervals.length > 120) intervals.shift();
    intervals.push(now - (frame as unknown as { t?: number }).t! || 16.7);
    (frame as unknown as { t?: number }).t = now;
    step(now);
    if (stage.xrActive) return;
    const t0 = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = cssScale * dpr;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    let view: { x: number; y: number; w: number; h: number } | undefined;
    if (phone) {
      const me = state.players[0];
      camX += ((me ? me.x - vw / 2 : 0) - camX) * 0.15;
      camX = Math.max(0, Math.min(world.w - vw, camX));
      view = { x: camX, y: 0, w: vw, h: vh };
    }
    const time = galleryTime(now);
    if (q.get("laser") && state.boss && time % 3 < 1) {
      // gallery-only: a synthetic armed laser from the boss's mouth sweeping toward the heroes
      const m = kaijuAnchors(state.boss.kit).mouth;
      const ang = Math.PI - 0.25 + Math.sin(time * 0.8) * 0.25;
      state = { ...state, hazards: [...state.hazards.filter((h) => h.id !== -77), { id: -77, kind: "laser", x: state.boss.x + m.dx, y: state.boss.y + m.dy, r: 7, angle: ang, t: 1.5, total: 2, armed: true }] };
    }
    stage.render(ctx, state, time, view, extrasFor());
    drawPostFx(ctx, time, getFxCues().shake, { x: 0, y: 0, w: vw, h: vh }, { overlay: true });
    pending = [];
    const dt = performance.now() - t0;
    renders.push(dt); if (renders.length > 120) renders.shift();
    cpus.push(stage.cpuMs); if (cpus.length > 120) cpus.shift();
    stats.stageCpuMs = cpus.reduce((x, y) => x + y, 0) / cpus.length;
    stats.frames++;
    stats.frameMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    stats.fps = 1000 / stats.frameMs;
    stats.renderMs = renders.reduce((a, b) => a + b, 0) / renders.length;
    if (stats.frames % 30 === 0) document.getElementById("hud")!.textContent =
      `$ gitzilla --stage3d ${scene}${phone ? " (phone)" : ""}  ${stats.fps.toFixed(1)} fps  frame ${stats.frameMs.toFixed(1)} ms  render ${stats.renderMs.toFixed(1)} ms`;
  }
  requestAnimationFrame(frame);
}

/** ?hudcheck=1: scripted boss HP levels; the panel is read back from its canvas once each level has settled */
function createHudCheck(hud: HTMLCanvasElement) {
  const LEVELS: { name: string; f: number; mut?: (b: NonNullable<MatchState["boss"]>) => void }[] = [
    { name: "full", f: 1 },
    { name: "73%", f: 0.732 },
    { name: "limb break", f: 0.6, mut: (b) => { b.limbs[0].hp = 0; b.limbs[0].broken = true; } },
    { name: "phase 2", f: 0.48, mut: (b) => { b.limbs[0].hp = 0; b.limbs[0].broken = true; b.limbs[1].hp = b.limbs[1].maxHp * 0.3; b.phase = 2; b.enraged = true; } },
    { name: "phase 3", f: 0.12, mut: (b) => { b.limbs[0].hp = 0; b.limbs[0].broken = true; b.phase = 3; b.enraged = true; } },
    { name: "1%", f: 0.004, mut: (b) => { b.phase = 3; b.enraged = true; } },
  ];
  const log: Record<string, unknown>[] = [];
  (globalThis as unknown as { __hudCheck: unknown }).__hudCheck = log;
  let t0 = -1, logged = -1;
  const g = hud.getContext("2d", { willReadFrequently: true })!;
  return {
    apply(s: MatchState): MatchState {
      if (!s.boss) return s;
      const now = performance.now();
      if (t0 < 0) t0 = now;
      const i = Math.min(LEVELS.length - 1, Math.floor((now - t0) / 1500)), L = LEVELS[i];
      const b = { ...s.boss, hp: s.boss.maxHp * L.f, limbs: s.boss.limbs.map((l) => ({ ...l })) };
      L.mut?.(b);
      const out = { ...s, boss: b };
      // settled (>= 0.6 s into the level): read the drawn bar (row 15, x 6..250) and pips back from the panel canvas
      if (i !== logged && now - t0 - i * 1500 > 600) {
        logged = i;
        const info = hudInfo(out).boss!;
        const row = g.getImageData(6, 15, HUD_BAR_W, 1).data;
        let drawn = 0;
        for (let x = 0; x < HUD_BAR_W; x++) if (row[x * 4] > 200 && row[x * 4 + 1] < 100) drawn++;
        const pip = g.getImageData(6, 31, info.pipW, 1).data;
        const brokenDrawn = pip[0] > 200 && pip[1] < 100; // broken pip: red line on grey
        const pct2d = Math.max(0, b.hp / b.maxHp);
        log.push({ level: L.name, hp: Math.round(b.hp), maxHp: b.maxHp, phase: b.phase, twoD: `${Math.ceil(pct2d * 100)}%`, xr: info.pctText,
          expectedPx: info.barPx, drawnPx: drawn, limb0Broken: b.limbs[0].broken, limb0Drawn: brokenDrawn ? "broken" : "intact",
          ok: drawn === info.barPx && brokenDrawn === b.limbs[0].broken && info.pctText === `${Math.ceil(pct2d * 100)}%` });
      }
      return out;
    },
  };
}

function raidBot(i: number) {
  let seq = 0, ang = i * 1.7, dashT = 0;
  return (s: MatchState, p: PlayerState): InputFrame => {
    const b = s.boss;
    if (!b) return { seq: seq++, move: [0, 0], aim: null, fire: true, dash: false, skill: false, source: "keyboard" };
    ang += 0.012 * (i % 2 ? 1 : -1);
    const want = 120 + (i % 3) * 20;
    let mx = b.x + Math.cos(ang) * want - p.x, my = b.y + Math.sin(ang) * want * 0.7 - p.y;
    for (const bl of s.bullets) if (bl.owner === "boss" && Math.hypot(bl.x - p.x, bl.y - p.y) < 22) { mx += (p.y - bl.y) * 3; my -= (p.x - bl.x) * 3; }
    const down = s.players.find((o) => !o.alive);
    if (down && p.alive) { mx = down.x - p.x; my = down.y - p.y; }
    const l = Math.hypot(mx, my) || 1, k = Math.min(1, l / 20);
    dashT -= 1 / 30;
    const dash = dashT <= 0 && Math.random() < 0.01;
    if (dash) dashT = 2;
    return { seq: seq++, move: [(mx / l) * k, (my / l) * k], aim: null, fire: true, dash, skill: Math.random() < 0.004, source: "keyboard" };
  };
}

void main();
