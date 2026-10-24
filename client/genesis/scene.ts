// The Genesis cinematic scene: real repo data -> character, in six visible stages.
//   clone    `$ git clone`: real paths stream in the terminal, a file tile per path pours into the stage
//   parse    tiles snap into real component clusters, import arrows draw, counters tick
//   graph    force-directed settle; heart swells with its fan-in; cycles glow red; deepest chain lights up
//   map      every TraceStep is a glowing wire from the repo fact to the character part it becomes
//   assemble the real sprite builds from falling real-code glyphs that settle into pixels
//   reveal   name card types out; the equal stat budget flows into bars
// Everything is a pure function of the scene time `t` (skip = jump t), plus a small FX particle pool.
import type { BossKit, BossState, Genesis, PlayerKit, TraceStep } from "../../shared/types.ts";
import { drawBoss } from "../render/boss/index.ts";
import { fx as arenaFx } from "../render/arena/fx.ts";
import { textSprite } from "../render/arena/font.ts";
import { drawGlow, disc, ring, line } from "../render/arena/pix.ts";
import { playerPortraitFrame } from "../render/player/index.ts";
import { bezierPts, clamp01, componentOf, cycleEdges, ease, forceLayout, longestChain, rng, type Pt } from "./graph.ts";
import { isBossKit } from "./local.ts";
import { PART_COLOR, UI, brighten, langColor, langOfPath } from "./palette.ts";
import { bossSprite, heroSprite, type CharSprite } from "./sprites.ts";
import type { TextLayer } from "./text.ts";
import { eduGenesisNotes, type EduNote, type EduStage } from "../edu/genesis.ts";
import { GRADE_COLOR, gpa, gpaGrade, sortStats } from "../edu/quality.ts";
import { STAT_LABEL } from "../edu/concepts.ts";

export type StageId = "clone" | "parse" | "graph" | "map" | "assemble" | "reveal";
export const STAGES: StageId[] = ["clone", "parse", "graph", "map", "assemble", "reveal"];
const BASE_DUR: Record<StageId, number> = { clone: 1.25, parse: 1.3, graph: 1.2, map: 2.4, assemble: 1.25, reveal: 1.3 };

export interface Rect { x: number; y: number; w: number; h: number }
export interface Layout {
  W: number; H: number;
  wide: boolean; compact: boolean;
  header: Rect; term: Rect; stage: Rect; langBar: Rect; counters: Rect; graph: Rect; graphMap: Rect; charBox: Rect;
  termLines: number; termSize: number; labelSize: number;
}

interface Tile { path: string; color: string; comp: number; born: number; hx: number; hy: number; ox: number; oy: number; seed: number }
interface Node { name: string; short: string; loc: number; files: number; r: number; heart: boolean }
interface Step extends TraceStep { t0: number; t1: number; color: string; idx: number; comp: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; glyph?: string; g: number }
interface LogLine { t: number; text: string; color: string; dim?: string }

const short = (name: string) => {
  const parts = name.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : name;
};
const kfmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "k" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(Math.round(n)));

export function stageTimes(condensed: boolean, steps: number, edu = false) {
  const k = condensed ? 0.5 : edu ? 1.4 : 1;
  const dur = { ...BASE_DUR };
  dur.map = Math.max(1.4, Math.min(4.2, 0.9 + steps * 0.12));
  if (condensed) dur.map = Math.max(1.1, dur.map * 0.55);
  else if (edu) dur.map *= 1.5;
  const out = {} as Record<StageId, [number, number]>;
  let t = 0;
  for (const s of STAGES) {
    const d = s === "map" ? dur.map : dur[s] * k;
    out[s] = [t, t + d];
    t += d;
  }
  return { at: out, total: t };
}

export class Scene {
  kind: "hero" | "boss";
  g: Genesis;
  kit: PlayerKit | BossKit | null = null;
  sprite: CharSprite | null = null;
  T: ReturnType<typeof stageTimes>;
  tiles: Tile[] = [];
  nodes: Node[] = [];
  cyc: Set<number>;
  chain: number[];
  steps: Step[] = [];
  log: LogLine[] = [];
  langs: { name: string; frac: number; color: string }[];
  codeStream: string;
  L!: Layout;
  private force: Pt[] = [];
  private forceKey = "";
  private parts: Particle[] = [];
  private lastT = -1;
  private fired = new Set<string>();
  shake = 0;
  flash = 0;
  glitch = 0;
  private bossState: BossState | null = null;
  private rainOrder: number[] = [];

  notes: Record<EduStage, EduNote> | null = null;

