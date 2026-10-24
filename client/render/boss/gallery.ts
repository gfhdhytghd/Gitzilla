// Dev gallery for boss + arena renderers.
//   ?mode=live (default)  real sim/match.ts with simple bots   &boss=<idx|slug> &players=4 &scale=3 &fast=1 &design=0
//   ?mode=grid            one panel per theme, staged bullets/hazards/minions  &phase=2|3 &scale=1
//   ?mode=portraits       bossPortrait() for every fallback (with + without design)
import type { ArenaTheme, BossDesign, BossKit, BossState, Bullet, GameEvent, Hazard, InputFrame, MatchState, Minion, PlayerKit, PlayerState, RepoProfile } from "../../../shared/types.ts";
import { ARENA_H, ARENA_W } from "../../../shared/types.ts";
import { bossKitFromProfile, bossRegions, createMatch, playerKitFromProfile } from "../../../sim/index.ts";
import { kaijuAnchors } from "../../../shared/kaiju-anatomy.ts";
import { drawBoss, bossLookAt, bossPortrait, bossLayout } from "./index.ts";
import { drawArenaBackground, drawBullets, drawEvents, drawHazards, drawMinions, drawObstacles, drawPerkPads, drawPickups, drawPostFx, getFxCues, trackPlayers } from "../arena/index.ts";
import type { Obstacle, PerkOffer, Pickup } from "../../../shared/types.ts";

const profiles = Object.values(import.meta.glob("/data/fallback/*.json", { eager: true, import: "default" })) as RepoProfile[];
const designs = import.meta.glob("/data/design/*.boss.json", { eager: true, import: "default" }) as Record<string, BossDesign>;
const players = import.meta.glob("/client/render/player/index.ts", { eager: true }) as Record<string, { drawPlayer?: (ctx: CanvasRenderingContext2D, p: PlayerState, t: number, you: boolean) => void }>;
const drawPlayerMod = Object.values(players)[0]?.drawPlayer;

const q = new URLSearchParams(location.search);
const mode = q.get("mode") ?? "live";
const THEMES: ArenaTheme[] = ["terminal", "kernel", "web", "notebook", "enterprise", "legacy"];

function designFor(p: RepoProfile): BossDesign | undefined {
  const key = "/data/design/" + p.slug.replace("/", "__") + ".boss.json";
  return designs[key];
}

function kitFor(p: RepoProfile, n: number, useDesign = q.get("design") !== "0"): BossKit {
  let kit = bossKitFromProfile(p, n);
  const d = useDesign ? designFor(p) : undefined;
  if (d) {
    const dd = d;
    kit = { ...kit, design: dd, name: dd.name, palette: [...dd.palette], theme: dd.theme, attacks: kit.attacks.map((a) => ({ ...a, name: dd.attackNames[a.id] || a.name })) };
  }
  if (q.get("theme")) kit = { ...kit, theme: q.get("theme") as ArenaTheme };
  if (q.get("body")) kit = { ...kit, forceBody: q.get("body") } as BossKit;
  if (!kit.code?.heartLines?.length && q.get("code") !== "0") kit = { ...kit, code: fakeCode(p, kit) };
  if (q.get("fragile")) kit = { ...kit, limbs: kit.limbs.map((l, i) => ({ ...l, fragile: i % 3 === 0 || l.fragile, maintainers: i % 3 === 0 ? 1 : l.maintainers, parasites: i === 1 ? [{ id: "GHSA-xxxx-1234", pkg: "lodash", ecosystem: "npm", summary: "prototype pollution", fixed: "4.17.21" }, { id: "CVE-2024-0001", pkg: "regex", ecosystem: "crates.io", summary: "ReDoS" }] : l.parasites })) };
  return kit;
}

