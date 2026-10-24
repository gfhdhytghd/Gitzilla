// Live phase of the Genesis cinematic: the repo is still being analyzed. Real paths from GenesisProgress
// stream into the terminal and pour into the stage as file tiles; once parsing starts, tiles gather under
// their real top-level directories. When the genesis arrives, index.ts hands over to the full Scene.
import type { GenesisProgress } from "../../shared/types.ts";
import { drawGlow, ring } from "../render/arena/pix.ts";
import { clamp01, ease, rng } from "./graph.ts";
import { UI, brighten, langColor, langOfPath } from "./palette.ts";
import { STAGES, type Layout } from "./scene.ts";
import type { TextLayer } from "./text.ts";

interface LTile { path: string; color: string; born: number; key: string; hx: number; hy: number; seed: number }
const ORDER: Record<string, number> = { clone: 0, parse: 1, graph: 2, dna: 3, map: 3, design: 3, ready: 4 };
const NOTE: Record<string, string> = {
  clone: "receiving objects", parse: "parsing imports", graph: "building dependency graph", dna: "extracting code DNA",
  map: "mapping code to character", design: "AI designer sketching", ready: "compiling sprite",
};

function clusterKey(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "(root)";
  if (["src", "packages", "crates", "lib", "apps", "pkg", "internal", "cmd"].includes(parts[0]) && parts.length > 2) return parts[0] + "/" + parts[1];
  return parts[0];
}

export class Live {
  private tiles: LTile[] = [];
  private seen = new Set<string>();
  private log: { t: number; text: string; color: string }[] = [];
  private keys: string[] = [];
  private stage = "clone";
  private pct = 0;
  private note = "";
  private start = performance.now() / 1000;
  private L: Layout | null = null;
  private R = rng(99);

  constructor(public slug: string, public kind: "hero" | "boss", public reduced: boolean) {
    const now = this.start;
    this.log.push({ t: now, text: `$ git clone github.com/${slug || "…"}`, color: UI.green });
    this.log.push({ t: now + 0.1, text: `Cloning into '${slug.split("/").pop() || "repo"}'...`, color: UI.dim });
  }

  age(): number { return performance.now() / 1000 - this.start; }
  setLayout(L: Layout) { this.L = L; }

  push(p: GenesisProgress) {
    const now = performance.now() / 1000;
    if (p.stage !== this.stage) {
      this.stage = p.stage;
      this.log.push({ t: now, text: `$ gitzilla ${p.stage}`, color: UI.green });
    }
    this.pct = Math.max(this.pct, p.pct);
    if (p.note && p.note !== this.note) { this.note = p.note; this.log.push({ t: now, text: `  ${p.note}`, color: UI.cyan }); }
    (p.paths ?? []).forEach((path, i) => {
      if (this.seen.has(path) || this.tiles.length > 140) return;
      this.seen.add(path);
      const born = now + i * 0.06;
      const key = clusterKey(path);
      if (!this.keys.includes(key) && this.keys.length < 8) this.keys.push(key);
      this.tiles.push({ path, color: langColor(langOfPath(path)), born, key, hx: this.R(), hy: this.R(), seed: this.R() });
      this.log.push({ t: born, text: `  ${path}`, color: brighten(langColor(langOfPath(path)), 0.25) });
    });
    if (this.log.length > 200) this.log.splice(2, this.log.length - 200);
  }

