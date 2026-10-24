// Dev gallery: 24 heroes across all weapons / skills / states, plus lobby portraits.
// Open via vite: /client/render/player/gallery.html  (?scale=3)
import type { HeroDesign, PlayerKit, PlayerState, SkillKind, WeaponKind } from "../../../shared/types.ts";
import { drawPlayer, notePlayerEvents, paintHeroCard } from "./index.ts";
import { drawText } from "./font.ts";

const WEAPONS: WeaponKind[] = ["blade", "blaster", "smg", "shotgun", "cannon", "staff", "laser"];
const SKILLS: SkillKind[] = ["firewall", "fork", "hotfix", "overclock", "rollback"];
const LANGS: [string, string, string][] = [
  ["TypeScript", "#3178c6", "microsoft/typescript"], ["Rust", "#dea584", "rust-lang/rust"], ["Python", "#3572a5", "tiangolo/fastapi"],
  ["Go", "#00add8", "golang/go"], ["C", "#555555", "torvalds/linux"], ["Java", "#b07219", "spring/boot"],
  ["Ruby", "#701516", "rails/rails"], ["JavaScript", "#f1e05a", "facebook/react"], ["Kotlin", "#a97bff", "jetbrains/kotlin"],
  ["C++", "#f34b7d", "godotengine/godot"], ["Swift", "#f05138", "apple/swift"], ["Lua", "#000080", "neovim/neovim"],
];
const TITLES: Record<WeaponKind, string> = {
  blade: "Paladin", blaster: "Ranger", smg: "Gunslinger", shotgun: "Rogue", cannon: "Juggernaut", staff: "Wizard", laser: "Engineer",
};
// Hand-written Gemini-style designs (kit.design) for the last row.
const DESIGNS: [WeaponKind, HeroDesign][] = [
  ["blade", { title: "Borrow-Checker Paladin", archetype: "knight", headgear: "helmet", accessory: "sticker-shield", emblem: "R", palette: ["#dea584", "#7a3b1d", "#ffb36b", "#ff5a36"], catchphrase: "You shall not borrow twice!" }],
  ["staff", { title: "Indent Sorcerer", archetype: "mage", headgear: "wizard-hat", accessory: "rubber-duck", emblem: "PY", palette: ["#3572a5", "#ffd43b", "#f6c193", "#ffe873"], catchphrase: "Whitespace is power." }],
  ["blaster", { title: "Callback Gunslinger", archetype: "ranger", headgear: "cat-ears", accessory: "coffee-mug", emblem: "JS", palette: ["#f1e05a", "#323330", "#ffe0bd", "#ff4fa0"], catchphrase: "undefined is not a function" }],
  ["laser", { title: "Goroutine Engineer", archetype: "engineer", headgear: "beanie", accessory: "jetpack", emblem: "GO", palette: ["#00add8", "#5dc9e2", "#ffd9b8", "#fdd835"], catchphrase: "Don't communicate by sharing memory" }],
  ["shotgun", { title: "Monad Rogue", archetype: "rogue", headgear: "bandana", accessory: "tail", emblem: ">>", palette: ["#5e5086", "#8f4e8b", "#ffe9d6", "#c7f464"], catchphrase: "Pure. Lazy. Deadly." }],
  ["cannon", { title: "Enterprise Juggernaut", archetype: "heavy", headgear: "crown", accessory: "cape", emblem: "J", palette: ["#b07219", "#5382a1", "#4dd0ff", "#f89820"], catchphrase: "AbstractSingletonFactoryBean!" }],
  ["staff", { title: "Paren Hermit", archetype: "mage", headgear: "hood", accessory: "scarf", emblem: "()", palette: ["#3fb68b", "#1d3b2f", "#f2c4a0", "#c2ff6b"], catchphrase: "(((((((((())))))))))" }],
  ["smg", { title: "Pointer Knight", archetype: "knight", headgear: "headphones", accessory: "laptop-backpack", emblem: "*", palette: ["#555555", "#a8b9cc", "#d99a6c", "#00e0ff"], catchphrase: "Segfault? Skill issue." }],
];