  constructor(g: Genesis, kit: PlayerKit | BossKit | null, kind: "hero" | "boss", public condensed: boolean, public reduced: boolean, public edu = false) {
    this.kind = kind;
    this.g = g;
    const total = Object.values(g.languages).reduce((s, v) => s + v, 0) || 1;
    this.langs = Object.entries(g.languages).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, v]) => ({ name, frac: v / total, color: langColor(name) }))
      .filter((l) => l.frac > 0.004);
    this.codeStream = (g.snippets.join("  ") || g.slug).replace(/\s+/g, " ");
    this.cyc = cycleEdges(g.components, g.edges, g.cycles);
    this.chain = longestChain(g.components.length, g.edges.filter((_, i) => !this.cyc.has(i)));
    const maxLoc = Math.max(1, ...g.components.map((c) => c.loc));
    const heartComp = componentOf(g.heart, g.components);
    this.nodes = g.components.map((c, i) => ({
      name: c.name, short: short(c.name), loc: c.loc, files: c.files,
      r: 4 + Math.round(Math.sqrt(c.loc / maxLoc) * 9), heart: i === heartComp,
    }));
    if (!this.nodes.length) this.nodes.push({ name: g.slug, short: short(g.slug), loc: 1, files: 1, r: 8, heart: true });
    this.T = stageTimes(condensed, g.trace.length, edu);
    this.buildTiles();
    this.setKit(kit);
  }

  /** Forget fired one-shot FX (seek / screenshots). */
  resetFx() {
    this.parts.length = 0;
    this.fired.clear();
    this.lastT = -1;
    this.shake = this.flash = this.glitch = 0;
  }

  setKit(kit: PlayerKit | BossKit | null) {
    this.kit = kit;
    this.sprite = kit ? (isBossKit(kit) ? bossSprite(kit) : heroSprite(kit, this.edu)) : null;
    if (this.edu) this.notes = eduGenesisNotes(this.g, this.kind, kit && !isBossKit(kit) ? kit.quality : undefined);
    if (kit && isBossKit(kit)) {
      this.bossState = {
        x: 0, y: 0, hp: kit.maxHp, maxHp: kit.maxHp, phase: 1,
        limbs: kit.limbs.map((l) => ({ id: l.id, hp: l.maxHp, maxHp: l.maxHp, broken: false })),
        casting: null, targetPlayer: null, enraged: false, regions: [], kit,
      };
    }
    if (this.sprite) {
      // code rain order: bottom rows first, jittered, so the sprite builds up layer by layer
      const R = rng(this.g.slug.length * 977 + this.sprite.cells.length);
      const cells = this.sprite.cells;
      const maxRow = Math.max(1, ...cells.map((c) => c.row));
      this.rainOrder = cells.map((c) => 1 - c.row / maxRow + R() * 0.35);
    }
    this.buildSteps();
    this.buildLog();
  }

  private buildTiles() {
    const g = this.g;
    const R = rng(g.slug.split("").reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261));
    const comps = g.components;
    const totalFiles = Math.max(1, comps.reduce((s, c) => s + c.files, 0));
    const N = Math.min(96, Math.max(36, g.sampleFiles.length * 2));
    // tiles per component, proportional to files (min 2 each)
    const quota = comps.map((c) => Math.max(2, Math.round((c.files / totalFiles) * N)));
    const paths = g.sampleFiles.length ? g.sampleFiles : comps.map((c) => c.name + "/");
    const [c0, c1] = this.T.at.clone;
    const pour = (c1 - c0) * 0.85;
    let made = 0;
    const take = (comp: number, path: string) => {
      const i = made++;
      this.tiles.push({
        path, color: langColor(langOfPath(path)), comp,
        born: c0 + (i / N) * pour + R() * 0.05,
        hx: R(), hy: R(), ox: R() * 2 - 1, oy: R() * 2 - 1, seed: R(),
      });
    };
    // real paths first (in their component), then fill quotas by reusing that component's real paths
    const byComp: string[][] = comps.map(() => []);
    for (const p of paths) {
      const ci = componentOf(p, comps);
      const target = ci >= 0 ? ci : quota.indexOf(Math.max(...quota));
      byComp[Math.max(0, target)]?.push(p);
      take(Math.max(0, ci >= 0 ? ci : target), p);
    }
    comps.forEach((c, ci) => {
      const have = this.tiles.filter((t) => t.comp === ci).length;
      const pool = byComp[ci].length ? byComp[ci] : [c.name + "/"];
      for (let k = have; k < quota[ci] && made < 110; k++) take(ci, pool[k % pool.length]);
    });
    // shuffle birth order so the pour mixes components like a real clone
    const borns = this.tiles.map((t) => t.born).sort((a, b) => a - b);
    const order = this.tiles.map((_, i) => i).sort(() => R() - 0.5);
    order.forEach((ti, k) => (this.tiles[ti].born = borns[k]));
  }

  private buildSteps() {
    const [m0, m1] = this.T.at.map;
    const trace = this.g.trace;
    // runs of the same part (7 limbs, 8 attacks...) overlap like a volley; a new part gets a full beat
    const w = trace.map((s, i) => (i > 0 && trace[i - 1].part === s.part ? 0.32 : s.part === "name" ? 1.2 : 1));
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    const span = m1 - m0 - 0.2;
    const minD = this.condensed ? 0.3 : 0.5;
    let t = m0 + 0.1;
    this.steps = trace.map((s, i) => {
      const slot = (w[i] / sum) * span;
      const d = Math.max(slot, Math.min(minD, (m1 - t) * 0.9));
      const st: Step = { ...s, t0: t, t1: Math.min(m1, t + d), color: PART_COLOR[s.part] ?? UI.green, idx: i, comp: this.resolveComp(s) };
      t += slot;
      return st;
    });
  }

  /** Component index a trace step talks about: ref = component name, limb id, attack id or file; else the name in `from`. */
  private resolveComp(s: TraceStep): number {
    const names = this.nodes.map((n) => n.name);
    const kit = this.kit && isBossKit(this.kit) ? this.kit : null;
    if (s.ref) {
      let i = names.indexOf(s.ref);
      if (i >= 0) return i;
      const limb = kit?.limbs.find((l) => l.id === s.ref);
      if (limb && (i = names.indexOf(limb.component)) >= 0) return i;
      const atk = kit?.attacks.find((a) => a.id === s.ref);
      if (atk && (i = names.indexOf(atk.source)) >= 0) return i;
      if (s.ref.includes("/") || s.ref.includes(".")) { i = componentOf(s.ref, this.g.components); if (i >= 0) return i; }
    }
    if (!["limb", "weakpoint", "attack", "heart"].includes(s.part)) return -1;
    const head = s.from.split(" · ")[0].replace(/…$/, "").trim();
    if (!head) return -1;
    let best = -1;
    names.forEach((n, i) => { if (n === head || (head.length >= 6 && n.startsWith(head)) || n.split("/").pop() === head) best = best < 0 ? i : best; });
    return best;
  }

  private buildLog() {
    const g = this.g, T = this.T.at;
    const log: LogLine[] = [];
    const add = (t: number, text: string, color: string = UI.text, dim?: string) => log.push({ t, text, color, dim });
    const name = g.slug.split("/").pop() || g.slug;
    add(T.clone[0], `$ git clone github.com/${g.slug}`, UI.green);
    add(T.clone[0] + 0.12, `Cloning into '${name}'...`, UI.dim);
    const shown = this.tiles.filter((t) => !t.path.endsWith("/")).sort((a, b) => a.born - b.born).slice(0, 28);
    shown.forEach((t) => add(t.born, `  ${t.path}`, brighten(t.color, 0.25)));
    add(T.clone[1] - 0.1, `Receiving objects: 100% (${kfmt(g.metrics.files)} files, ${kfmt(g.metrics.loc)} loc)`, UI.text);
    add(T.parse[0], "$ gitzilla parse --imports", UI.green);
    const comps = g.components.slice(0, 8);
    comps.forEach((c, i) => add(T.parse[0] + 0.1 + (i / Math.max(1, comps.length)) * (T.parse[1] - T.parse[0]) * 0.6,
      `  ${c.name}`, UI.text, `${kfmt(c.loc)} loc`));
    add(T.parse[1] - 0.15, `${kfmt(g.metrics.functions)} functions  ${kfmt(g.metrics.todos)} TODOs  ${g.edges.length} import edges`, UI.cyan);
    add(T.graph[0], "$ gitzilla graph --heart --cycles", UI.green);
    add(T.graph[0] + 0.25, `heart: ${g.heart}`, UI.red, g.heartFanIn ? `fan-in ${g.heartFanIn}` : undefined);
    if (g.cycles.length) add(T.graph[0] + 0.5, `cycles: ${g.cycles.length}  ${g.cycles[0].slice(0, 3).map(short).join(" -> ")} -> ...`, UI.red);
    else add(T.graph[0] + 0.5, "cycles: 0  (acyclic, nice)", UI.dim);
    if (this.chain.length > 1) add(T.graph[0] + 0.75, `depth ${this.chain.length - 1}: ${this.chain.map((i) => this.nodes[i].short).join(" > ")}`, UI.amber);
    add(T.map[0], `$ gitzilla map --${this.kind}`, UI.green);
    for (const s of this.steps) add(s.t0 + (s.t1 - s.t0) * 0.35, `  ${s.from}`, UI.dim, `-> ${s.to}`);
    add(T.assemble[0], "$ gitzilla compile --sprite", UI.green);
    add(T.assemble[0] + 0.1, `rasterizing ${this.sprite?.cells.length ?? 0} ${this.kind === "boss" ? "blocks" : "pixels"} from real code...`, UI.dim);
    const title = this.kit ? (isBossKit(this.kit) ? this.kit.name : this.kit.title) : name;
    add(T.reveal[0], `exit 0  ${title} compiled`, UI.green);
    this.log = log.sort((a, b) => a.t - b.t);
  }

  // ------------------------------------------------------------------ layout + positions

  setLayout(L: Layout) {
    this.L = L;
  }

  private forcePos(box: Rect): Pt[] {
    const key = `${box.w}x${box.h}`;
    if (key !== this.forceKey) {
      this.forceKey = key;
      const seed = this.g.slug.length * 131 + this.nodes.length;
      this.force = forceLayout(this.nodes.map((n) => n.r), this.g.edges, box.w, box.h, seed, this.clusterPos(box));
    }
    return this.force;
  }

  private clusterPos(box: Rect): Pt[] {
    const n = this.nodes.length;
    return this.nodes.map((_, i) => {
      if (n === 1) return { x: 0, y: 0 };
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      return { x: Math.cos(a) * box.w * 0.34, y: Math.sin(a) * box.h * 0.32 };
    });
  }

  /** Graph box at time t (hero: shrinks to the left during map). */
  private graphBox(t: number): Rect {
    const L = this.L;
    if (this.kind === "boss") return L.graph;
    const [m0] = this.T.at.map;
    const k = ease.inOut(clamp01((t - m0) / 0.45));
    const a = L.graph, b = L.graphMap;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
  }

  /** Sprite placement inside charBox: integer scale when possible. */
  charXform(): { ox: number; oy: number; k: number } {
    const sp = this.sprite!;
    const box = this.kind === "boss" ? this.L.graph : this.L.charBox;
    const bw = sp.bbox.x1 - sp.bbox.x0 + 1, bh = sp.bbox.y1 - sp.bbox.y0 + 1;
    let k = sp.kind === "hero" ? Math.min((box.w * 0.8) / bw, (box.h * 0.66) / bh) : Math.min((box.w - 8) / bw, (box.h - 6) / bh);
    k = sp.kind === "hero" ? Math.max(sp.size > 40 ? 1 : 2, Math.min(8, Math.floor(k))) : k >= 1 ? Math.min(3, Math.floor(k)) : k;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const ox = Math.round(cx - ((sp.bbox.x0 + sp.bbox.x1 + 1) / 2) * k);
    const oy = Math.round(cy - ((sp.bbox.y0 + sp.bbox.y1 + 1) / 2) * k);
    return { ox, oy, k };
  }

  private spr(p: Pt): Pt {
    const { ox, oy, k } = this.charXform();
    return { x: ox + p.x * k, y: oy + p.y * k };
  }

  /** Node centers at time t (absolute logical px). */
  nodePos(t: number): Pt[] {
    const T = this.T.at;
    const box = this.graphBox(t);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const cl = this.clusterPos(this.L.graph);
    const fp = this.forcePos(this.L.graph);
    const sx = box.w / this.L.graph.w, sy = box.h / this.L.graph.h;
    const gk = ease.back(clamp01((t - T.graph[0]) / ((T.graph[1] - T.graph[0]) * 0.8)));
    return this.nodes.map((_, i) => {
      const x = cl[i].x + (fp[i].x - cl[i].x) * gk, y = cl[i].y + (fp[i].y - cl[i].y) * gk;
      let p = { x: cx + x * sx, y: cy + y * sy };
      if (this.kind === "boss" && this.sprite && t >= T.map[0]) {
        const target = this.limbTarget(i);
        if (target) {
          const k = this.flyK(i, t);
          p = { x: p.x + (target.x - p.x) * k, y: p.y + (target.y - p.y) * k };
        }
      }
      return p;
    });
  }

  private limbTarget(i: number): Pt | null {
    const sp = this.sprite;
    if (!sp) return null;
    const limb = sp.limbs.find((l) => l.component === this.nodes[i].name) ?? sp.limbs[i];
    return limb ? this.spr(limb) : null;
  }

  /** 0..1 how far node i has flown into its limb slot (boss). */
  private flyK(i: number, t: number): number {
    const st = this.steps.find((s) => s.part === "limb" && s.comp === i);
    let t0: number, t1: number;
    if (st) { t0 = st.t0 + (st.t1 - st.t0) * 0.45; t1 = st.t1 + 0.12; }
    else { const [m0, m1] = this.T.at.map; t0 = m0 + (m1 - m0) * 0.6; t1 = m1; }
    return ease.inOut(clamp01((t - t0) / Math.max(0.01, t1 - t0)));
  }

  tilePos(tile: Tile, t: number, nodes: Pt[]): Pt | null {
    if (t < tile.born) return null;
    const L = this.L, T = this.T.at;
    const st = L.stage;
    // heap: a loose mosaic over the middle of the stage
    const heap = { x: L.graph.x + 6 + tile.hx * (L.graph.w - 12), y: L.graph.y + L.graph.h * 0.15 + tile.hy * L.graph.h * 0.75 };
    // spawn: out of the terminal (wide) or from the top edge (tall)
    const src = L.wide ? { x: L.term.x + L.term.w - 4, y: L.term.y + L.term.h * 0.75 } : { x: st.x + tile.hx * st.w, y: st.y - 4 };
    const fk = ease.out(clamp01((t - tile.born) / 0.35));
    let p = { x: src.x + (heap.x - src.x) * fk, y: src.y + (heap.y - src.y) * fk - Math.sin(fk * Math.PI) * 18 };
    if (t >= T.parse[0]) {
      const n = nodes[tile.comp] ?? nodes[0];
      const node = this.nodes[tile.comp] ?? this.nodes[0];
      // cluster: tiles orbit tightly around their component node, compressing in the graph stage
      const gk = clamp01((t - T.graph[0]) / 0.6);
      const spread = (node.r + 4) * (1 - gk * 0.55);
      const a = tile.seed * Math.PI * 2 + t * 0.4 * (1 - gk);
      const rr = spread * (0.35 + 0.65 * Math.abs(tile.ox));
      const target = { x: n.x + Math.cos(a) * rr, y: n.y + Math.sin(a) * rr * 0.8 };
      const pk = ease.inOut(clamp01((t - T.parse[0] - tile.seed * 0.25) / 0.5));
      p = { x: p.x + (target.x - p.x) * pk, y: p.y + (target.y - p.y) * pk };
    }
    return p;
  }

  // ------------------------------------------------------------------ trace anchors

  private counterAnchor(key: string): Pt {
    const c = this.L.counters;
    const keys = this.counterKeys();
    const i = Math.max(0, keys.findIndex((k) => k[0] === key));
    return { x: c.x + ((i + 0.5) / keys.length) * c.w, y: c.y + 2 };
  }

  counterKeys(): [string, number][] {
    const m = this.g.metrics;
    const base: [string, number][] = [["files", m.files], ["loc", m.loc], ["fn", m.functions], ["todo", m.todos]];
    if (this.L && this.L.counters.w > 210) base.push(["authors", m.contributors], ["commits", m.commits]);
    return base;
  }

  private fromAnchor(s: Step, t: number, nodes: Pt[]): Pt {
    const f = s.from.toLowerCase();
    if (s.comp >= 0 && s.part !== "heart" && nodes[s.comp]) return nodes[s.comp];
    // language facts ("JavaScript · 49% of code") start on that language's slice of the language bar
    const li = this.langs.findIndex((l) => f.startsWith(l.name.toLowerCase()) || f.startsWith("language: " + l.name.toLowerCase()));
    if (li >= 0) {
      const lb = this.L.langBar;
      const before = this.langs.slice(0, li).reduce((a, l) => a + l.frac, 0);
      return { x: lb.x + (before + this.langs[li].frac / 2) * lb.w, y: lb.y + 1 };
    }
    if (s.part === "glyphs" || s.part === "cape") {
      const box = this.graphBox(t);
      return { x: box.x + box.w * 0.5, y: box.y + box.h - 4 };
    }
    if (f.startsWith("heart") || s.part === "heart") {
      const hi = this.nodes.findIndex((n) => n.heart);
      return nodes[Math.max(0, hi)];
    }
    if (f.includes("cycle")) {
      const ei = [...this.cyc][0];
      if (ei !== undefined) {
        const [a, b] = this.g.edges[ei];
        return { x: (nodes[a].x + nodes[b].x) / 2, y: (nodes[a].y + nodes[b].y) / 2 };
      }
    }
    if (f.startsWith("language") || f.includes("syntax") || s.part === "theme" && f.includes("language")) {
      const lb = this.L.langBar;
      return { x: lb.x + Math.max(4, (this.langs[0]?.frac ?? 0.5) * lb.w * 0.5), y: lb.y + 1 };
    }
    if (f.includes("todo") || f.includes("fixme")) return this.counterAnchor("todo");
    if (f.includes("contributor")) return this.counterAnchor(this.L.counters.w > 210 ? "authors" : "files");
    if (f.includes("commit")) return this.counterAnchor(this.L.counters.w > 210 ? "commits" : "loc");
    if (f.includes("test") || f.includes("files") || f.includes("shape")) return this.counterAnchor("files");
    if (f.includes("identifier") || f.includes("token") || f.includes("snippet") || f.includes("readme")) {
      const box = this.graphBox(t);
      return { x: box.x + box.w * 0.5, y: box.y + box.h - 4 };
    }
    if (s.part === "name") return { x: this.L.stage.x + 8, y: this.L.stage.y + 6 };
    const box = this.graphBox(t);
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  }

  private toAnchor(s: Step): Pt {
    const sp = this.sprite!;
    const A = sp.anchors;
    switch (s.part) {
      case "weapon": return this.spr(A.weapon ?? A.body);
      case "class": return this.spr(A.body);
      case "skill": return this.spr(A.body);
      case "glyphs": return this.spr(A.top);
      case "cape": return this.spr(A.back ?? A.body);
      case "palette": case "stats": case "name": {
        const p = this.spr(A.feet);
        return { x: p.x, y: p.y + 6 };
      }
      case "heart": return sp.heart ? this.spr(sp.heart) : this.spr(A.body);
      case "eyes": return sp.eyes[0] ? this.spr(sp.eyes[0]) : this.spr(A.head);
      case "minions": return this.spr(A.feet);
      case "theme": return { x: this.L.stage.x + this.L.stage.w - 6, y: this.L.stage.y + 6 };
      case "limb": case "attack": case "weakpoint": {
        const name = s.comp >= 0 ? this.nodes[s.comp].name : s.ref;
        const limb = sp.limbs.find((l) => l.component === name || l.id === s.ref) ?? (s.part === "weakpoint" ? sp.limbs.find((l) => l.weak) : undefined);
        return this.spr(limb ?? A.body);
      }
      default: return this.spr(A.body);
    }
  }

  /** Progress (0..1) of the first step of a part; -1 when the trace has none. */
  private partK(part: TraceStep["part"], t: number): number {
    const s = this.steps.find((x) => x.part === part);
    if (!s) return -1;
    return clamp01((t - (s.t0 + (s.t1 - s.t0) * 0.6)) / ((s.t1 - s.t0) * 0.4 + 0.05));
  }

  stageAt(t: number): StageId {
    for (const s of STAGES) if (t < this.T.at[s][1]) return s;
    return "reveal";
  }

  // ------------------------------------------------------------------ FX

  private emit(n: number, x: number, y: number, color: string, speed: number, glyphs?: string) {
    if (this.reduced) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: 0.4 + Math.random() * 0.4, max: 0.8, color, g: 60,
        glyph: glyphs ? glyphs[(Math.random() * glyphs.length) | 0] : undefined,
      });
    }
    if (this.parts.length > 260) this.parts.splice(0, this.parts.length - 260);
  }

  private once(key: string, t: number, at: number, fn: () => void) {
    if (t >= at && this.lastT < at && this.lastT >= 0 && !this.fired.has(key)) { this.fired.add(key); fn(); }
    else if (t >= at && this.lastT < 0) this.fired.add(key);
  }

  private events(t: number, nodes: Pt[]) {
    const T = this.T.at;
    for (const s of STAGES) this.once("stage-" + s, t, T[s][0], () => { if (s !== "clone") this.glitch = Math.max(this.glitch, 0.18); });
    for (const s of this.steps) this.once("step-" + s.idx, t, s.t0 + (s.t1 - s.t0) * 0.7, () => {
      const p = this.toAnchor(s);
      this.emit(10, p.x, p.y, s.color, 50, "01{};");
      this.flash = Math.max(this.flash, 0.06);
    });
    this.once("heart", t, T.graph[0] + 0.25, () => {
      const hi = this.nodes.findIndex((n) => n.heart);
      if (hi >= 0) this.emit(14, nodes[hi].x, nodes[hi].y, UI.red, 60, "<3");
    });
    this.once("done", t, T.reveal[0], () => {
      this.flash = 0.75;
      if (!this.reduced) this.shake = 4;
      const c = this.sprite ? this.spr(this.sprite.anchors.body) : { x: this.L.W / 2, y: this.L.H / 2 };
      this.emit(40, c.x, c.y, UI.green, 110, "{}();=>01");
    });
  }

  private stepParticles(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 1.5 * dt;
    }
  }

  // ------------------------------------------------------------------ draw

  draw(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number, dt: number) {
    const L = this.L;
    if (!L) return;
    const T = this.T.at;
    const nodes = this.nodePos(t);
    this.events(t, nodes);
    this.lastT = t;
    this.stepParticles(dt);
    this.shake *= Math.pow(0.02, dt);
    this.flash *= Math.pow(0.03, dt);
    this.glitch = Math.max(0, this.glitch - dt);
    const sx = this.shake > 0.3 ? Math.round((Math.random() - 0.5) * this.shake * 2) : 0;
    const sy = this.shake > 0.3 ? Math.round((Math.random() - 0.5) * this.shake * 2) : 0;

    ctx.save();
    ctx.translate(sx, sy);
    tx.ox = sx; tx.oy = sy;
    this.drawBackdrop(ctx, tx, t, now);
    this.drawFrame(ctx, tx, t, now);
    this.drawLangBar(ctx, tx, t);
    this.drawCounters(ctx, tx, t);
    const st = this.L.stage;
    ctx.save();
    ctx.beginPath();
    ctx.rect(st.x + 1, st.y + 1, st.w - 2, st.h - 2);
    ctx.clip();
    const graphFade = this.kind === "hero" ? 1 - 0.85 * clamp01((t - T.reveal[0]) / 0.4) : 1 - clamp01((t - T.assemble[0]) / ((T.assemble[1] - T.assemble[0]) * 0.8));
    if (graphFade > 0) this.drawGraph(ctx, tx, t, now, nodes, graphFade);
    this.drawTiles(ctx, t, nodes, graphFade);
    if (this.sprite && t >= T.map[0]) this.drawCharacter(ctx, tx, t, now, nodes);
    if (t >= T.map[0] && t < T.reveal[1] + 0.5) this.drawWires(ctx, tx, t, now, nodes);
    this.drawParticles(ctx);
    if (this.sprite && t >= T.reveal[0]) this.drawReveal(ctx, tx, t, now);
    if (!this.sprite && t >= T.map[0] - 0.01) this.drawWaiting(ctx, tx, now);
    ctx.restore();
    if (this.notes) this.drawNarration(ctx, tx, t, now);
    this.drawTerminal(ctx, tx, t, now);
    this.drawHeader(ctx, tx, t, now);
    ctx.restore();
    this.post(ctx, tx, now);
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number) {
    const L = this.L;
    ctx.fillStyle = UI.bg;
    ctx.fillRect(-8, -8, L.W + 16, L.H + 16);
    const st = L.stage;
    // theme tint once the boss trace maps the theme
    const themeK = this.kind === "boss" ? this.partK("theme", t) : -1;
    ctx.fillStyle = themeK > 0 ? mixHex(UI.bg2, this.themeColor(), 0.12 * themeK) : UI.bg2;
    ctx.fillRect(st.x, st.y, st.w, st.h);
    // circuit dot grid with slow data pulses
    ctx.fillStyle = UI.grid;
    for (let y = st.y + 4; y < st.y + st.h; y += 8) for (let x = st.x + 4; x < st.x + st.w; x += 8) ctx.fillRect(x, y, 1, 1);
    const R = rng(7);
    ctx.fillStyle = "#123326";
    for (let i = 0; i < 6; i++) {
      const y = st.y + 4 + Math.floor(R() * (st.h / 8)) * 8;
      const x = st.x + ((now * 30 + R() * st.w) % st.w);
      ctx.fillRect(Math.round(x), y, 3, 1);
    }
    // engraved real code, scrolling slowly behind everything
    const lh = tx.lineH(6, "term", 9);
    const lines = this.g.snippets;
    if (lines.length) {
      const off = (now * 4) % lh;
      let i = Math.floor(now * 4 / lh);
      for (let y = st.y + 2 - off; y < st.y + st.h - lh; y += lh, i++) {
        if (y < st.y) continue;
        tx.text(lines[i % lines.length], st.x + 4, y, { size: 6, min: 9, color: UI.green, alpha: 0.06, maxW: st.w - 8 });
      }
    }
  }

  private themeColor(): string {
    const kit = this.kit as BossKit | null;
    const th = kit?.theme ?? "terminal";
    return ({ terminal: "#39ff88", kernel: "#ff9a3d", web: "#ff3dd8", notebook: "#ffe7a3", enterprise: "#5aa0ff", legacy: "#8fd16a" } as Record<string, string>)[th] ?? UI.green;
  }

  private drawFrame(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number) {
    const L = this.L;
    // stage border: 1px with corner ticks
    const st = L.stage;
    ctx.fillStyle = UI.line;
    ctx.fillRect(st.x, st.y, st.w, 1); ctx.fillRect(st.x, st.y + st.h - 1, st.w, 1);
    ctx.fillRect(st.x, st.y, 1, st.h); ctx.fillRect(st.x + st.w - 1, st.y, 1, st.h);
    ctx.fillStyle = UI.green;
    for (const [x, y, dx, dy] of [[st.x, st.y, 1, 1], [st.x + st.w - 1, st.y, -1, 1], [st.x, st.y + st.h - 1, 1, -1], [st.x + st.w - 1, st.y + st.h - 1, -1, -1]]) {
      ctx.fillRect(x, y, 4 * dx || 1, 1); ctx.fillRect(x, y, 1, 4 * dy || 1);
      if (dx < 0) ctx.fillRect(x - 3, y, 4, 1);
      if (dy < 0) ctx.fillRect(x, y - 3, 1, 4);
    }
    // terminal window
    const tm = L.term;
    ctx.fillStyle = "#03060a";
    ctx.fillRect(tm.x, tm.y, tm.w, tm.h);
    ctx.fillStyle = UI.line;
    ctx.fillRect(tm.x, tm.y, tm.w, 1); ctx.fillRect(tm.x, tm.y + tm.h - 1, tm.w, 1);
    ctx.fillRect(tm.x, tm.y, 1, tm.h); ctx.fillRect(tm.x + tm.w - 1, tm.y, 1, tm.h);
    if (L.wide) {
      ctx.fillStyle = "#0c1a14";
      ctx.fillRect(tm.x + 1, tm.y + 1, tm.w - 2, 7);
      ctx.fillStyle = "#ff5f56"; ctx.fillRect(tm.x + 3, tm.y + 3, 2, 2);
      ctx.fillStyle = "#ffbd2e"; ctx.fillRect(tm.x + 7, tm.y + 3, 2, 2);
      ctx.fillStyle = "#27c93f"; ctx.fillRect(tm.x + 11, tm.y + 3, 2, 2);
      tx.text(`~/${this.g.slug.split("/").pop()} (main)`, tm.x + tm.w / 2, tm.y + 0.5, { size: 5, min: 9, color: UI.dim, align: "center", maxW: tm.w - 30 });
    }
    void t; void now;
  }

  private drawHeader(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number) {
    const L = this.L, h = L.header;
    const cur = this.stageAt(t);
    const ci = STAGES.indexOf(cur);
    ctx.fillStyle = "#03060a";
    ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.fillStyle = UI.line;
    ctx.fillRect(h.x, h.y + h.h - 1, h.w, 1);
    // overall progress bar (pixels) along the bottom edge
    const p = clamp01(t / this.T.total);
    ctx.fillStyle = UI.greenD;
    ctx.fillRect(h.x, h.y + h.h - 1, Math.round(h.w * p), 1);
    ctx.fillStyle = UI.green;
    ctx.fillRect(h.x + Math.round(h.w * p) - 2, h.y + h.h - 1, 2, 1);
    const size = L.compact ? 6 : 7;
    const lab = this.kind === "boss" ? "BOSS GENESIS" : "HERO GENESIS";
    let x = h.x + 4;
    const yy = h.y + (h.h - tx.lineH(size, "term", 10)) / 2;
    if (!L.compact) x += tx.text(lab, x, yy, { size, min: 10, color: this.kind === "boss" ? UI.red : UI.cyan }) + 6;
    x += tx.text(this.g.slug, x, yy, { size, min: 10, color: UI.text, maxW: h.w * (L.compact ? 0.4 : 0.3) }) + 8;
    // pipeline: clone > parse > graph > map > assemble > reveal
    const names = L.W < 300 ? ["cln", "prs", "grf", "map", "asm", "go"] : STAGES as string[];
    const sep = " › ";
    const total = names.reduce((s, n) => s + tx.measure(n, size, "term", 10), 0) + tx.measure(sep, size, "term", 10) * (names.length - 1);
    let px = Math.max(x, h.x + h.w - 4 - total);
    names.forEach((n, i) => {
      const done = i < ci || t >= this.T.total;
      const on = i === ci && t < this.T.total;
      const col = on ? (Math.floor(now * 4) % 2 ? UI.green : UI.text) : done ? UI.greenD : UI.dimmer;
      px += tx.text(n, px, yy, { size, min: 10, color: col, glow: on ? UI.green : null });
      if (i < names.length - 1) px += tx.text(sep, px, yy, { size, min: 10, color: UI.dimmer });
    });
  }

  private drawLangBar(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number) {
    const T = this.T.at;
    if (t < T.clone[0] + 0.3 || !this.langs.length) return;
    const lb = this.L.langBar;
    const k = ease.out(clamp01((t - T.clone[0] - 0.3) / 0.8));
    const hide = this.kind === "boss" ? clamp01((t - T.reveal[0]) / 0.25) : 0;
    if (hide >= 1) return;
    ctx.save();
    ctx.globalAlpha = 1 - hide;
    let x = lb.x;
    ctx.fillStyle = "#0d1712";
    ctx.fillRect(lb.x, lb.y, lb.w, lb.h);
    for (const l of this.langs) {
      const w = Math.max(1, Math.round(l.frac * lb.w * k));
      ctx.fillStyle = l.color;
      ctx.fillRect(x, lb.y, w, lb.h);
      ctx.fillStyle = brighten(l.color, 0.4);
      ctx.fillRect(x, lb.y, w, 1);
      x += w;
    }
    // labels
    let lx = lb.x;
    const size = 5.5;
    for (const l of this.langs.slice(0, this.L.W < 300 ? 2 : 4)) {
      const s = `${l.name} ${Math.round(l.frac * 100)}%`;
      const w = tx.text(s, lx, lb.y + lb.h + 1, { size, min: 9, color: brighten(l.color, 0.3), alpha: k * (1 - hide) });
      lx += w + 6;
      if (lx > lb.x + lb.w - 30) break;
    }
    ctx.restore();
  }

  private drawCounters(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number) {
    const T = this.T.at;
    if (t < T.parse[0]) return;
    if (this.kind === "boss" && t >= T.reveal[0]) return;
    if (this.kind === "hero" && t >= T.reveal[0]) return;
    const c = this.L.counters;
    const keys = this.counterKeys();
    const k = ease.out(clamp01((t - T.parse[0]) / ((T.parse[1] - T.parse[0]) * 0.9)));
    keys.forEach(([name, v], i) => {
      const cx = c.x + ((i + 0.5) / keys.length) * c.w;
      const val = kfmt(Math.round(v * k));
      const ticking = k < 1;
      tx.text(val, cx, c.y - 1, { size: 7, min: 11, color: ticking ? UI.text : name === "todo" ? UI.amber : UI.green, align: "center" });
      tx.text(name, cx, c.y + tx.lineH(7, "term", 11) - 2, { size: 5, min: 9, color: UI.dim, align: "center" });
    });
    ctx.fillStyle = UI.line;
    ctx.fillRect(c.x, c.y - 3, c.w, 1);
  }

  private drawGraph(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number, nodes: Pt[], fade: number) {
    const T = this.T.at;
    if (t < T.parse[0]) return;
    const pk = clamp01((t - T.parse[0] - 0.35) / 0.6);
    ctx.save();
    ctx.globalAlpha = fade;
    // import arrows: each edge draws itself in turn during parse
    const E = this.g.edges;
    const graphOn = t >= T.graph[0];
    E.forEach(([a, b], i) => {
      if (a >= nodes.length || b >= nodes.length || a === b) return;
      const ek = clamp01(pk * E.length - i * 0.7);
      if (ek <= 0) return;
      const isCyc = this.cyc.has(i) && graphOn;
      const ci = this.chain.indexOf(a);
      const inChain = graphOn && ci >= 0 && this.chain[ci + 1] === b;
      const chainOn = inChain && ((now * 1.4) % 1) * this.chain.length > ci;
      const A = nodes[a], B = nodes[b];
      const ra = this.nodes[a].r + 2, rb = this.nodes[b].r + 3;
      const d = Math.hypot(B.x - A.x, B.y - A.y) || 1;
      const ux = (B.x - A.x) / d, uy = (B.y - A.y) / d;
      // cycles bow outward so the loop reads as a loop
      const bow = isCyc ? 10 : 0;
      const p0 = { x: A.x + ux * ra, y: A.y + uy * ra }, p3 = { x: B.x - ux * rb, y: B.y - uy * rb };
      const mid = { x: (p0.x + p3.x) / 2 - uy * bow, y: (p0.y + p3.y) / 2 + ux * bow };
      const pts = bezierPts(p0, mid, mid, p3, Math.ceil(d));
      const n = Math.max(1, Math.floor(pts.length * ek));
      const col = isCyc ? (Math.floor(now * 6) % 2 ? UI.red : "#ff8095") : chainOn ? UI.amber : inChain ? "#b88a2a" : "#2f6b52";
      ctx.fillStyle = col;
      for (let j = 0; j < n; j++) if (!(j % 2) || isCyc || inChain) ctx.fillRect(pts[j].x, pts[j].y, 1, 1);
      // data packet
      if (ek >= 1) {
        const q = pts[Math.floor(((now * 0.9 + i * 0.37) % 1) * pts.length)];
        if (q) { ctx.fillStyle = isCyc ? "#ffd0d8" : "#9dffcf"; ctx.fillRect(q.x, q.y, 1, 1); }
        // arrow head
        const e = pts[pts.length - 1];
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(e.x - ux * 2 - uy), Math.round(e.y - uy * 2 + ux), 1, 1);
        ctx.fillRect(Math.round(e.x - ux * 2 + uy), Math.round(e.y - uy * 2 - ux), 1, 1);
      }
      if (isCyc) drawGlow(ctx, mid.x, mid.y, UI.red, 8, 0.35 + 0.2 * Math.sin(now * 8));
    });
    // nodes: rings sized by LOC, labels with real component names
    const lk = clamp01((t - T.parse[0] - 0.2) / 0.5);
    const bossFly = this.kind === "boss" && t >= T.map[0];
    this.nodes.forEach((n, i) => {
      const p = nodes[i];
      const grow = ease.back(clamp01((t - T.parse[0] - i * 0.06) / 0.4));
      if (grow <= 0) return;
      const inCycle = graphOn && this.g.cycles.some((c) => c.includes(n.name));
      let r = n.r * grow;
      if (bossFly) {
        const lt = this.sprite!.limbs.find((l) => l.component === n.name);
        const fk = this.flyK(i, t);
        if (lt) r = r + (Math.max(3, lt.r * this.charXform().k * 0.75) - r) * fk;
      }
      const beat = n.heart && graphOn ? Math.pow(Math.max(0, Math.sin(now * 5.5)), 6) : 0;
      if (n.heart && graphOn) r += 2 + beat * 2 + Math.min(4, this.g.heartFanIn / 6) * clamp01((t - T.graph[0]) / 0.5);
      const col = n.heart && graphOn ? UI.red : inCycle ? "#ff6b81" : UI.green;
      drawGlow(ctx, p.x, p.y, col, r + 6, 0.18 + beat * 0.3);
      ctx.fillStyle = "#06120d";
      disc(ctx, p.x, p.y, r);
      ctx.fillStyle = col;
      ring(ctx, p.x, p.y, r, n.heart ? 1 : 2, now * 3 + i);
      if (n.heart && graphOn) {
        ctx.fillStyle = beat > 0.3 ? "#ffffff" : "#ff8095";
        disc(ctx, p.x, p.y, Math.max(1.5, r * 0.35 + beat));
      }
      if (lk > 0 && !(bossFly && this.flyK(i, t) > 0.5)) {
        const label = n.heart && graphOn ? `${n.short} ♥${this.g.heartFanIn || ""}` : n.short;
        const hw = tx.measure(label, 5.5, "term", 9) / 2 + 3;
        const st = this.L.stage;
        tx.text(label, clamp(p.x, st.x + hw, st.x + st.w - hw), p.y + r + 1.5, { size: 5.5, min: 9, color: n.heart && graphOn ? "#ff8095" : brighten(UI.green, 0.3), align: "center", alpha: lk * fade, bg: "rgba(3,8,6,0.65)" });
      }
    });
    ctx.restore();
  }

  private drawTiles(ctx: CanvasRenderingContext2D, t: number, nodes: Pt[], fade: number) {
    const T = this.T.at;
    // tiles dissolve into their nodes as the graph settles
    const gone = clamp01((t - T.graph[0] - 0.3) / 0.6);
    if (gone >= 1) return;
    ctx.save();
    ctx.globalAlpha = (1 - gone) * fade;
    for (const tile of this.tiles) {
      const p = this.tilePos(tile, t, nodes);
      if (!p) continue;
      const x = Math.round(p.x), y = Math.round(p.y);
      const fresh = t - tile.born < 0.12;
      ctx.fillStyle = fresh ? "#ffffff" : tile.color;
      ctx.fillRect(x - 1, y - 2, 3, 4);
      ctx.fillStyle = "#000000";
      ctx.globalAlpha *= 0.4;
      ctx.fillRect(x + 1, y - 2, 1, 1);
      ctx.globalAlpha /= 0.4;
      if (fresh) drawGlow(ctx, x, y, tile.color, 4, 0.6);
    }
    ctx.restore();
  }

  private drawWires(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number, nodes: Pt[]) {
    const T = this.T.at;
    const fadeAll = 1 - clamp01((t - T.assemble[0] - 0.4) / 0.5);
    if (fadeAll <= 0) return;
    const active = this.steps.filter((s) => t >= s.t0);
    const cur = active[active.length - 1];
    for (const s of active) {
      const k = clamp01((t - s.t0) / (s.t1 - s.t0));
      const a = this.fromAnchor(s, s.t0, this.nodePosFrozen(s, nodes, t));
      const b = this.toAnchor(s);
      const dx = b.x - a.x;
      const bow = ((s.idx % 3) - 1) * 10;
      const pts = bezierPts(a, { x: a.x + dx * 0.45, y: a.y + bow - 10 }, { x: b.x - dx * 0.35, y: b.y + bow }, b, Math.ceil(Math.hypot(dx, b.y - a.y) * 1.2));
      const grow = ease.out(clamp01((k - 0.15) / 0.55));
      const n = Math.floor(pts.length * grow);
      const isCur = s === cur && k < 1;
      const alpha = (isCur ? 1 : 0.28) * fadeAll;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      for (let j = 0; j < n; j++) ctx.fillRect(pts[j].x, pts[j].y, 1, 1);
      // flowing data along finished wires
      if (grow >= 1) {
        ctx.fillStyle = "#ffffff";
        for (let q = 0; q < 2; q++) {
          const p = pts[Math.floor(((now * 0.7 + q * 0.5 + s.idx * 0.13) % 1) * pts.length)];
          if (p) ctx.fillRect(p.x, p.y, 1, 1);
        }
      }
      ctx.restore();
      if (isCur && n > 0) {
        const head = pts[n - 1];
        drawGlow(ctx, head.x, head.y, s.color, 7, 0.9);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(head.x, head.y, 1, 1);
        drawGlow(ctx, a.x, a.y, s.color, 6, 0.5 * (1 - k));
      }
      if (k >= 0.7 && k < 1) drawGlow(ctx, b.x, b.y, s.color, 10, (1 - k) * 2.5);
    }
    // captions: the current step's fact at the source, and its result at the target
    if (cur && fadeAll > 0.5) {
      const k = clamp01((t - cur.t0) / (cur.t1 - cur.t0));
      const a = this.fromAnchor(cur, cur.t0, this.nodePosFrozen(cur, nodes, t));
      const b = this.toAnchor(cur);
      const L = this.L, st = L.stage;
      const size = L.compact ? 6 : 6.5;
      const maxW = st.w * 0.55;
      const fy = clamp(a.y - 9, st.y + 2, st.y + st.h - 10);
      const fx = clamp(a.x, st.x + 4 + Math.min(maxW, tx.measure(cur.from, size, "term", 10)) / 2, st.x + st.w - 4 - Math.min(maxW, tx.measure(cur.from, size, "term", 10)) / 2);
      tx.text(cur.from, fx, fy, { size, min: 10, color: UI.text, align: "center", maxW, alpha: clamp01(k * 5) * (k > 0.92 ? 0.5 : 1), bg: "rgba(3,8,6,0.82)" });
      if (k > 0.62) {
        const w = Math.min(maxW, tx.measure(cur.to, size, "term", 10));
        const ty = clamp(b.y + 8, st.y + 12, st.y + st.h - 12);
        const tx0 = clamp(b.x, st.x + 4 + w / 2, st.x + st.w - 4 - w / 2);
        tx.text(cur.to, tx0, ty, { size, min: 10, color: cur.color, align: "center", maxW, glow: cur.color, bg: "rgba(3,8,6,0.85)", alpha: clamp01((k - 0.62) * 6) });
      }
    }
  }

  /** Boss limb wires start from the node's graph position at step start (before it flies). */
  private nodePosFrozen(s: Step, nodes: Pt[], t: number): Pt[] {
    if (this.kind !== "boss") return nodes;
    if (s.part !== "limb" && s.part !== "attack" && s.part !== "heart") return nodes;
    return this.nodePos(Math.min(t, s.t0));
  }

  private drawCharacter(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number, nodes: Pt[]) {
    const sp = this.sprite!;
    const T = this.T.at;
    const { ox, oy, k } = this.charXform();
    const ak = clamp01((t - T.assemble[0]) / (T.assemble[1] - T.assemble[0]));
    const live = t >= T.reveal[0];
    const pre = clamp01((t - T.map[0]) / 0.5);

    if (!live) {
      // the target shape: a flickering wireframe outline (the compiler's plan)
      ctx.save();
      ctx.globalAlpha = 0.22 * pre * (1 - ak) * (0.75 + 0.25 * Math.sin(now * 13));
      ctx.drawImage(tintCached(sp.outline, this.kind === "boss" ? UI.red : UI.cyan), ox, oy, sp.size * k, sp.size * k);
      ctx.restore();
      if (sp.kind === "hero") this.drawHeroParts(ctx, tx, t, now, ox, oy, k, 1 - ak);
      else this.drawBossSkeleton(ctx, tx, t, now, nodes, 1 - ak * 0.8);
    }

    // assemble: code rain into pixels/blocks
    if (t >= T.assemble[0] && !live) this.drawRain(ctx, t, now, ox, oy, k);

    if (live) {
      if (sp.kind === "hero") this.drawHeroLive(ctx, tx, t, now, ox, oy, k);
      else this.drawBossLive(ctx, now, ox, oy, k);
    }
  }

  private drawHeroParts(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number, ox: number, oy: number, k: number, fade: number) {
    const sp = this.sprite!, kit = this.kit as PlayerKit;
    const S = sp.size * k;
    const cls = this.partK("class", t), wpn = this.partK("weapon", t);
    ctx.save();
    ctx.globalAlpha = fade;
    if (cls > 0 && sp.body) {
      ctx.globalAlpha = fade * (0.35 + 0.25 * cls);
      ctx.drawImage(tintCached(sp.body, kit.palette[1] ?? UI.cyan), ox, oy, S, S);
      // scan line sweeping down the body as it is classified
      if (cls < 1) {
        ctx.globalAlpha = fade;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(ox + sp.bbox.x0 * k, Math.round(oy + (sp.bbox.y0 + (sp.bbox.y1 - sp.bbox.y0) * cls) * k), (sp.bbox.x1 - sp.bbox.x0 + 1) * k, 1);
      }
    }
    if (wpn > 0 && sp.weapon) {
      ctx.globalAlpha = fade;
      drawGlow(ctx, ox + sp.anchors.weapon.x * k, oy + sp.anchors.weapon.y * k, PART_COLOR.weapon, 4 * k, 0.5 * wpn);
      ctx.drawImage(sp.weapon, ox, oy, S, S);
    }
    ctx.restore();
    this.drawHeroExtras(ctx, tx, t, now, ox, oy, k, fade);
  }

  /** Aura / orbiting glyphs / cape code / swatches: shown as soon as their trace step lands, kept in the reveal. */
  private drawHeroExtras(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number, ox: number, oy: number, k: number, alpha: number) {
    const sp = this.sprite!, kit = this.kit as PlayerKit;
    const body = { x: ox + sp.anchors.body.x * k, y: oy + sp.anchors.body.y * k };
    const bw = (sp.bbox.x1 - sp.bbox.x0) * k, bh = (sp.bbox.y1 - sp.bbox.y0) * k;
    const skill = this.partK("skill", t);
    if (skill > 0) {
      const col = PART_COLOR.skill;
      const r = Math.max(bw, bh) * 0.62 * ease.back(skill);
      ctx.save();
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = col;
      ring(ctx, body.x, body.y - bh * 0.1, r, 3, now * 2);
      ctx.globalAlpha = alpha * 0.35;
      ring(ctx, body.x, body.y - bh * 0.1, r + 3, 1);
      ctx.restore();
      if (alpha > 0.5) tx.text(SKILL_LABEL[kit.skill] ?? kit.skill, body.x, body.y - bh * 0.1 - r - tx.lineH(5.5, "term", 9) - 1, { size: 5.5, min: 9, color: col, align: "center", alpha: alpha * skill });
    }
    const gl = this.partK("glyphs", t);
    const toks = (kit.code?.tokens ?? []).filter((s) => s.length <= 4).slice(0, 5);
    if (gl > 0 && toks.length) {
      const R = Math.max(bw, bh) * 0.82;
      toks.forEach((tok, i) => {
        const a = now * 0.9 + (i / toks.length) * Math.PI * 2;
        const x = body.x + Math.cos(a) * R, y = body.y - bh * 0.05 + Math.sin(a) * R * 0.3;
        const front = Math.sin(a) > 0;
        const spr = textSprite(tok.toUpperCase(), front ? "#9dffcf" : "#3d8a68", "#06120d", k >= 5 ? 2 : 1);
        ctx.save();
        ctx.globalAlpha = alpha * gl * (front ? 1 : 0.6);
        ctx.drawImage(spr, Math.round(x - spr.width / 2), Math.round(y - spr.height / 2));
        ctx.restore();
      });
    }
    const cape = t < this.T.at.reveal[0] ? this.partK("cape", t) : 0;
    if (cape > 0) {
      // the hero's real snippet runs down the back like scrolling source
      const bx = ox + (sp.anchors.back.x - 2) * k, by = oy + (sp.bbox.y0 + (sp.bbox.y1 - sp.bbox.y0) * 0.35) * k;
      const w = Math.max(6, k * 4), h = bh * 0.5;
      const syn = ["#c678dd", "#98c379", "#61afef", "#d19a66", "#e5c07b", "#abb2bf"];
      ctx.save();
      ctx.globalAlpha = alpha * cape * 0.9;
      ctx.fillStyle = "#0b1420";
      ctx.fillRect(Math.round(bx - w), Math.round(by), Math.round(w), Math.round(h));
      const snip = kit.code?.snippet ?? this.codeStream;
      for (let row = 0; row < h / 2; row++) {
        const off = Math.floor(now * 3) + row;
        let x = 0;
        while (x < w - 1) {
          const ch = snip.charCodeAt((off * 7 + x) % Math.max(1, snip.length)) || 32;
          const len = 1 + (ch % 4);
          if (ch !== 32) { ctx.fillStyle = syn[ch % syn.length]; ctx.fillRect(Math.round(bx - w + 1 + x), Math.round(by + row * 2 + 1), Math.min(len, w - 1 - x), 1); }
          x += len + 1;
        }
      }
      ctx.restore();
    }
    const pal = this.partK("palette", t);
    if (pal > 0) {
      const y = oy + sp.bbox.y1 * k + 6;
      const cols = kit.palette.slice(0, 4);
      const sw = Math.max(4, Math.round(k * 1.5));
      cols.forEach((c, i) => {
        const x = Math.round(body.x - (cols.length * (sw + 2)) / 2 + i * (sw + 2));
        ctx.save();
        ctx.globalAlpha = alpha * clamp01(pal * 4 - i);
        ctx.fillStyle = "#06120d"; ctx.fillRect(x - 1, y - 1, sw + 2, sw + 2);
        ctx.fillStyle = c; ctx.fillRect(x, y, sw, sw);
        ctx.restore();
      });
    }
  }

  private drawBossSkeleton(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number, nodes: Pt[], alpha: number) {
    const sp = this.sprite!, kit = this.kit as BossKit;
    const heartK = this.partK("heart", t);
    const center = this.spr(sp.heart ?? sp.center);
    ctx.save();
    ctx.globalAlpha = alpha;
    // tentacles: heart -> each limb that has arrived
    this.nodes.forEach((n, i) => {
      const fk = this.flyK(i, t);
      if (fk < 0.98) return;
      const p = nodes[i];
      const limb = sp.limbs.find((l) => l.component === n.name);
      const pts = bezierPts(center, { x: center.x + (p.x - center.x) * 0.3, y: center.y + (p.y - center.y) * 0.7 + Math.sin(now * 2 + i) * 4 }, { x: p.x - (p.x - center.x) * 0.2, y: p.y }, p, 40);
      ctx.fillStyle = limb?.weak && this.partK("weakpoint", t) > 0 ? UI.red : "#7a4a8a";
      for (const q of pts) ctx.fillRect(q.x, q.y, 1, 1);
      if (limb) {
        ctx.fillStyle = limb.weak && this.partK("weakpoint", t) > 0 ? UI.red : PART_COLOR.limb;
        ring(ctx, p.x, p.y, limb.r * this.charXform().k * 0.8, 2, now * 2 + i);
      }
    });
    // weak points: red knots pulsing at cycle limbs
    const wk = this.partK("weakpoint", t);
    if (wk > 0) for (const l of sp.limbs.filter((x) => x.weak)) {
      const p = this.spr(l);
      const pulse = 0.5 + 0.5 * Math.sin(now * 7);
      drawGlow(ctx, p.x, p.y, UI.red, 12, 0.5 * wk + 0.3 * pulse);
      ctx.fillStyle = UI.red;
      ring(ctx, p.x, p.y, 3 + pulse * 1.5, 1);
    }
    // heart core
    if (heartK > 0) {
      const beat = Math.pow(Math.max(0, Math.sin(now * 5.5)), 6);
      drawGlow(ctx, center.x, center.y, UI.red, 16 + beat * 6, 0.6 * heartK);
      ctx.fillStyle = "#3a0612"; disc(ctx, center.x, center.y, 5 * heartK + beat);
      ctx.fillStyle = UI.red; ring(ctx, center.x, center.y, 5 * heartK + beat, 1);
      ctx.fillStyle = "#ffffff"; disc(ctx, center.x, center.y, 1.5 + beat);
    }
    // eyes pop open one by one
    const ek = this.partK("eyes", t);
    if (ek > 0) sp.eyes.forEach((e, i) => {
      const ok = clamp01(ek * sp.eyes.length - i);
      if (ok <= 0) return;
      const p = this.spr(e);
      const r = Math.max(1.5, e.r * this.charXform().k * ok);
      ctx.fillStyle = kit.palette[4] ?? "#fff4c4"; disc(ctx, p.x, p.y, r);
      ctx.fillStyle = "#120612"; disc(ctx, p.x + Math.sin(now + i) * r * 0.3, p.y, Math.max(0.5, r * 0.45));
    });
    // minions: bugs hatch from TODOs and scuttle under the body
    const mk = this.partK("minions", t);
    if (mk > 0) {
      const feet = this.spr(sp.anchors.feet);
      const n = Math.min(7, Math.max(2, Math.round(Math.log2(this.g.metrics.todos + 2) * 1.5)));
      for (let i = 0; i < n; i++) {
        const ph = i * 1.7;
        const x = feet.x + Math.sin(now * 1.3 + ph) * 30 + (i - n / 2) * 7;
        const y = feet.y - 4 + Math.cos(now * 2 + ph) * 2;
        ctx.globalAlpha = alpha * clamp01(mk * n - i);
        ctx.fillStyle = "#9dff5a"; ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 2);
        ctx.fillStyle = "#1a3a0a"; ctx.fillRect(Math.round(x) - 2 + (Math.floor(now * 8 + i) % 2), Math.round(y) + 2, 1, 1); ctx.fillRect(Math.round(x) + 2 - (Math.floor(now * 8 + i) % 2), Math.round(y) + 2, 1, 1);
      }
      ctx.globalAlpha = alpha;
    }
    // scars: slash lines flash across the hide
    const sk = this.partK("scars", t);
    if (sk > 0 && sk < 1) {
      const R = rng(11);
      ctx.fillStyle = "#ff8a8a";
      const c = this.spr(sp.center);
      for (let i = 0; i < 4; i++) {
        const x0 = c.x + (R() - 0.5) * 60, y0 = c.y + (R() - 0.5) * 50;
        line(ctx, x0, y0, x0 + 8 * sk, y0 + 5 * sk);
      }
    }
    ctx.restore();
    void tx;
  }

  private drawRain(ctx: CanvasRenderingContext2D, t: number, now: number, ox: number, oy: number, k: number) {
    const sp = this.sprite!;
    const T = this.T.at;
    const dur = T.assemble[1] - T.assemble[0];
    const src = sp.frames[0];
    const stream = this.codeStream.replace(/\s/g, "");
    const fall = dur * 0.3;
    const glyphScale = sp.kind === "hero" && k >= 6 ? 1 : 1;
    let gi = 0;
    for (let i = 0; i < sp.cells.length; i++) {
      const c = sp.cells[i];
      const t0 = T.assemble[0] + this.rainOrder[i] / 1.35 * (dur - fall * 1.6 - 0.05);
      const f = (t - t0) / fall;
      if (f < 0) continue;
      const x = ox + c.x * k, y = oy + c.y * k, s = c.size * k;
      const ch = stream[(i * 7 + gi++) % Math.max(1, stream.length)] ?? "0";
      const spr = glyphSprite(ch, c.color, glyphScale);
      const gx = Math.round(x + s / 2 - spr.width / 2);
      if (f >= 1) {
        // landed: a character cell (the code glyph on a dark cell) that then compiles into the real pixel
        if (f < 1.5 && s >= 5) {
          ctx.fillStyle = "#06120d"; ctx.fillRect(x, y, s, s);
          ctx.drawImage(spr, gx, Math.round(y + s / 2 - spr.height / 2));
          continue;
        }
        ctx.drawImage(src, c.x, c.y, c.size, c.size, x, y, s, s);
        const fl = s >= 5 ? (f - 1.5) / 0.4 : (f - 1) / 0.6;
        if (fl < 1) { ctx.globalAlpha = 1 - Math.max(0, fl); ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y, s, s); ctx.globalAlpha = 1; }
        continue;
      }
      const yy = y - (1 - ease.in(f)) * (this.L.stage.h * 0.6 + 20);
      // falling glyph with a short matrix-rain tail
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = c.color;
      ctx.fillRect(Math.round(x + s / 2), Math.round(yy + s / 2 - 10), 1, 8);
      ctx.globalAlpha = 1;
      ctx.drawImage(spr, gx, Math.round(yy + s / 2 - spr.height / 2));
    }
    void now;
  }

  private drawHeroLive(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number, ox: number, oy: number, k: number) {
    const sp = this.sprite!, kit = this.kit as PlayerKit;
    const fr = sp.frames[playerPortraitFrame(now, kit.seed)] ?? sp.frames[0];
    const S = sp.size * k;
    const body = this.spr(sp.anchors.body);
    drawGlow(ctx, body.x, body.y, kit.palette[1] ?? UI.cyan, Math.round(S * 0.45), 0.22);
    // ground ring
    const feet = this.spr(sp.anchors.feet);
    ctx.fillStyle = "#1a8a4a";
    ring(ctx, feet.x, feet.y + 1, S * 0.18, 2, now * 2);
    ctx.drawImage(fr, ox, oy, S, S);
    // rare RGB-split glitch for life
    if ((now + (kit.seed % 97) / 13) % 4.7 < 0.1 && !this.reduced) {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5;
      ctx.drawImage(tintCached(sp.silhouette, "#ff2050"), ox - k, oy, S, S);
      ctx.drawImage(tintCached(sp.silhouette, "#20e0ff"), ox + k, oy, S, S);
      ctx.restore();
    }
    this.drawHeroExtras(ctx, tx, t, now, ox, oy, k, 1);
  }

  private drawBossLive(ctx: CanvasRenderingContext2D, now: number, ox: number, oy: number, k: number) {
    const sp = this.sprite!;
    const b = this.bossState!;
    // drawBoss keeps a little shared FX state for the arena; don't disturb a match in progress
    const saved = { boss: arenaFx.boss, now: arenaFx.now, victoryAt: arenaFx.victoryAt };
    arenaFx.victoryAt = -1;
    b.x = sp.center.x; b.y = sp.center.y;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(k, k);
    try { drawBoss(ctx, b, now); } finally {
      arenaFx.boss = saved.boss; arenaFx.now = saved.now; arenaFx.victoryAt = saved.victoryAt;
      ctx.restore();
    }
  }

  private drawReveal(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number) {
    const T = this.T.at;
    const L = this.L, st = L.stage;
    const kit = this.kit!;
    const rk = t - T.reveal[0];
    const boss = isBossKit(kit);
    const title = boss ? kit.name : kit.title;
    const typed = title.slice(0, Math.floor(rk * 42));
    const sub = boss ? (kit.design?.epithet ?? "") : (kit.design?.catchphrase ? `"${kit.design.catchphrase}"` : "");
    const lines: [string, string][] = boss
      ? [[`${kit.limbs.length} limbs · ${kit.attacks.length} attacks · theme ${kit.theme}`, UI.dim]]
      : [[`weapon  ${kit.code?.weapon?.name ?? kit.weapon}`, PART_COLOR.weapon], [`skill   ${SKILL_LABEL[kit.skill] ?? kit.skill}`, PART_COLOR.skill]];
    // name card: hero on the left half (graph faded), boss across the top of the stage
    const box: Rect = boss ? { x: st.x + 6, y: L.langBar.y - 1, w: st.w - 12, h: 0 } : { x: L.graphMap.x + 2, y: L.graphMap.y + 2, w: L.graphMap.w - 4, h: 0 };
    const big = L.compact ? 9 : 11;
    const align: CanvasTextAlign = boss ? "center" : "left";
    const ax = boss ? box.x + box.w / 2 : box.x;
    let y = box.y;
    let titleSize = big * (L.compact ? 0.62 : 0.72);
    const tw = tx.measure(title + "_", titleSize, "pix", 11);
    if (tw > box.w) titleSize *= Math.max(0.6, box.w / tw);
    const cursor = Math.floor(now * 3) % 2 && typed.length < title.length + 1 ? "_" : "";
    if (!boss || true) {
      ctx.fillStyle = "rgba(3,6,10,0.78)";
      const bh = tx.lineH(titleSize, "pix", 11) + (sub ? tx.lineH(6.5, "term", 10) : 0) + lines.length * tx.lineH(6.5, "term", 10) + 4;
      ctx.fillRect(Math.round(boss ? box.x : box.x - 2), Math.round(box.y - 1), Math.round(box.w + (boss ? 0 : 4)), Math.round(bh + 2));
    }
    y += 1;
    tx.text(typed + cursor, ax, y, { size: titleSize, min: 11, font: "pix", color: boss ? "#ff5d73" : UI.yellow, align, glow: boss ? UI.red : UI.amber, maxW: box.w });
    y += tx.lineH(titleSize, "pix", 11) + 1;
    if (sub) {
      tx.text(sub.slice(0, Math.max(0, Math.floor((rk - 0.3) * 60))), ax, y, { size: 6.5, min: 10, color: UI.text, align, maxW: box.w });
      y += tx.lineH(6.5, "term", 10);
    }
    lines.forEach(([s, c], i) => {
      tx.text(s, ax, y, { size: 6.5, min: 10, color: c, align, alpha: clamp01((rk - 0.2 - i * 0.12) * 4), maxW: box.w });
      y += tx.lineH(6.5, "term", 10);
    });
    const quality = !boss ? kit.quality : undefined;
    if (quality?.length) this.drawReport(ctx, tx, t, quality, { x: box.x, y: y + 4, w: box.w, h: L.graphMap.y + L.graphMap.h - y - 4 });
    else this.drawBudget(ctx, tx, t, now, boss ? { x: st.x + 8, y: L.counters.y - 8, w: st.w - 16, h: 18 } : { x: box.x, y: y + 4, w: box.w, h: L.graphMap.y + L.graphMap.h - y - 4 });
  }

  /** Edu: the report card replaces the equal budget. Every stat shows its grade and the real signal behind it. */
  private drawReport(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, q: NonNullable<PlayerKit["quality"]>, r: Rect) {
    const T = this.T.at;
    const rk = clamp01((t - T.reveal[0] - 0.25) / ((T.reveal[1] - T.reveal[0]) * 0.75));
    const g = gpa(q);
    tx.text(`report card  GPA ${g.toFixed(1)} (${gpaGrade(g)})`, r.x, r.y, { size: 5.5, min: 9, color: GRADE_COLOR[gpaGrade(g)], maxW: r.w });
    const lh = Math.max(7, tx.lineH(5.5, "term", 9));
    const labW = tx.measure("weakness", 5.5, "term", 9) + 3;
    const gw = tx.measure("A", 6.5, "pix", 9) + 4;
    sortStats(q).forEach((s, i) => {
      const y = r.y + lh * (i + 1) + 1;
      if (y + lh > r.y + r.h + 6) return;
      const a = clamp01(rk * q.length - i);
      if (a <= 0) return;
      tx.text(STAT_LABEL[s.stat].plain, r.x, y - 1, { size: 5.5, min: 9, color: UI.text, alpha: a });
      tx.text(s.grade, r.x + labW, y - 1, { size: 5.5, min: 9, font: "pix", color: GRADE_COLOR[s.grade], glow: GRADE_COLOR[s.grade], alpha: a });
      tx.text(s.signal, r.x + labW + gw, y - 1, { size: 5.5, min: 9, color: UI.dim, alpha: a, maxW: r.w - labW - gw });
    });
    void ctx;
  }

  private drawBudget(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number, r: Rect) {
    const T = this.T.at;
    const bud = this.g.budget.filter((b) => b.value >= 0);
    if (!bud.length) return;
    const rk = clamp01((t - T.reveal[0] - 0.25) / ((T.reveal[1] - T.reveal[0]) * 0.75));
    const boss = this.kind === "boss";
    const sum = bud.reduce((s, b) => s + b.value, 0) || 1;
    if (boss) {
      // one stacked bar: the room-wide HP budget split between core and limbs
      tx.text(`threat budget split (same total for every boss)`, r.x, r.y - tx.lineH(5.5, "term", 9), { size: 5.5, min: 9, color: UI.dim, maxW: r.w });
      let x = r.x;
      const cols = [UI.red, "#ffb000", "#ff7a3d", "#c8a2ff", "#7ad7ff", "#9dff5a", "#ff9de2"];
      bud.forEach((b, i) => {
        const w = Math.round((b.value / sum) * r.w * clamp01(rk * bud.length - i));
        if (w <= 0) return;
        ctx.fillStyle = cols[i % cols.length];
        ctx.fillRect(x, r.y + 2, Math.max(1, w - 1), 4);
        if (w > 24) tx.text(short(b.label), x + 1, r.y + 7, { size: 5, min: 9, color: cols[i % cols.length], maxW: w - 2 });
        x += w;
      });
      return;
    }
    // hero: pips fly from the hero into bars; total budget is the same 5 points for everyone
    const head = `stat budget: ${sum} pts (equal for all)`;
    tx.text(head, r.x, r.y, { size: 5.5, min: 9, color: UI.dim, maxW: r.w });
    const lh = Math.max(7, tx.lineH(5.5, "term", 9));
    const y0 = r.y + lh + 1;
    const labW = Math.min(r.w * 0.38, tx.measure("damage", 5.5, "term", 9) + 4);
    const pip = 5;
    let pi = 0;
    const from = this.sprite ? this.spr(this.sprite.anchors.body) : { x: r.x + r.w, y: r.y };
    bud.forEach((b, i) => {
      const y = y0 + i * lh;
      if (y + lh > r.y + r.h + 6) return;
      tx.text(b.label, r.x, y - 1, { size: 5.5, min: 9, color: UI.text });
      // base slot + earned pips
      const bx = r.x + labW;
      ctx.fillStyle = "#1a2a22";
      for (let j = 0; j < 3; j++) ctx.fillRect(bx + j * (pip + 1), Math.round(y + 1), pip, pip - 1);
      for (let j = 0; j < b.value; j++, pi++) {
        const at = pi / Math.max(1, sum);
        const f = clamp01((rk - at * 0.7) / 0.25);
        if (f <= 0) continue;
        const tx0 = bx + j * (pip + 1), ty0 = Math.round(y + 1);
        const x = from.x + (tx0 - from.x) * ease.out(f), yy = from.y + (ty0 - from.y) * ease.out(f) - Math.sin(f * Math.PI) * 12;
        ctx.fillStyle = f >= 1 ? UI.green : "#ffffff";
        ctx.fillRect(Math.round(x), Math.round(yy), pip, pip - 1);
        if (f < 1) drawGlow(ctx, x + 2, yy + 2, UI.green, 5, 0.8);
      }
    });
    void now;
  }

  /** Edu pause points: the cinematic holds at the end of each stage while the narration is read. */
  pausePoints(): number[] {
    if (!this.edu || this.condensed) return [];
    const T = this.T.at;
    return [T.clone[1], T.parse[1], T.graph[1], T.map[1], T.assemble[1]];
  }

  /** Set by index.ts while held: 0..1 auto-advance progress, or -1 = waiting for a tap. */
  hold: number | null = null;

  private drawNarration(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number) {
    const st = this.stageAt(t);
    const note = this.notes![st as EduStage];
    if (!note) return;
    const L = this.L;
    const area = L.stage;
    const size = L.compact ? 6 : 6.5;
    const w = Math.min(area.w - 12, 300);
    const x = area.x + (area.w - w) / 2;
    const lh = tx.lineH(size, "term", 11);
    const lines = wrap(tx, note.text, w - 8, size);
    const h = lh * (lines.length + 2) + 6;
    // the hero's reveal panel lives on the left; keep the narration clear of it
    const y = st === "reveal" && this.kind === "hero" ? area.y + area.h - h - 3 : st === "reveal" ? area.y + area.h * 0.62 - h / 2 : area.y + area.h - h - (L.counters.h + 4);
    ctx.fillStyle = "rgba(3,8,6,0.9)";
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.fillStyle = UI.green;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 1);
    ctx.fillRect(Math.round(x), Math.round(y), 1, Math.round(h));
    tx.text(note.title, x + 4, y + 2, { size, min: 11, color: UI.green });
    lines.forEach((ln, i) => tx.text(ln, x + 4, y + 2 + lh * (i + 1), { size, min: 11, color: UI.text }));
    tx.text(note.fact, x + 4, y + 2 + lh * (lines.length + 1), { size, min: 11, color: UI.amber, maxW: w - 8 });
    if (this.hold !== null) {
      if (this.hold < 0) {
        if (Math.floor(now * 2) % 2) tx.text("tap to continue ▸", x + w - 4, y + 2, { size: size * 0.9, min: 10, color: UI.cyan, align: "right" });
      } else {
        ctx.fillStyle = UI.greenD;
        ctx.fillRect(Math.round(x), Math.round(y + h - 1), Math.round(w * this.hold), 1);
      }
    }
  }

  private drawWaiting(ctx: CanvasRenderingContext2D, tx: TextLayer, now: number) {
    const st = this.L.stage;
    const dots = ".".repeat(1 + (Math.floor(now * 3) % 3));
    tx.text(`designing${dots}`, st.x + st.w / 2, st.y + st.h / 2, { size: 8, min: 12, color: UI.amber, align: "center", glow: UI.amber });
    void ctx;
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.parts) {
      const a = clamp01(p.life / p.max * 1.5);
      ctx.globalAlpha = a;
      if (p.glyph) {
        const s = glyphSprite(p.glyph, p.color, 1);
        ctx.drawImage(s, Math.round(p.x), Math.round(p.y));
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawTerminal(ctx: CanvasRenderingContext2D, tx: TextLayer, t: number, now: number) {
    const L = this.L, tm = L.term;
    const size = L.termSize;
    const lh = tx.lineH(size, "term", 10);
    const top = tm.y + (L.wide ? 9 : 2);
    const rows = Math.max(1, Math.floor((tm.h - (L.wide ? 11 : 4)) / lh));
    const shown = this.log.filter((l) => l.t <= t);
    const view = shown.slice(-rows);
    view.forEach((l, i) => {
      const last = i === view.length - 1;
      const chars = last && this.hold === null ? Math.floor((t - l.t) * 90) : 9999;
      const text = l.text.slice(0, chars);
      const w = tx.text(text, tm.x + 3, top + i * lh, { size, min: 10, color: l.color, maxW: tm.w - 6 });
      if (l.dim && chars >= l.text.length) tx.text(" " + l.dim, tm.x + 3 + w, top + i * lh, { size, min: 10, color: l.color === UI.dim ? UI.text : UI.dim, maxW: Math.max(0, tm.w - 6 - w) });
    });
    // blinking block cursor
    if (Math.floor(now * 2.5) % 2) {
      const y = top + Math.min(rows - 1, view.length) * lh;
      if (view.length < rows) { ctx.fillStyle = UI.green; ctx.fillRect(tm.x + 3, Math.round(y + 1), 3, Math.max(3, Math.round(lh * 0.7))); }
    }
  }

  private post(ctx: CanvasRenderingContext2D, tx: TextLayer, now: number) {
    const L = this.L;
    if (this.glitch > 0 && !this.reduced) {
      // horizontal slice displacement (the stage-change glitch)
      const c = ctx.canvas;
      for (let i = 0; i < 4; i++) {
        const y = Math.floor(Math.random() * L.H), h = 2 + Math.floor(Math.random() * 8);
        const dx = Math.round((Math.random() - 0.5) * 16);
        ctx.drawImage(c, 0, y, L.W, h, dx, y, L.W, h);
      }
    }
    if (this.flash > 0.01) {
      ctx.globalAlpha = Math.min(0.9, this.flash);
      ctx.fillStyle = "#e9fff3";
      ctx.fillRect(0, 0, L.W, L.H);
      ctx.globalAlpha = 1;
    }
    void tx; void now;
  }
}

const SKILL_LABEL: Record<string, string> = {
  firewall: "try{}catch firewall", fork: "git fork decoy", hotfix: "+patch hotfix", overclock: "sudo !! overclock", rollback: "git revert rollback",
};

function wrap(tx: TextLayer, text: string, maxW: number, size: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    const next = cur ? cur + " " + word : word;
    if (tx.measure(next, size, "term", 11) > maxW && cur) { out.push(cur); cur = word; } else cur = next;
  }
  if (cur) out.push(cur);
  return out.slice(0, 4);
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return "#" + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

const tints = new Map<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();
function tintCached(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  let m = tints.get(src);
  if (!m) { m = new Map(); tints.set(src, m); }
  let c = m.get(color);
  if (!c) {
    c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const g = c.getContext("2d")!;
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    m.set(color, c);
  }
  return c;
}

const glyphCache = new Map<string, HTMLCanvasElement>();
function glyphSprite(ch: string, color: string, scale: number): HTMLCanvasElement {
  const key = ch + color + scale;
  let c = glyphCache.get(key);
  if (!c) {
    if (glyphCache.size > 2400) glyphCache.clear();
    c = textSprite(ch.toUpperCase(), color, null, scale);
    glyphCache.set(key, c);
  }
  return c;
}