// Dev-only stand-in until analysis/ ships CodeDNA: plausible lines built from the profile.
function fakeCode(p: RepoProfile, kit: BossKit): NonNullable<BossKit["code"]> {
  const comps = p.components.map((c) => c.name.split("/").pop() || c.name);
  const py = p.primaryLanguage === "Python";
  const fn = (n: string) => (py ? `def ${n}(self, *args):` : `export function ${n}(opts) {`);
  return {
    heartLines: [fn("dispatch_request"), "    rv = self.view_functions[rule]", "    return self.make_response(rv)", "if not self._got_first_request:", "    raise AssertionError(msg)", "ctx = self.request_context(environ)", "with ctx: return self.wsgi_app()", "# TODO: remove in 3.0"],
    snippets: [fn("handle_exception"), "return cls(*args, **kwargs)", "except Exception as e: raise", "for k, v in sorted(items):"],
    todos: ["TODO: deprecate this", "FIXME: race on reload", "HACK: monkeypatch werkzeug", "XXX: why does this work", "TODO: typing"],
    commits: ["fix: flaky test", "bump deps"],
    tokens: py ? ["def", "self", "if", ":", "**", "None", "->", "@"] : ["=>", "{}", "fn", ";", "&&", "??", "let"],
    limbSymbols: Object.fromEntries(kit.limbs.map((l, i) => [l.id, [comps[i] + "()", "Blueprint", "url_for", "jsonify"].slice(0, 2 + (i % 3))])),
  };
}

function pickProfile(): RepoProfile {
  const b = q.get("boss") ?? "0";
  return profiles.find((p) => p.slug.includes(b)) ?? profiles[Number(b) % profiles.length] ?? profiles[0];
}

function nav() {
  const el = document.getElementById("nav")!;
  const links: [string, string][] = [["live", "?mode=live"], ["grid", "?mode=grid"], ["grid p3", "?mode=grid&phase=3"], ["portraits", "?mode=portraits"], ["bodies", "?mode=bodies"], ["fx", "?mode=fx"], ["pvp", "?mode=pvp"]];
  profiles.forEach((p, i) => links.push([p.slug.split("/")[1], "?mode=live&boss=" + i]));
  el.innerHTML = links.map(([t, h]) => `<a href="${h}">${t}</a>`).join("");
}

// &portrait=1 simulates claude-ui's phone camera: 390x490 CSS viewport at the page DPR, height-fit integer scale.
const PORTRAIT = q.get("portrait") === "1";
const PORT_CSS = [430, 960];
const RES1 = q.get("res1") === "1";
let camX = 0;

