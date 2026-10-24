// Pure graph helpers for the Genesis cinematic (no DOM): deterministic force layout, cycle edges,
// the longest import chain, and path -> component matching.

export interface Pt { x: number; y: number }

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Index of the component a path belongs to (longest name prefix), or -1. */
export function componentOf(path: string, comps: { name: string }[]): number {
  let best = -1, len = -1;
  comps.forEach((c, i) => {
    const n = c.name.replace(/\/+$/, "");
    if ((path === n || path.startsWith(n + "/")) && n.length > len) { best = i; len = n.length; }
  });
  return best;
}

/** Edges whose two ends sit in the same reported cycle (strongly connected component). */
export function cycleEdges(comps: { name: string }[], edges: [number, number][], cycles: string[][]): Set<number> {
  const group = new Map<string, number>();
  cycles.forEach((cy, gi) => cy.forEach((n) => group.set(n, gi)));
  const out = new Set<number>();
  edges.forEach(([a, b], i) => {
    const ga = group.get(comps[a]?.name ?? ""), gb = group.get(comps[b]?.name ?? "");
    if (ga !== undefined && ga === gb) out.add(i);
  });
  return out;
}

/** Longest simple import chain as a node list (DFS, graphs are tiny: <= 8 nodes). */
export function longestChain(n: number, edges: [number, number][]): number[] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) if (a !== b && a < n && b < n) adj[a].push(b);
  let best: number[] = [];
  const seen = new Array(n).fill(false);
  const path: number[] = [];
  const dfs = (u: number) => {
    seen[u] = true; path.push(u);
    if (path.length > best.length) best = path.slice();
    for (const v of adj[u]) if (!seen[v]) dfs(v);
    path.pop(); seen[u] = false;
  };
  for (let i = 0; i < n; i++) dfs(i);
  return best.length > 1 ? best : [];
}

/**
 * Deterministic force-directed layout inside a w x h box centered on (0,0).
 * Radii keep nodes apart; edges pull; a weak center gravity keeps the cloud framed.
 */
export function forceLayout(radii: number[], edges: [number, number][], w: number, h: number, seed: number, start?: Pt[]): Pt[] {
  const n = radii.length;
  const R = rng(seed ^ 0x9e3779b9);
  const p: Pt[] = start ? start.map((q) => ({ ...q })) : radii.map((_, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + R() * 0.5;
    return { x: Math.cos(a) * w * 0.3, y: Math.sin(a) * h * 0.3 };
  });
  const ideal = Math.min(w, h) * 0.42;
  for (let it = 0; it < 260; it++) {
    const cool = 1 - it / 300;
    const f = p.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = p[j].x - p[i].x, dy = p[j].y - p[i].y;
      let d = Math.hypot(dx, dy);
      if (d < 0.01) { dx = R() - 0.5; dy = R() - 0.5; d = 0.5; }
      const min = radii[i] + radii[j] + 14;
      const rep = (ideal * ideal) / (d * d) * 2.2 + (d < min ? (min - d) * 0.9 : 0);
      f[i].x -= (dx / d) * rep; f[i].y -= (dy / d) * rep;
      f[j].x += (dx / d) * rep; f[j].y += (dy / d) * rep;
    }
    for (const [a, b] of edges) {
      if (a === b || a >= n || b >= n) continue;
      const dx = p[b].x - p[a].x, dy = p[b].y - p[a].y;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const k = (d - ideal) * 0.06;
      f[a].x += (dx / d) * k; f[a].y += (dy / d) * k;
      f[b].x -= (dx / d) * k; f[b].y -= (dy / d) * k;
    }
    for (let i = 0; i < n; i++) {
      f[i].x -= p[i].x * 0.03; f[i].y -= p[i].y * 0.045;
      const step = Math.min(6, Math.hypot(f[i].x, f[i].y)) * cool;
      const m = Math.hypot(f[i].x, f[i].y) || 1;
      p[i].x += (f[i].x / m) * step; p[i].y += (f[i].y / m) * step;
      const hx = w / 2 - radii[i] - 4, hy = h / 2 - radii[i] - 4;
      p[i].x = Math.max(-hx, Math.min(hx, p[i].x));
      p[i].y = Math.max(-hy, Math.min(hy, p[i].y));
    }
  }
  return p;
}

/** Points along a cubic bezier (integer pixels, deduped) for pixel-chain wires. */
export function bezierPts(a: Pt, c1: Pt, c2: Pt, b: Pt, steps: number): Pt[] {
  const out: Pt[] = [];
  let lx = NaN, ly = NaN;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const x = Math.round(u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x);
    const y = Math.round(u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y);
    if (x !== lx || y !== ly) out.push({ x, y });
    lx = x; ly = y;
  }
  return out;
}

export const ease = {
  out: (t: number) => 1 - (1 - t) * (1 - t) * (1 - t),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  in: (t: number) => t * t * t,
};

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