  draw(ctx: CanvasRenderingContext2D, tx: TextLayer, now: number, dt: number) {
    const L = this.L;
    if (!L) return;
    void dt;
    const st = L.stage, tm = L.term;
    ctx.fillStyle = UI.bg; ctx.fillRect(0, 0, L.W, L.H);
    ctx.fillStyle = UI.bg2; ctx.fillRect(st.x, st.y, st.w, st.h);
    ctx.fillStyle = UI.grid;
    for (let y = st.y + 4; y < st.y + st.h; y += 8) for (let x = st.x + 4; x < st.x + st.w; x += 8) ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = UI.line;
    ctx.fillRect(st.x, st.y, st.w, 1); ctx.fillRect(st.x, st.y + st.h - 1, st.w, 1);
    ctx.fillRect(st.x, st.y, 1, st.h); ctx.fillRect(st.x + st.w - 1, st.y, 1, st.h);
    ctx.fillStyle = "#03060a"; ctx.fillRect(tm.x, tm.y, tm.w, tm.h);
    ctx.fillStyle = UI.line;
    ctx.fillRect(tm.x, tm.y, tm.w, 1); ctx.fillRect(tm.x, tm.y + tm.h - 1, tm.w, 1);
    ctx.fillRect(tm.x, tm.y, 1, tm.h); ctx.fillRect(tm.x + tm.w - 1, tm.y, 1, tm.h);

    const order = ORDER[this.stage] ?? 0;
    const g = L.graph;
    const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
    const n = Math.max(1, this.keys.length);
    const centers = this.keys.map((_, i) => {
      if (n === 1) return { x: cx, y: cy };
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      return { x: cx + Math.cos(a) * g.w * 0.33, y: cy + Math.sin(a) * g.h * 0.3 };
    });
    // cluster rings once parsing begins
    if (order >= 1) this.keys.forEach((k, i) => {
      const c = centers[i];
      const cnt = this.tiles.filter((t) => t.key === k).length;
      const r = 5 + Math.min(10, Math.sqrt(cnt) * 2);
      ctx.fillStyle = UI.green;
      ring(ctx, c.x, c.y, r, 2, now * 3 + i);
      drawGlow(ctx, c.x, c.y, UI.green, r + 5, 0.12 + (order >= 2 ? 0.1 * Math.sin(now * 4 + i) : 0));
      tx.text(k.split("/").pop() || k, c.x, c.y + r + 1.5, { size: 5.5, min: 9, color: brighten(UI.green, 0.3), align: "center", bg: "rgba(3,8,6,0.65)" });
    });
    for (const t of this.tiles) {
      if (now < t.born) continue;
      const src = L.wide ? { x: tm.x + tm.w - 4, y: tm.y + tm.h * 0.75 } : { x: st.x + t.hx * st.w, y: st.y - 4 };
      const heap = { x: g.x + 6 + t.hx * (g.w - 12), y: g.y + g.h * 0.15 + t.hy * g.h * 0.75 };
      const fk = ease.out(clamp01((now - t.born) / 0.35));
      let x = src.x + (heap.x - src.x) * fk, y = src.y + (heap.y - src.y) * fk - Math.sin(fk * Math.PI) * 18;
      const ci = this.keys.indexOf(t.key);
      if (order >= 1 && ci >= 0) {
        const c = centers[ci];
        const a = t.seed * Math.PI * 2 + now * 0.5;
        const rr = 3 + t.hx * 9;
        const pk = ease.inOut(clamp01((now - Math.max(t.born + 0.35, this.start)) / 0.6));
        x += (c.x + Math.cos(a) * rr - x) * pk; y += (c.y + Math.sin(a) * rr * 0.8 - y) * pk;
      }
      const fresh = now - t.born < 0.12;
      ctx.fillStyle = fresh ? "#ffffff" : t.color;
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 2, 3, 4);
      if (fresh) drawGlow(ctx, x, y, t.color, 4, 0.6);
    }
    // scanning sweep while we wait: the analyzer is alive
    const sweepY = st.y + ((now * 40) % st.h);
    ctx.fillStyle = "rgba(57,255,136,0.08)";
    ctx.fillRect(st.x + 1, Math.round(sweepY), st.w - 2, 1);
    tx.text(`${NOTE[this.stage] ?? this.stage}${".".repeat(1 + (Math.floor(now * 3) % 3))}`, st.x + st.w / 2, st.y + st.h - tx.lineH(7, "term", 11) - 3,
      { size: 7, min: 11, color: UI.amber, align: "center", glow: UI.amber });
    tx.text(`${this.tiles.length} files seen`, st.x + 5, st.y + 4, { size: 5.5, min: 9, color: UI.dim });

    // terminal
    const lh = tx.lineH(L.termSize, "term", 10);
    const top = tm.y + (L.wide ? 9 : 2);
    const rows = Math.max(1, Math.floor((tm.h - (L.wide ? 11 : 4)) / lh)) - 1;
    const shown = this.log.filter((l) => l.t <= now).slice(-rows);
    shown.forEach((l, i) => tx.text(l.text, tm.x + 3, top + i * lh, { size: L.termSize, min: 10, color: l.color, maxW: tm.w - 6 }));
    const bars = Math.max(8, Math.min(24, Math.floor((tm.w - 40) / 5)));
    const fill = Math.round(this.pct * bars);
    tx.text(`[${"#".repeat(fill)}${".".repeat(bars - fill)}] ${Math.round(this.pct * 100)}%`, tm.x + 3, top + shown.length * lh,
      { size: L.termSize, min: 10, color: UI.green, maxW: tm.w - 6 });

    // header
    const h = L.header;
    ctx.fillStyle = "#03060a"; ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.fillStyle = UI.line; ctx.fillRect(h.x, h.y + h.h - 1, h.w, 1);
    ctx.fillStyle = UI.green; ctx.fillRect(h.x, h.y + h.h - 1, Math.round(h.w * this.pct), 1);
    const size = L.compact ? 6 : 7;
    const yy = h.y + (h.h - tx.lineH(size, "term", 10)) / 2;
    let x = h.x + 4;
    if (!L.compact) x += tx.text(this.kind === "boss" ? "BOSS GENESIS" : "HERO GENESIS", x, yy, { size, min: 10, color: this.kind === "boss" ? UI.red : UI.cyan }) + 6;
    x += tx.text(this.slug, x, yy, { size, min: 10, color: UI.text, maxW: h.w * 0.35 }) + 8;
    const names = L.W < 300 ? ["cln", "prs", "grf", "map", "asm", "go"] : (STAGES as string[]);
    const sep = " › ";
    const total = names.reduce((s, nm) => s + tx.measure(nm, size, "term", 10), 0) + tx.measure(sep, size, "term", 10) * (names.length - 1);
    let px = Math.max(x, h.x + h.w - 4 - total);
    names.forEach((nm, i) => {
      const on = i === order;
      px += tx.text(nm, px, yy, { size, min: 10, color: on ? (Math.floor(now * 4) % 2 ? UI.green : UI.text) : i < order ? UI.greenD : UI.dimmer, glow: on ? UI.green : null });
      if (i < names.length - 1) px += tx.text(sep, px, yy, { size, min: 10, color: UI.dimmer });
    });
  }
}