function makeStage(scale: number, label?: string): CanvasRenderingContext2D {
  const cell = document.createElement("div");
  cell.className = "cell";
  const c = document.createElement("canvas");
  if (PORTRAIT && RES1) {
    // claude-ui style: 1 canvas px per logical px, upscaled by CSS
    const css = PORT_CSS[1] / ARENA_H;
    c.width = Math.floor(PORT_CSS[0] / css); c.height = ARENA_H;
    c.style.width = Math.round(c.width * css) + "px"; c.style.height = PORT_CSS[1] + "px";
  } else if (PORTRAIT) {
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(PORT_CSS[0] * dpr); c.height = Math.round(PORT_CSS[1] * dpr);
    c.style.width = PORT_CSS[0] + "px"; c.style.height = PORT_CSS[1] + "px";
  } else { c.width = ARENA_W * scale; c.height = ARENA_H * scale; }
  cell.appendChild(c);
  if (label) { const s = document.createElement("span"); s.textContent = label; cell.appendChild(s); }
  document.getElementById("wrap")!.appendChild(cell);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

// ---------------- live: real sim ----------------
function live() {
  const scale = Number(q.get("scale") ?? 2);
  const n = Number(q.get("players") ?? 4);
  const prof = pickProfile();
  let boss = kitFor(prof, n);
  if (q.get("fast")) boss = { ...boss, maxHp: Math.round(boss.maxHp / 4), limbs: boss.limbs.map((l) => ({ ...l, maxHp: Math.round(l.maxHp / 4) })) };
  const BL = bossLayout(boss);
  document.getElementById("title")!.textContent = `$ gitzilla --live ${prof.slug} :: ${boss.name} [${BL.body}${BL.kaiju ? " hint:" + BL.kaiju.hint : ""}] theme=${boss.theme}`;
  const roster = Array.from({ length: n }, (_, i) => {
    const pp = profiles[(i * 3 + 1) % profiles.length];
    const kit: PlayerKit = playerKitFromProfile(pp);
    return { id: "p" + i, name: pp.slug.split("/")[1], kit };
  });
  let match = createMatch(roster, boss);
  const ctx = makeStage(scale);
  const bots = roster.map((r, i) => bot(i));
  let last = performance.now() / 1000, acc = 0, state: MatchState = match.snapshot(), pending: GameEvent[] = [];
  let endAt = 0;
  function frame() {
    const now = performance.now() / 1000;
    acc += Math.min(0.1, now - last); last = now;
    while (acc >= 1 / 30) {
      const inputs = new Map<string, InputFrame>();
      for (let i = 0; i < roster.length; i++) inputs.set(roster[i].id, bots[i](state, state.players[i]));
      match.step(1 / 30, inputs);
      state = match.snapshot();
      pending = pending.concat(state.events);
      acc -= 1 / 30;
    }
    if (match.over && !endAt) endAt = now;
    if (endAt && now - endAt > 9) { match = createMatch(roster, boss); state = match.snapshot(); endAt = 0; }
    render(ctx, scale, state, pending, now);
    pending = [];
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function bot(i: number) {
  let seq = 0, dashT = 0, ang = i * 1.7;
  return (s: MatchState, p: PlayerState): InputFrame => {
    const b = s.boss!;
    ang += 0.012 * (i % 2 ? 1 : -1);
    const want = 110 + (i % 3) * 20;
    const tx = b.x + Math.cos(ang) * want, ty = b.y + Math.sin(ang) * want * 0.7;
    let mx = tx - p.x, my = ty - p.y;
    // dodge nearest boss bullet
    for (const bl of s.bullets) if (bl.owner === "boss" && Math.hypot(bl.x - p.x, bl.y - p.y) < 22) { mx += (p.y - bl.y) * 3; my -= (p.x - bl.x) * 3; }
    const down = s.players.find((o) => !o.alive);
    if (down && p.alive) { mx = down.x - p.x; my = down.y - p.y; }
    const l = Math.hypot(mx, my) || 1;
    const k = Math.min(1, l / 20);
    dashT -= 1 / 30;
    const dash = dashT <= 0 && Math.random() < 0.01;
    if (dash) dashT = 2;
    return { seq: seq++, move: [(mx / l) * k, (my / l) * k], aim: null, fire: true, dash, skill: Math.random() < 0.004, source: "keyboard" };
  };
}

function render(ctx: CanvasRenderingContext2D, scale: number, s: MatchState, events: GameEvent[], time: number) {
  const cues = getFxCues();
  const sh = cues.shake;
  let view: { x: number; y: number; w: number; h: number } | undefined;
  if (PORTRAIT) {
    const c = ctx.canvas;
    scale = Math.max(1, Math.floor(c.height / ARENA_H));
    const vw = c.width / scale;
    const me = s.players[0];
    const focusX = q.get("follow") === "boss" && s.boss ? s.boss.x - 10 : me ? me.x : 0;
    camX += (focusX - vw / 2 - camX) * 0.15;
    camX = Math.max(0, Math.min(ARENA_W - vw, camX));
    view = { x: camX, y: 0, w: vw, h: ARENA_H };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
  }
  const ox = Math.round((Math.random() - 0.5) * sh) * scale, oy = Math.round((Math.random() - 0.5) * sh) * scale;
  ctx.setTransform(scale, 0, 0, scale, ox - Math.round((view?.x ?? 0) * scale), oy + (PORTRAIT ? Math.floor((ctx.canvas.height - ARENA_H * scale) / 2) : 0));
  if (!PORTRAIT) { ctx.fillStyle = "#000"; ctx.fillRect(-10, -10, ARENA_W + 20, ARENA_H + 20); }
  drawArenaBackground(ctx, s.boss!.kit.theme, s.boss!.kit.seed, time);
  drawPerkPads(ctx, s.perkOffer ?? null, s.players, time);
  drawHazards(ctx, s.hazards, time);
  drawObstacles(ctx, s.obstacles ?? [], time);
  drawPickups(ctx, s.pickups ?? [], time);
  drawMinions(ctx, s.minions, time);
  const target = s.players.find((p) => p.id === s.boss!.targetPlayer);
  if (target) bossLookAt(target.x, target.y);
  trackPlayers(s.players);
  // y-sort boss + players
  const actors: { y: number; draw: () => void }[] = [{ y: s.boss!.y + 30, draw: () => drawBoss(ctx, s.boss!, time) }];
  for (const p of s.players) actors.push({ y: p.y, draw: () => (drawPlayerMod ? drawPlayerMod(ctx, p, time, p.id === "p0") : stubPlayer(ctx, p)) });
  actors.sort((a, b) => a.y - b.y).forEach((a) => a.draw());
  drawBullets(ctx, s.bullets, time);
  drawEvents(ctx, events, time, view);
  drawPostFx(ctx, time, sh, view);
}

function stubPlayer(ctx: CanvasRenderingContext2D, p: PlayerState) {
  ctx.fillStyle = "#000"; ctx.fillRect(Math.round(p.x) - 5, Math.round(p.y) - 9, 10, 14);
  ctx.fillStyle = p.alive ? p.kit.palette[1] ?? "#6cf" : "#666"; ctx.fillRect(Math.round(p.x) - 4, Math.round(p.y) - 8, 8, 12);
}

// ---------------- grid: staged scenes per theme ----------------
function grid() {
  const scale = Number(q.get("scale") ?? 1);
  const phase = Number(q.get("phase") ?? 1) as 1 | 2 | 3;
  const themes = q.get("one") ? [(q.get("theme") as ArenaTheme) ?? "terminal"] : THEMES;
  const scenes = themes.map((theme, i) => {
    const prof = q.get("boss") ? pickProfile() : profiles[(i * 2 + Number(q.get("offset") ?? 0)) % profiles.length];
    const kit = { ...kitFor(prof, 4), theme };
    const GL = bossLayout(kit);
    const ctx = makeStage(scale, `${theme} :: ${prof.slug} [${GL.body}${GL.kaiju ? " hint:" + GL.kaiju.hint : ""}]`);
    return { ctx, kit, i };
  });
  function frame() {
    const time = performance.now() / 1000;
    for (const sc of scenes) renderStaged(sc.ctx, scale, sc.kit, time + sc.i * 0.7, phase, sc.i);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function stagedState(kit: BossKit, time: number, phase: 1 | 2 | 3, idx: number): MatchState {
  const x = 300 + Math.sin(time * 0.3) * 20, y = 140 + Math.cos(time * 0.4) * 10;
  const broken = (q.get("broken") ?? (phase === 3 ? "0,2" : "")).split(",").filter(Boolean).map(Number);
  const casting = q.get("cast") === "1" || (time % 4) < 1.2;
  const forcedKind = q.get("atk");
  let atk = kit.attacks[Math.floor(time / 4) % kit.attacks.length];
  if (forcedKind) {
    atk = kit.attacks.find((a) => a.kind === forcedKind) ?? { ...kit.attacks[0], id: "fake-" + forcedKind, kind: forcedKind as BossKit["attacks"][number]["kind"] };
    if (!kit.attacks.includes(atk)) kit.attacks.push(atk);
  }
  const b: BossState = {
    x, y, hp: kit.maxHp * (phase === 1 ? 0.8 : phase === 2 ? 0.4 : 0.1), maxHp: kit.maxHp, phase,
    limbs: kit.limbs.map((l, i) => ({ id: l.id, hp: broken.includes(i) ? 0 : l.maxHp, maxHp: l.maxHp, broken: broken.includes(i) })),
    casting: casting && atk ? { attackId: atk.id, t: (time % 4), total: 1.2, target: [110, 200] } : null,
    targetPlayer: "p0", enraged: phase >= 2, regions: [], kit,
  };
  b.regions = bossRegions(b);
  const bullets: Bullet[] = [];
  const ringT = (time % 3) / 3;
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + idx;
    const d = 24 + ringT * 220;
    bullets.push({ id: k, owner: "boss", kind: idx % 2 ? "ring" : "spiral", x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a), vy: Math.sin(a), r: 3 });
  }
  const kinds = ["blaster", "smg", "shotgun", "cannon", "staff", "laser", "blade"];
  for (let k = 0; k < 7; k++) {
    const sx = 70 + k * 12, sy = 210 - k * 6;
    const f = ((time * 1.3 + k * 0.17) % 1);
    bullets.push({ id: 100 + k, owner: "p" + k, kind: kinds[k], x: sx + (x - sx) * f, y: sy + (y - sy) * f, vx: x - sx, vy: y - sy, r: 3 });
  }
  const hz: Hazard[] = [
    { id: 1, kind: "slam", x: 120, y: 90, r: 30, angle: 0, t: (time % 2), total: 1.6, armed: (time % 2) > 1.15 },
    forcedKind === "laser"
      ? { id: 2 + Math.floor(time / 4) * 1000, kind: "laser", x: x + kaijuAnchors(kit).mouth.dx, y: y + kaijuAnchors(kit).mouth.dy, r: 7, angle: Math.PI - 0.15, t: (time % 4), total: 1.95, armed: (time % 4) > 1.2 }
      : { id: 2, kind: "laser", x, y, r: 7, angle: 2.6 + Math.sin(time * 0.2) * 0.2, t: (time % 2.2), total: 1.8, armed: (time % 2.2) > 1.05 },
    { id: 3, kind: "firewall", x: 90, y: 210, r: 40, angle: 0, t: 1, total: 4, armed: true },
    { id: 4, kind: "cascade", x: 200, y: 240, r: 23, angle: 0, t: 0.3, total: 1.5, armed: false },
    { id: 5, kind: "cascade", x: 260, y: 252, r: 23, angle: 0, t: 0.3, total: 1.5, armed: false },
  ];
  const minions: Minion[] = [0, 1, 2].map((k) => ({ id: 50 + k, x: 160 + Math.cos(time * 0.8 + k * 2) * 40, y: 150 + Math.sin(time * 0.8 + k * 2) * 30, hp: 10, kind: "bug" }));
  const ps: PlayerState[] = [0, 1, 2, 3].map((k) => fakePlayer(k, 90 + k * 30, 200 - (k % 2) * 30));
  const obstacles: Obstacle[] = [
    { id: 900, x: 200, y: 80, w: 34, h: 18, hp: 100 - ((time * 12) % 100), maxHp: 100, label: "src/flask/app.py" },
    { id: 901, x: 400, y: 236, w: 26, h: 16, hp: 60, maxHp: 100, label: "helpers.ts" },
    { id: 902, x: 64, y: 140, w: 18, h: 22, hp: 100, maxHp: 100, label: "lib/main.rs" },
  ];
  const pickups: Pickup[] = [
    { id: 950, kind: "heart", x: 150, y: 120 }, { id: 951, kind: "energy", x: 170, y: 124 }, { id: 952, kind: "armor", x: 190, y: 118 },
    { id: 953, kind: "energy", x: 120 + ((time * 30) % 40), y: 210 },
  ];
  const perkOffer: PerkOffer | null = q.get("perks") ? {
    endsAt: 0, picked: { p1: "pad-b" },
    pads: [
      { id: "pad-a", name: "--force", desc: "+25% damage", x: 110, y: 200, r: 14 },
      { id: "pad-b", name: "pair-programming", desc: "revive 2x faster, revive aura", x: 240, y: 230, r: 14 },
      { id: "pad-c", name: "cache hit", desc: "energy cost -30%", x: 370, y: 200, r: 14 },
    ],
  } : null;
  if (perkOffer) { bullets.length = 0; hz.length = 0; ps[0].x = 110; ps[0].y = 200; ps[1].x = 240; ps[1].y = 232; }
  return { t: time, status: "fighting", mode: "battle", heroScale: 1, pvp: null, players: ps, boss: b, bullets, hazards: hz, minions, events: [], obstacles, pickups, perkOffer };
}

function fakePlayer(k: number, x: number, y: number): PlayerState {
  const kit = playerKitFromProfile(profiles[(k * 3 + 1) % profiles.length]);
  return { id: "p" + k, name: "dev" + k, x, y, vx: 0, vy: 0, facing: [1, 0], hp: kit.maxHp, armor: kit.maxArmor, energy: kit.maxEnergy, alive: true, downedFor: 0, reviveProgress: 0, skillCd: 0, dashCd: 0, invuln: 0, buffs: [], kit, stats: { damage: 0, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false }, perks: [] };
}

const fakeEventsAt = new Map<number, number>();
function renderStaged(ctx: CanvasRenderingContext2D, scale: number, kit: BossKit, time: number, phase: 1 | 2 | 3, idx: number) {
  const s = stagedState(kit, time, phase, idx);
  const ev: GameEvent[] = [];
  const last = fakeEventsAt.get(idx) ?? 0;
  if (time - last > 0.35) {
    fakeEventsAt.set(idx, time);
    const r = s.boss!.regions[Math.floor(Math.random() * s.boss!.regions.length)];
    ev.push({ type: "hit", target: "boss", limb: r.id === "heart" ? undefined : r.id, amount: Math.round(4 + Math.random() * 30), x: r.x, y: r.y, combo: Math.random() < 0.2 ? 3 : undefined });
  }
  render(ctx, scale, s, ev, time);
}

// ---------------- portraits ----------------
function portraits() {
  const wrap = document.getElementById("wrap")!;
  for (const useDesign of [true, false]) for (const p of profiles) {
    const kit = kitFor(p, 4, useDesign);
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.style.background = "#14101e";
    const c = bossPortrait(kit, Number(q.get("size") ?? 168));
    cell.appendChild(c);
    const s = document.createElement("span");
    const L = bossLayout(kit);
    s.textContent = p.slug.split("/")[1] + " :: " + L.body + (L.kaiju ? " (hint: " + L.kaiju.hint + ")" : "") + (useDesign ? "" : " [no design]");
    cell.appendChild(s);
    wrap.appendChild(cell);
  }
}

// scripted FX sequence: limb break -> phase 2 -> phase 3 -> victory (loops every 14 s)
function fxSeq() {
  const scale = Number(q.get("scale") ?? 3);
  const prof = pickProfile();
  const kit = kitFor(prof, 4);
  const ctx = makeStage(scale);
  const t0 = performance.now() / 1000;
  const fired = new Set<string>();
  function frame() {
    const now = performance.now() / 1000;
    const t = (now - t0) % 14;
    if (t < 0.1) fired.clear();
    const phase: 1 | 2 | 3 = t > 6 ? 3 : t > 3 ? 2 : 1;
    const s = stagedState(kit, now, phase, 0);
    s.boss!.limbs.forEach((l, i) => (l.broken = (i === 0 && t > 1.5) || (i === 2 && t > 6)));
    if (t > 9) s.boss!.hp = 0;
    s.bullets = []; s.hazards = s.hazards.filter((h) => h.kind !== "cascade");
    const ev: GameEvent[] = [];
    const fire = (k: string, at: number, e: GameEvent) => { if (t >= at && !fired.has(k)) { fired.add(k); ev.push(e); } };
    fire("lb", 1.5, { type: "limbBroken", limb: kit.limbs[0].id, by: "p0" });
    fire("p2", 3, { type: "phase", phase: 2 });
    fire("p3", 6, { type: "phase", phase: 3 });
    fire("v", 9, { type: "victory" });
    if (Math.random() < 0.3 && t < 9) { const r = s.boss!.regions[Math.floor(Math.random() * s.boss!.regions.length)]; ev.push({ type: "hit", target: "boss", limb: r.id, amount: 5 + Math.round(Math.random() * 30), x: r.x, y: r.y, crit: Math.random() < 0.2 }); }
    render(ctx, scale, s, ev, now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// edu classroom PvP: no boss, N students shooting each other (staged, not the real sim)
function pvp() {
  const scale = Number(q.get("scale") ?? 3);
  const n = Number(q.get("n") ?? 12);
  const ctx = makeStage(scale);
  const ps = Array.from({ length: n }, (_, k) => {
    const p = fakePlayer(k % 4, 60 + ((k * 97) % 360), 50 + ((k * 61) % 200));
    return { ...p, id: "s" + k, name: "student" + k, kit: playerKitFromProfile(profiles[k % profiles.length]) };
  });
  let bullets: Bullet[] = [];
  let id = 1;
  let last = performance.now() / 1000;
  function frame() {
    const time = performance.now() / 1000;
    const dt = Math.min(0.05, time - last); last = time;
    const ev: GameEvent[] = [];
    ps.forEach((p, k) => {
      p.x = 240 + Math.cos(time * 0.3 + k) * (120 + (k % 3) * 40); p.y = 150 + Math.sin(time * 0.4 + k * 1.7) * 90;
      if (Math.random() < 0.06) {
        const t = ps[(k + 1 + Math.floor(Math.random() * (n - 1))) % n];
        const dx = t.x - p.x, dy = t.y - p.y, l = Math.hypot(dx, dy) || 1;
        bullets.push({ id: id++, owner: p.id, kind: p.kit.weapon, x: p.x, y: p.y, vx: (dx / l) * 160, vy: (dy / l) * 160, r: 3 });
      }
    });
    bullets = bullets.filter((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      const hit = ps.find((p) => p.id !== b.owner && Math.hypot(p.x - b.x, p.y - b.y) < 8);
      if (hit) ev.push({ type: "hit", target: hit.id, amount: 3 + Math.round(Math.random() * 12), x: hit.x, y: hit.y, source: b.owner, impact: Math.random() } as GameEvent);
      return !hit && b.x > 0 && b.x < ARENA_W && b.y > 0 && b.y < ARENA_H;
    });
    const s: MatchState = { t: time, status: "fighting", mode: "edu", heroScale: 2, pvp: null, players: ps, boss: null, bullets, hazards: [], minions: [], events: [], obstacles: [], pickups: [], perkOffer: null };
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawArenaBackground(ctx, "notebook", 7, time, "classroom");
    drawObstacles(ctx, s.obstacles, time);
    drawBoss(ctx, null, time);
    trackPlayers(s.players);
    [...s.players].sort((a, b) => a.y - b.y).forEach((p) => (drawPlayerMod ? drawPlayerMod(ctx, p, time, p.id === "s0") : stubPlayer(ctx, p)));
    drawBullets(ctx, s.bullets, time);
    drawEvents(ctx, ev, time);
    drawPostFx(ctx, time, 0);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// all seven weapon kinds firing their code projectiles (check readability at portrait zoom with &portrait=1&res1=1)
function bulletsShow() {
  const scale = Number(q.get("scale") ?? 3);
  const ctx = makeStage(scale);
  const KINDS = ["blaster", "smg", "shotgun", "cannon", "staff", "laser", "blade"] as const;
  const ps = KINDS.map((kind, k) => {
    const base = fakePlayer(k % 4, 30, 40 + k * 34);
    const kit: PlayerKit = { ...base.kit, weapon: kind, code: q.get("real") ? base.kit.code : undefined };
    return { ...base, id: "w" + k, name: kind, kit };
  });
  let bullets: Bullet[] = [];
  let id = 1, last = performance.now() / 1000;
  function frame() {
    const time = performance.now() / 1000;
    const dt = Math.min(0.05, time - last); last = time;
    const ev: GameEvent[] = [];
    ps.forEach((p, k) => {
      if (Math.random() < (p.kit.weapon === "smg" || p.kit.weapon === "laser" ? 0.12 : 0.04)) {
        const sp = p.kit.weapon === "laser" ? 260 : p.kit.weapon === "cannon" ? 70 : 110;
        const spread = p.kit.weapon === "shotgun" ? [-0.25, 0, 0.25] : [0];
        for (const a of spread) bullets.push({ id: id++, owner: p.id, kind: p.kit.weapon, x: p.x + 10, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 3 });
      }
    });
    bullets = bullets.filter((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x > 200 && Math.random() < 0.08) { ev.push({ type: "hit", target: "boss", amount: 5, x: b.x, y: b.y, source: b.owner } as GameEvent); return false; }
      return b.x < 260;
    });
    ctx.setTransform(PORTRAIT && RES1 ? 1 : scale, 0, 0, PORTRAIT && RES1 ? 1 : scale, 0, 0);
    drawArenaBackground(ctx, (q.get("theme") as ArenaTheme) ?? "terminal", 3, time);
    trackPlayers(ps);
    ps.forEach((p) => (drawPlayerMod ? drawPlayerMod(ctx, p, time, false) : stubPlayer(ctx, p)));
    drawBullets(ctx, bullets, time);
    drawEvents(ctx, ev, time);
    drawPostFx(ctx, time, 0);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function bodies() {
  const wrap = document.getElementById("wrap")!;
  const BODIES = ["kaiju", "blob", "serpent", "spider", "hydra", "golem", "swarm", "eye", "tree", "machine"] as const;
  const prof = pickProfile();
  const base = kitFor(prof, 4);
  const d = base.design ?? designFor(profiles[0])!;
  for (const body of BODIES) {
    const kit = { ...base, forceBody: body, design: { ...d, growths: (q.get("growths")?.split(",") as BossDesign["growths"]) ?? d.growths, mouth: (q.get("mouth") as BossDesign["mouth"]) ?? d.mouth } } as BossKit;
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.style.background = "#14101e";
    cell.appendChild(bossPortrait(kit, Number(q.get("size") ?? 352)));
    const s = document.createElement("span");
    s.textContent = body + " / " + kit.design!.mouth + " / " + kit.design!.growths.join("+");
    cell.appendChild(s);
    wrap.appendChild(cell);
  }
}

nav();
if (mode === "bodies") bodies();
else if (mode === "fx") fxSeq();
else if (mode === "pvp") pvp();
else if (mode === "bullets") bulletsShow();
else if (mode === "grid") grid();
else if (mode === "portraits") portraits();
else live();