const NAMES = ["wilf", "ada", "linus", "grace", "guido", "rob", "dhh", "brendan", "anders", "bjarne", "yukihiro", "ken", "margaret", "dennis", "tim", "evan", "rich", "sindre", "tj", "ryan", "jessie", "sarah", "max", "kai",
  "ferris", "monty", "brendan", "gopher", "haskell", "duke", "mccarthy", "dmr"];

type Behavior = "idle" | "run" | "shoot" | "dash" | "hurt" | "downed" | "revived" | "invuln" | "you";
const STATES: { b: Behavior; buff?: SkillKind }[] = [
  { b: "you" }, { b: "idle" }, { b: "run" }, { b: "shoot" }, { b: "dash" }, { b: "hurt" }, { b: "downed" }, { b: "revived" },
  { b: "idle", buff: "firewall" }, { b: "run", buff: "overclock" }, { b: "idle", buff: "hotfix" }, { b: "idle", buff: "fork" },
  { b: "run", buff: "rollback" }, { b: "shoot" }, { b: "invuln" }, { b: "run" },
  { b: "shoot" }, { b: "idle" }, { b: "hurt" }, { b: "shoot", buff: "firewall" }, { b: "dash" }, { b: "run" }, { b: "shoot" }, { b: "idle" },
  // designed row
  { b: "idle" }, { b: "run" }, { b: "shoot" }, { b: "run" }, { b: "shoot" }, { b: "idle" }, { b: "idle" }, { b: "run" },
];

function kitFor(i: number): PlayerKit {
  const des = i >= 24 ? DESIGNS[(i - 24) % DESIGNS.length] : null;
  const weapon = des ? des[0] : WEAPONS[i % WEAPONS.length];
  const [lang, color, repo] = LANGS[(i * 5) % LANGS.length];
  const seed = (Math.imul(i + 1, 2654435761) ^ 0x5bd1e995) >>> 0;
  return {
    repo, title: `${lang} ${TITLES[weapon]}`, weapon, skill: SKILLS[i % SKILLS.length],
    maxHp: 7, maxArmor: 5, maxEnergy: 200, speed: 90, damageMul: 1,
    palette: ["#172131", color, seed & 1 ? "#ffe2ac" : "#d5f5ff", "#f4faf7"], seed,
    ...(des ? { design: des[1], title: des[1].title, palette: des[1].palette } : {}),
  };
}

const params = new URLSearchParams(location.search);
const SCALE = Number(params.get("scale") || 3);
const COLS = 8, CW = 60, CH = 74;
const W = COLS * CW, H = Math.ceil(STATES.length / COLS) * CH;

const stage = document.getElementById("stage") as HTMLCanvasElement;
stage.width = W * SCALE; stage.height = H * SCALE;
const ctx = stage.getContext("2d")!;

interface Sim { p: PlayerState; b: Behavior; buff?: SkillKind; cx: number; cy: number; label: string }
const only = params.get("only");
const sims: Sim[] = STATES.map((s, i) => {
  const kit = kitFor(i);
  const cx = (i % COLS) * CW + CW / 2, cy = Math.floor(i / COLS) * CH + 46;
  const p: PlayerState = {
    id: "p" + i, name: NAMES[i], x: cx, y: cy, vx: 0, vy: 0, facing: [1, 0.2],
    hp: kit.maxHp, armor: kit.maxArmor, energy: kit.maxEnergy, alive: true, downedFor: 0, reviveProgress: 0,
    skillCd: 0, dashCd: 0, invuln: 0, buffs: s.buff ? [s.buff] : [], kit,
    stats: { damage: 0, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false },
  };
  return { p, b: s.b, buff: s.buff, cx, cy, label: kit.design ? kit.design.headgear + "/" + kit.design.accessory.replace("laptop-", "").replace("sticker-", "") : (s.buff ?? s.b) + "/" + kit.weapon };
});

function step(s: Sim, t: number, dt: number) {
  const p = s.p;
  const ph = Number(p.id.slice(1)) * 0.7;
  p.vx = 0; p.vy = 0;
  if (s.b === "run" || s.b === "you" || (s.buff === "rollback")) {
    const a = t * 1.6 + ph;
    p.x = s.cx + Math.cos(a) * 14; p.y = s.cy + Math.sin(a) * 5;
    p.vx = -Math.sin(a) * 14 * 1.6 * 2.5; p.vy = Math.cos(a) * 5 * 1.6 * 2.5; // exaggerated so run anim reads
    const sp = Math.hypot(p.vx, p.vy) || 1;
    p.facing = [p.vx / sp, p.vy / sp];
  } else if (s.b === "shoot" || s.buff === "firewall") {
    const a = Math.sin(t * 0.9 + ph) * 2.2;
    p.facing = [Math.cos(a), Math.sin(a)];
    if ((t + ph) % 0.25 < dt) p.energy -= 3;
    if (p.energy < 20) p.energy = 200;
  } else {
    p.facing = [Math.sin(t * 0.5 + ph) > 0 ? 1 : -1, 0.3];
  }
  if (s.b === "dash") {
    const c = (t + ph) % 1.6;
    p.dashCd = Math.max(0, 1 - c);
    if (c < 0.2) { const dir = Math.floor((t + ph) / 1.6) % 2 ? -1 : 1; p.vx = 260 * dir; p.x = s.cx - 20 * dir + (c / 0.2) * 40 * dir; p.facing = [dir, 0]; p.invuln = 0.2 - c; }
    else { p.x = s.cx + (Math.floor((t + ph) / 1.6) % 2 ? -20 : 20); p.invuln = 0; }
  }
  if (s.b === "hurt" && (t + ph) % 1.3 < dt) {
    if (p.armor > 0) p.armor -= 1; else p.hp -= 1;
    if (p.hp <= 1) { p.hp = 7; p.armor = 5; }
  }
  if (s.b === "downed") { p.alive = false; p.reviveProgress = ((t + ph) % 4) / 4; p.downedFor = t; }
  if (s.b === "revived") { const c = (t + ph) % 4; p.alive = c > 2.2; p.reviveProgress = p.alive ? 0 : Math.max(0, (c - 0.6) / 1.6); p.invuln = p.alive ? Math.max(0, 3.2 - c) : 0; }
  if (s.b === "invuln") p.invuln = 1;
  if (s.buff) {
    // re-trigger buff periodically so the cast callout & intro FX show
    const c = (t + ph) % 5;
    p.buffs = c < 4.2 ? [s.buff] : [];
    if (s.buff === "rollback") p.x += c < 1.5 ? -22 : -22 * Math.max(0, 1 - (c - 1.5) * 2); // blink back
  }
}

if (only !== null) {
  const keep = only.split(",").map(Number);
  const sel = sims.filter((_, i) => keep.includes(i));
  sims.length = 0;
  sel.forEach((s, j) => { const dx = (j % COLS) * CW + CW / 2 - s.cx, dy = Math.floor(j / COLS) * CH + 46 - s.cy; s.cx += dx; s.cy += dy; s.p.x += dx; s.p.y += dy; sims.push(s); });
  stage.height = Math.ceil(sims.length / COLS) * CH * SCALE;
}

function drawBg() {
  ctx.fillStyle = "#17121f";
  ctx.fillRect(0, 0, W, stage.height / SCALE);
  for (let i = 0; i < sims.length; i++) {
    const x0 = (i % COLS) * CW, y0 = Math.floor(i / COLS) * CH;
    ctx.fillStyle = (i + Math.floor(i / COLS)) % 2 ? "#1d1728" : "#1a1524";
    ctx.fillRect(x0, y0, CW, CH);
    ctx.fillStyle = "#251d35";
    for (let x = x0 + 4; x < x0 + CW; x += 8) ctx.fillRect(x, y0 + CH - 2, 4, 1);
    drawText(ctx, sims[i].label, x0 + 2, y0 + CH - 9, "#6f6590", "left", "");
  }
}

const portraitsEl = document.getElementById("portraits")!;
const cards: { cv: HTMLCanvasElement; kit: PlayerKit; size: number }[] = [];
for (let i = 0; i < 22; i++) {
  const kit = kitFor(i < 8 ? 24 + i : i - 8);
  const size = i < 15 ? 96 : 64;
  const div = document.createElement("div");
  div.className = "card";
  const cv = document.createElement("canvas");
  cv.width = size; cv.height = size;
  div.appendChild(cv);
  const lab = document.createElement("div");
  lab.textContent = kit.title;
  div.appendChild(lab);
  portraitsEl.appendChild(div);
  cards.push({ cv, kit, size });
}

// ---------------------------------------------------------------- ?arena=1 : in-context scene at game scale
type ArenaMod = { drawArenaBackground?: (ctx: CanvasRenderingContext2D, theme: string, seed: number, time: number) => void; drawPostFx?: (ctx: CanvasRenderingContext2D, time: number, shake: number) => void };
const arenaMods = import.meta.glob("../arena/index.ts");
async function arenaScene() {
  document.querySelectorAll("h2, #portraits").forEach((e) => ((e as HTMLElement).style.display = "none"));
  let A: ArenaMod = {};
  const loader = Object.values(arenaMods)[0];
  if (loader) A = (await loader().catch(() => ({}))) as ArenaMod;
  const AW = 480, AH = 288;
  stage.width = AW * SCALE; stage.height = AH * SCALE;
  const team = [24, 25, 26, 27, 28, 29, 30, 31].map((k, j) => {
    const kit = kitFor(k);
    const p: PlayerState = {
      id: "a" + j, name: NAMES[k], x: 0, y: 0, vx: 0, vy: 0, facing: [1, 0], hp: 7, armor: 5, energy: 200, alive: true,
      downedFor: 0, reviveProgress: 0, skillCd: 0, dashCd: 0, invuln: 0, buffs: [], kit,
      stats: { damage: 0, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false },
    };
    return p;
  });
  const theme = params.get("theme") || "web";
  const boss = { x: 360, y: 130 };
  let lastA = performance.now() / 1000;
  const loop = () => {
    const t = performance.now() / 1000;
    const dt = Math.min(0.05, t - lastA); lastA = t;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (A.drawArenaBackground) A.drawArenaBackground(ctx, theme, 1234, t);
    else { ctx.fillStyle = "#1b1626"; ctx.fillRect(0, 0, AW, AH); ctx.fillStyle = "#231c33"; for (let x = 0; x < AW; x += 16) for (let y = 0; y < AH; y += 16) if (((x + y) / 16) % 2) ctx.fillRect(x, y, 16, 16); }
    // stand-in boss marker
    ctx.fillStyle = "#3a1030"; ctx.beginPath(); ctx.arc(boss.x, boss.y, 40, 0, Math.PI * 2); ctx.fill();
    team.forEach((p, j) => {
      const a = t * 0.5 + j * 0.8;
      const tx = 150 + Math.cos(a) * 90 + Math.sin(t * 0.3 + j) * 20, ty = 150 + Math.sin(a * 1.3) * 90;
      p.vx = (tx - p.x) * 3; p.vy = (ty - p.y) * 3;
      if (!p.x) { p.x = tx; p.y = ty; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const ax = boss.x - p.x, ay = boss.y - p.y, al = Math.hypot(ax, ay);
      p.facing = [ax / al, ay / al];
      if ((t * 4 + j) % 1 < dt * 4) p.energy -= 2;
      if (p.energy < 50) p.energy = 200;
      const c = (t + j * 1.7) % 12;
      p.buffs = c < 3 ? [p.kit.skill] : [];
      if ((t + j) % 5 < dt) p.dashCd = 1.7; else p.dashCd = Math.max(0, p.dashCd - dt);
      if ((t + j * 2.3) % 4 < dt) { if (p.armor > 0) p.armor--; else p.hp--; p.invuln = 0.65; } else p.invuln = Math.max(0, p.invuln - dt);
      if (p.hp <= 2) { p.hp = 7; p.armor = 5; }
      p.alive = !(j === 5 && (t % 10) > 6);
      p.reviveProgress = p.alive ? 0 : ((t % 10) - 6) / 4;
    });
    [...team].sort((a, b) => a.y - b.y).forEach((p) => drawPlayer(ctx, p, t, p.id === "a0"));
    A.drawPostFx?.(ctx, t, 0);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- ?strip=1 : deterministic filmstrips of transient FX
function stripScene() {
  document.querySelectorAll("h2, #portraits").forEach((e) => ((e as HTMLElement).style.display = "none"));
  const OFFS = [-0.1, 0.02, 0.05, 0.09, 0.14, 0.2, 0.3, 0.45, 0.7, 1.0];
  const EVENTS = ["hurt-armor", "hurt-hp", "dash", "downed", "revive", "firewall", "overclock", "hotfix", "rollback", "fork", "shoot-blade", "shoot-cannon"];
  const SW2 = 48, SH2 = 56;
  stage.width = OFFS.length * SW2 * SCALE; stage.height = EVENTS.length * SH2 * SCALE;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#17121f"; ctx.fillRect(0, 0, stage.width, stage.height);
  const scratch = document.createElement("canvas").getContext("2d")!;
  EVENTS.forEach((ev, row) => {
    OFFS.forEach((off, col) => {
      const kit = kitFor(ev === "shoot-blade" ? 7 : ev === "shoot-cannon" ? 4 : row * 3 + 1);
      const cx = col * SW2 + SW2 / 2, cy = row * SH2 + 34;
      const p: PlayerState = {
        id: `s${row}_${col}`, name: ev.slice(0, 8), x: cx, y: cy, vx: 0, vy: 0, facing: [1, 0.15], hp: 7, armor: 5, energy: 200,
        alive: ev !== "revive", downedFor: 0, reviveProgress: ev === "revive" ? 0.9 : 0, skillCd: 0, dashCd: 0, invuln: 0, buffs: [], kit,
        stats: { damage: 0, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false },
      };
      const T0 = 1, tEnd = T0 + off;
      for (let t = 0; t <= tEnd + 1e-6; t += 1 / 60) {
        const after = t >= T0;
        if (ev === "hurt-armor" && after && p.armor === 5) p.armor = 4;
        if (ev === "hurt-hp") {
          p.armor = 0;
          if (after && p.hp === 7) {
            p.hp = 6;
            notePlayerEvents([{ type: "hit", target: p.id, amount: 1, x: p.x, y: p.y, crit: true, direction: [-1, 0], impact: 1 }]);
          }
        }
        if (ev === "dash") {
          if (after && p.dashCd === 0) p.dashCd = 1.7;
          const dashing = after && t - T0 < 0.19;
          p.vx = dashing ? 200 : 0;
          p.x = cx - 14 + Math.min(Math.max(0, t - T0), 0.19) * 150;
          p.invuln = dashing ? 0.2 : 0;
        }
        if (ev === "downed" && after) p.alive = false;
        if (ev === "revive" && after) { p.alive = true; p.reviveProgress = 0; p.invuln = 2 - (t - T0); }
        if (["firewall", "overclock", "hotfix", "rollback", "fork"].includes(ev) && after) {
          p.buffs = [ev];
          if (ev === "rollback") p.x = cx - 16;
          if (ev === "fork") { p.x = cx + Math.min(14, (t - T0) * 40); p.vx = t - T0 < 0.35 ? 40 : 0; }
          if (ev === "overclock") p.vx = 60;
        }
        if (ev.startsWith("shoot") && after && Math.abs(t - T0) < 1 / 120) p.energy -= 5;
        const last = t + 1 / 60 > tEnd + 1e-6;
        drawPlayer(last ? ctx : scratch, p, t, false);
      }
      drawText(ctx, (off > 0 ? "+" : "") + Math.round(off * 1000) + "MS", cx, row * SH2 + SH2 - 7, "#6f6590");
    });
  });
}

let last = performance.now() / 1000;
const fixedT = params.get("t");
function frame() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - last);
  last = now;
  const t = fixedT ? Number(fixedT) : now;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawBg();
  const order = [...sims].sort((a, b) => a.p.y - b.p.y);
  for (const s of sims) step(s, now, dt);
  for (const s of order) drawPlayer(ctx, s.p, t, s.b === "you");
  for (const c of cards) {
    const g = c.cv.getContext("2d")!;
    void g;
    const ci = cards.indexOf(c);
    const fixedAge = params.get("age");
    paintHeroCard(c.cv, c.kit, now, fixedAge !== null ? Number(fixedAge) + ci * 0.08 : (now + ci * 0.37) % 4);
  }
  if (!fixedT) if (params.get("arena")) arenaScene();
else if (params.get("strip")) stripScene();
else requestAnimationFrame(frame);
}
if (params.get("arena")) arenaScene();
else if (params.get("strip")) stripScene();
else requestAnimationFrame(frame);
