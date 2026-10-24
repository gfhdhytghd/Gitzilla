// Animated pixel mini-diagrams, one per concept (A→B→A loop pulsing, dominoes cascading, a stack overflowing…).
// Drawn on a tiny 64x36 logical canvas, CSS-scaled with nearest-neighbor. Hand-written per concept, no assets.
import type { EduConcept } from "./concepts.ts";

export const DW = 64, DH = 36;

const INK = "#d9ffe9", DIM = "#2b4a52", CY = "#3de8ff", RED = "#ff3355", GRN = "#39ff88", AMB = "#ffb000", YEL = "#ffd23d", MAG = "#ff3d7f", OUT = "#05070a";

// ---------- 3x5 pixel font ----------
const FONT: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
  "5": "111100111001111", "6": "111100111101111", "7": "111001001010010", "8": "111101111101111", "9": "111101111001111",
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
  F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
  K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
  P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
  Z: "111001010100111", "?": "110001010000010", "!": "010010010000010", "<": "001010100010001", ">": "100010001010100",
  "=": "000111000111000", "{": "011010110010011", "}": "110010011010110", "(": "010100100100010", ")": "010001001001010",
  ".": "000000000000010", "-": "000000111000000", "+": "000010111010000", "/": "001001010100100", "#": "101111101111101",
  "@": "010101111100011", ":": "000010000010000", " ": "000000000000000",
};

type G = CanvasRenderingContext2D;

export function pxText(g: G, s: string, x: number, y: number, color: string) {
  g.fillStyle = color;
  let cx = Math.round(x);
  for (const ch of s.toUpperCase()) {
    const f = FONT[ch];
    if (f) for (let i = 0; i < 15; i++) if (f[i] === "1") g.fillRect(cx + (i % 3), Math.round(y) + ((i / 3) | 0), 1, 1);
    cx += 4;
  }
}

const rect = (g: G, x: number, y: number, w: number, h: number, c: string) => {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

function node(g: G, x: number, y: number, c: string, s = 5) {
  const h = s >> 1;
  rect(g, x - h - 1, y - h - 1, s + 2, s + 2, OUT);
  rect(g, x - h, y - h, s, s, c);
  rect(g, x - h, y - h, s - 1, 1, "rgba(255,255,255,.45)");
}

function line(g: G, x0: number, y0: number, x1: number, y1: number, c: string, dash = 0) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, i = 0;
  g.fillStyle = c;
  for (;;) {
    if (!dash || ((i++ / dash) | 0) % 2 === 0) g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Edge between two node centers, trimmed to the node borders, with a dot travelling along it at phase p. */
function edge(g: G, a: [number, number], b: [number, number], c: string, p: number | null = null, pc = INK) {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const ax = a[0] + ux * 4, ay = a[1] + uy * 4, bx = b[0] - ux * 5, by = b[1] - uy * 5;
  line(g, ax, ay, bx, by, c);
  // arrow head: 2 px wings
  rect(g, bx - ux * 1.5 - uy * 1.5, by - uy * 1.5 + ux * 1.5, 1, 1, c);
  rect(g, bx - ux * 1.5 + uy * 1.5, by - uy * 1.5 - ux * 1.5, 1, 1, c);
  if (p !== null) rect(g, ax + (bx - ax) * p - 1, ay + (by - ay) * p - 1, 2, 2, pc);
}

const ph = (t: number, period: number, off = 0) => (((t + off) % period) + period) % period / period;
const blink = (t: number, hz = 2) => Math.floor(t * hz * 2) % 2 === 0;

function person(g: G, x: number, y: number, c: string) {
  rect(g, x - 1, y, 3, 3, "#ffe2ac");
  rect(g, x - 2, y + 3, 5, 4, c);
  rect(g, x - 2, y + 7, 2, 3, DIM);
  rect(g, x + 1, y + 7, 2, 3, DIM);
}

type Draw = (g: G, t: number) => void;

const P = (x: number, y: number): [number, number] => [x, y];

const DRAW: Record<EduConcept, Draw> = {
  "dependency-graph": (g, t) => {
    const n = [P(8, 9), P(30, 6), P(54, 11), P(18, 28), P(44, 28)];
    const es: [number, number][] = [[0, 1], [1, 2], [0, 3], [3, 4], [1, 4], [4, 2]];
    es.forEach(([a, b], i) => edge(g, n[a], n[b], DIM, ph(t, 1.6, i * 0.3), CY));
    n.forEach((p) => node(g, p[0], p[1], CY));
  },
  "fan-in": (g, t) => {
    const c = P(46, 18);
    for (let i = 0; i < 5; i++) edge(g, P(8 + (i % 2) * 8, 4 + i * 7), c, DIM, ph(t, 1.2, i * 0.25), CY);
    for (let i = 0; i < 5; i++) node(g, 8 + (i % 2) * 8, 4 + i * 7, DIM, 4);
    node(g, c[0], c[1], CY, 7 + (blink(t, 1) ? 2 : 0));
  },
  "fan-out": (g, t) => {
    const c = P(14, 18);
    for (let i = 0; i < 5; i++) edge(g, c, P(50 + (i % 2) * 6, 4 + i * 7), DIM, ph(t, 1.2, i * 0.25), CY);
    for (let i = 0; i < 5; i++) node(g, 50 + (i % 2) * 6, 4 + i * 7, DIM, 4);
    node(g, c[0], c[1], AMB, 8);
  },
  "heart-module": (g, t) => {
    const c = P(32, 18);
    const around = [P(8, 6), P(56, 6), P(6, 30), P(58, 30), P(32, 3), P(32, 33)];
    around.forEach((p, i) => edge(g, p, c, DIM, ph(t, 1.4, i * 0.2), RED));
    around.forEach((p) => node(g, p[0], p[1], DIM, 4));
    const beat = ph(t, 0.9) < 0.18 ? 3 : 2;
    const H = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];
    H.forEach((row, y) => [...row].forEach((b, x) => b === "1" && rect(g, c[0] + (x - 3.5) * beat, c[1] + (y - 3) * beat, beat, beat, y === 0 && x < 3 ? "#ff8aa0" : RED)));
  },
  "circular-dependency": (g, t) => {
    const n = [P(14, 9), P(50, 9), P(32, 30)];
    const p = ph(t, 2.4) * 3;
    for (let i = 0; i < 3; i++) edge(g, n[i], n[(i + 1) % 3], RED, Math.floor(p) === i ? p % 1 : null, YEL);
    n.forEach((q, i) => {
      node(g, q[0], q[1], i === Math.floor(p) ? YEL : RED, 7);
      pxText(g, "ABC"[i], q[0] - 1, q[1] - 2, OUT);
    });
  },
  coupling: (g, t) => {
    const L = [P(10, 8), P(8, 18), P(12, 28)], R = [P(54, 8), P(56, 18), P(52, 28)];
    L.forEach((a, i) => R.forEach((b, j) => edge(g, a, b, (i + j + Math.floor(t * 3)) % 3 === 0 ? AMB : DIM)));
    [...L, ...R].forEach((p) => node(g, p[0], p[1], CY, 5));
  },
  component: (g, t) => {
    line(g, 6, 4, 58, 4, CY, 2); line(g, 6, 32, 58, 32, CY, 2); line(g, 6, 4, 6, 32, CY, 2); line(g, 58, 4, 58, 32, CY, 2);
    pxText(g, "SRC/", 9, 7, CY);
    for (let i = 0; i < 8; i++) {
      const lit = Math.floor(ph(t, 2) * 8) === i;
      rect(g, 10 + (i % 4) * 12, 15 + Math.floor(i / 4) * 8, 8, 5, lit ? INK : DIM);
    }
  },
  cascade: (g, t) => {
    const p = ph(t, 3) * 7;
    for (let i = 0; i < 5; i++) {
      const x = 7 + i * 12.5;
      if (i < 4) edge(g, P(x, 18), P(x + 12.5, 18), Math.floor(p) > i ? RED : DIM);
      const broken = p > i + 0.2;
      node(g, x, 18 + (broken ? 2 : 0), broken ? RED : CY, 6);
      if (broken && blink(t, 3)) pxText(g, "!", x - 1, 7, RED);
    }
  },
  "dead-code": (g, t) => {
    edge(g, P(10, 10), P(30, 10), DIM); edge(g, P(30, 10), P(30, 28), DIM);
    node(g, 10, 10, CY); node(g, 30, 10, CY); node(g, 30, 28, CY);
    const fade = 1 - ph(t, 3);
    g.globalAlpha = 0.25 + fade * 0.75;
    node(g, 50, 20, "#6b7782", 7);
    g.globalAlpha = 1;
    if (blink(t, 1)) pxText(g, "X", 49, 18, RED);
  },
  "tech-debt": (g, t) => {
    pxText(g, "TODO", 4, 4, AMB);
    const k = 1 + Math.floor(ph(t, 4) * 14);
    for (let i = 0; i < k; i++) {
      const x = 8 + ((i * 17) % 48), y = 14 + ((i * 11) % 18), wig = Math.sin(t * 8 + i) > 0 ? 1 : 0;
      rect(g, x, y + wig, 3, 2, i % 3 ? AMB : RED);
      rect(g, x - 1, y + 2 - wig, 1, 1, AMB); rect(g, x + 3, y + 1 + wig, 1, 1, AMB);
    }
    rect(g, 26, 4, Math.min(34, k * 2.4), 5, RED);
  },
  "test-coverage": (g, t) => {
    const k = Math.floor(ph(t, 3.5) * 11);
    for (let i = 0; i < 10; i++) {
      const x = 4 + (i % 5) * 9, y = 7 + Math.floor(i / 5) * 13;
      rect(g, x, y, 7, 9, DIM);
      if (i < k) { rect(g, x + 1, y + 5, 1, 1, GRN); rect(g, x + 2, y + 6, 1, 1, GRN); rect(g, x + 3, y + 5, 1, 1, GRN); rect(g, x + 4, y + 4, 1, 1, GRN); rect(g, x + 5, y + 3, 1, 1, GRN); }
    }
    // shield fills with coverage
    const S = ["1111111", "1111111", "1111111", "0111110", "0011100"];
    S.forEach((row, y) => [...row].forEach((b, x) => b === "1" && rect(g, 50 + x * 2, 9 + y * 3, 2, 3, y * 2 >= 10 - k ? GRN : DIM)));
  },
  recursion: (g, t) => {
    const k = Math.floor(ph(t, 2.5) * 5);
    for (let i = 0; i < 5; i++) {
      const w = 56 - i * 11, h = 30 - i * 6, x = 32 - w / 2, y = 18 - h / 2, c = i === k ? MAG : DIM;
      line(g, x, y, x + w, y, c); line(g, x, y + h, x + w, y + h, c); line(g, x, y, x, y + h, c); line(g, x + w, y, x + w, y + h, c);
    }
    pxText(g, "F()", 27, 16, MAG);
  },
  "stack-overflow": (g, t) => {
    const k = Math.floor(ph(t, 3) * 9);
    line(g, 18, 2, 46, 2, RED, 2);
    for (let i = 0; i < Math.min(k, 7); i++) rect(g, 20, 31 - i * 4, 24, 3, i >= 5 ? AMB : CY);
    if (k >= 7) {
      rect(g, 20, 0, 24, 3, RED);
      if (blink(t, 4)) pxText(g, "!!", 49, 14, RED);
    }
  },
  "race-condition": (g, t) => {
    const p = ph(t, 1.8);
    line(g, 4, 6, 44, 18, DIM); line(g, 4, 30, 44, 18, DIM);
    const a = Math.min(1, p * 1.25), b = Math.min(1, p * 1.12);
    rect(g, 4 + 40 * a - 1, 6 + 12 * a - 1, 3, 3, CY);
    rect(g, 4 + 40 * b - 1, 30 - 12 * b - 1, 3, 3, MAG);
    rect(g, 46, 13, 13, 11, OUT); line(g, 46, 13, 58, 13, AMB); line(g, 46, 23, 58, 23, AMB);
    pxText(g, p > 0.9 ? "2" : p > 0.8 ? "1" : "?", 51, 16, p > 0.9 ? MAG : p > 0.8 ? CY : AMB);
  },
  "memory-leak": (g, t) => {
    const k = Math.floor(ph(t, 4) * 13);
    pxText(g, "RAM", 4, 4, INK);
    for (let i = 0; i < 12; i++) rect(g, 4 + i * 5, 14, 4, 10, i < k ? (i >= 9 ? RED : "#b48cff") : DIM);
    const d = ph(t, 0.8);
    rect(g, 4 + Math.min(k, 11) * 5 + 1, 24 + d * 8, 2, 2, "#b48cff");
  },
  "merge-conflict": (g, t) => {
    line(g, 4, 18, 18, 18, CY); line(g, 18, 18, 30, 7, MAG); line(g, 18, 18, 30, 29, YEL);
    line(g, 30, 7, 44, 7, MAG); line(g, 30, 29, 44, 29, YEL); line(g, 44, 7, 52, 18, MAG); line(g, 44, 29, 52, 18, YEL);
    [P(10, 18), P(30, 7), P(40, 7), P(30, 29), P(40, 29)].forEach((p, i) => node(g, p[0], p[1], i === 0 ? CY : i < 3 ? MAG : YEL, 4));
    if (blink(t, 2)) pxText(g, "X", 51, 16, RED); else node(g, 52, 18, RED, 5);
  },
  "force-push": (g, t) => {
    const p = ph(t, 3);
    line(g, 4, 18, 60, 18, DIM);
    const wipe = 4 + Math.max(0, p - 0.3) * 1.4 * 56;
    for (let i = 0; i < 6; i++) {
      const x = 8 + i * 10;
      if (x > wipe || p < 0.3) node(g, x, 18, i < 3 ? CY : GRN, 4);
    }
    if (p > 0.3) {
      rect(g, wipe - 6, 10, 6, 16, RED);
      pxText(g, "-F", wipe - 18, 4, RED);
    }
  },
  "dependency-hell": (g, t) => {
    node(g, 32, 6, CY, 6);
    edge(g, P(32, 6), P(14, 20), DIM); edge(g, P(32, 6), P(50, 20), DIM);
    node(g, 14, 20, CY, 5); node(g, 50, 20, CY, 5);
    edge(g, P(14, 20), P(22, 31), DIM); edge(g, P(50, 20), P(42, 31), DIM);
    const flash = blink(t, 2);
    pxText(g, "V1", 15, 29, flash ? RED : AMB); pxText(g, "V2", 42, 29, flash ? AMB : RED);
    if (flash) pxText(g, "!=", 28, 29, RED);
  },
  "null-pointer": (g, t) => {
    node(g, 8, 18, CY, 7);
    const tip = 8 + 32 * Math.min(1, ph(t, 2) * 1.6);
    line(g, 13, 18, tip, 18, INK);
    line(g, 44, 9, 60, 9, DIM, 2); line(g, 44, 27, 60, 27, DIM, 2); line(g, 44, 9, 44, 27, DIM, 2); line(g, 60, 9, 60, 27, DIM, 2);
    const hit = tip >= 39;
    pxText(g, "NULL", 45, 16, hit && blink(t, 4) ? RED : DIM);
    if (hit) rect(g, tip, 17, 3, 3, RED);
  },
  "infinite-loop": (g, t) => {
    const a = t * 5;
    for (let i = 0; i < 28; i++) {
      const q = (i / 28) * Math.PI * 2;
      rect(g, 32 + Math.cos(q) * 13, 18 + Math.sin(q) * 13, 1, 1, DIM);
    }
    for (let k = 0; k < 4; k++) rect(g, 31 + Math.cos(a - k * 0.25) * 13, 17 + Math.sin(a - k * 0.25) * 13, 3, 3, k ? AMB : YEL);
    pxText(g, "WHILE", 23, 16, AMB);
  },
  refactor: (g, t) => {
    const p = Math.min(1, ph(t, 3.5) * 1.5), e = p * p * (3 - 2 * p);
    const messy = [P(30, 8), P(12, 26), P(50, 28), P(22, 12), P(44, 10), P(34, 30)];
    const tidy = [P(10, 10), P(32, 10), P(54, 10), P(10, 26), P(32, 26), P(54, 26)];
    const pts = messy.map((m, i) => P(m[0] + (tidy[i][0] - m[0]) * e, m[1] + (tidy[i][1] - m[1]) * e));
    [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3]].forEach(([a, b]) => edge(g, pts[a], pts[b], e > 0.95 ? GRN : DIM));
    pts.forEach((q) => node(g, q[0], q[1], e > 0.95 ? GRN : AMB, 5));
  },
  "bus-factor": (g, t) => {
    rect(g, 6, 6, 16, 10, CY);
    pxText(g, "SRC", 8, 8, OUT);
    person(g, 14, 20, AMB);
    const x = 64 - ph(t, 4) * 90;
    rect(g, x, 20, 24, 10, YEL); rect(g, x + 2, 22, 4, 3, CY); rect(g, x + 8, 22, 4, 3, CY); rect(g, x + 14, 22, 4, 3, CY);
    rect(g, x + 4, 30, 4, 3, OUT); rect(g, x + 17, 30, 4, 3, OUT);
    pxText(g, "1", 26, 8, RED);
  },
  "good-first-issue": (g, t) => {
    rect(g, 6, 5, 52, 26, "#0d1f1a");
    line(g, 6, 5, 58, 5, GRN); line(g, 6, 31, 58, 31, DIM);
    rect(g, 10, 10, 3, 3, GRN);
    rect(g, 16, 10, 30, 3, INK);
    rect(g, 10, 17, 30, 6, blink(t, 1) ? GRN : "#1a8a4a");
    pxText(g, "GOOD 1ST", 11, 17.5, OUT);
    const c = ph(t, 2.5);
    rect(g, 48 - c * 10, 22 + c * 2, 2, 5, INK); rect(g, 48 - c * 10, 22 + c * 2, 4, 2, INK);
  },
  "open-source-maintenance": (g, t) => {
    // the xkcd 2347 tower: everything rests on one tiny block
    const wob = Math.sin(t * 3) > 0.6 ? 1 : 0;
    const rows: [number, number, string][] = [[10, 44, CY], [14, 36, "#2a8fa8"], [20, 30, CY], [26, 22, "#2a8fa8"]];
    rows.forEach(([y, w, c], i) => rect(g, 32 - w / 2 + (i < 3 ? wob : 0), y - 4, w, 5, c));
    rect(g, 30, 27, 4, 4, YEL);
    rect(g, 18, 31, 28, 3, DIM);
    if (blink(t, 1)) pxText(g, "1", 37, 27, YEL);
  },
  "supply-chain": (g, t) => {
    const k = Math.floor(ph(t, 3) * 6);
    for (let i = 0; i < 5; i++) {
      const x = 4 + i * 12;
      if (i < 4) { line(g, x + 8, 17, x + 12, 17, DIM); line(g, x + 8, 19, x + 12, 19, DIM); }
      rect(g, x, 13, 8, 10, i >= 1 && i <= k ? RED : i === 0 ? AMB : CY);
    }
    pxText(g, "PKG", 2, 27, AMB); pxText(g, "APP", 50, 27, CY);
  },
  vulnerability: (g, t) => {
    const fixed = ph(t, 4) > 0.55;
    const S = ["111111111", "111111111", "111111111", "011111110", "001111100", "000111000"];
    S.forEach((row, y) => [...row].forEach((b, x) => b === "1" && rect(g, 14 + x * 2, 4 + y * 4, 2, 4, fixed ? GRN : CY)));
    if (!fixed) { line(g, 22, 4, 20, 12, RED); line(g, 20, 12, 24, 18, RED); line(g, 24, 18, 22, 26, RED); }
    pxText(g, fixed ? "V2" : "V1", 40, 10, fixed ? GRN : RED);
    pxText(g, fixed ? "OK" : "CVE", 40, 20, fixed ? GRN : RED);
  },
  "code-quality": (g, t) => {
    const p = Math.min(1, ph(t, 3) * 1.4);
    pxText(g, "A+", 4, 4, GRN);
    const v = [0.9, 0.6, 0.75, 0.4, 0.85];
    v.forEach((h, i) => rect(g, 24 + i * 7, 32 - h * 26 * p, 5, h * 26 * p, [GRN, CY, YEL, AMB, GRN][i]));
    line(g, 22, 33, 60, 33, DIM);
  },
  modularity: (g, t) => {
    for (let i = 0; i < 6; i++) {
      const j = Math.sin(t * 4 + i * 1.7) > 0.7 ? 1 : 0;
      rect(g, 8 + (i % 3) * 18, 6 + Math.floor(i / 3) * 14 - j, 12, 9, i === Math.floor(ph(t, 2) * 6) ? INK : CY);
    }
    edge(g, P(14, 10), P(32, 10), DIM);
  },
  cohesion: (g, t) => {
    pxText(g, "{", 10, 15, GRN); pxText(g, "}", 51, 15, GRN);
    const p = ph(t, 2.5), e = Math.min(1, p * 1.6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = 22 - e * 14;
      rect(g, 32 + Math.cos(a) * r, 17 + Math.sin(a) * r * 0.55, 2, 2, e > 0.95 ? GRN : CY);
    }
  },
  documentation: (g, t) => {
    rect(g, 14, 2, 36, 32, "#e8e2c8");
    rect(g, 18, 6, 14, 3, MAG);
    const k = Math.floor(ph(t, 3) * 7);
    for (let i = 0; i < k; i++) rect(g, 18, 12 + i * 3, i % 3 === 2 ? 18 : 28, 1, "#4a5560");
    if (blink(t, 2)) rect(g, 18 + (k % 3 === 2 ? 18 : 28), 11 + k * 3, 1, 3, OUT);
  },
  "code-size": (g, t) => {
    const p = Math.min(1, ph(t, 3) * 1.4);
    [0.3, 0.55, 0.8, 1.2, 1.6].forEach((h, i) => {
      const hh = Math.min(h, 0.9) * 28 * p;
      rect(g, 8 + i * 10, 32 - hh, 7, hh, h > 0.9 ? AMB : CY);
    });
    line(g, 4, 6, 60, 6, RED, 2);
    pxText(g, "CAP", 48, 0, RED);
  },
};

/** Draw a concept's diagram frame at time t (seconds). Clears the 64x36 area. */
export function drawDiagram(g: G, concept: string, t: number) {
  g.clearRect(0, 0, DW, DH);
  const d = (DRAW as Record<string, Draw>)[concept];
  if (d) d(g, t);
  else pxText(g, "?", 30, 15, DIM);
}

/** A canvas element for a diagram, registered with the shared animation loop until it leaves the DOM. */
export function diagramCanvas(concept: string, cls = "edu-diagram"): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = DW;
  c.height = DH;
  c.className = cls;
  c.dataset.concept = concept;
  const g = c.getContext("2d")!;
  drawDiagram(g, concept, 0);
  live.add({ c, g, concept, gone: 0 });
  startLoop();
  return c;
}

const live = new Set<{ c: HTMLCanvasElement; g: G; concept: string; gone: number }>();
let raf = 0;
const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
let lastFrame = 0;

function startLoop() {
  if (raf || reduced) return;
  const loop = (now: number) => {
    raf = 0;
    if (!live.size) return;
    // diagrams are tiny pixel scenes: 20 fps is plenty and keeps the game's frame budget free
    if (now - lastFrame > 48) {
      lastFrame = now;
      const t = now / 1000;
      for (const d of live) {
        if (!d.c.isConnected) {
          // detached (not mounted yet, or removed): drop it after a few seconds out of the DOM
          if (!d.gone) d.gone = now;
          else if (now - d.gone > 4000) live.delete(d);
          continue;
        }
        d.gone = 0;
        drawDiagram(d.g, d.concept, t);
      }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

/** Tiny static badge (pixel glyph on the concept color), e.g. for glossary rows. */
export function glyphBadge(glyph: string, color: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "edu-glyph";
  s.textContent = glyph;
  s.style.setProperty("--c", color);
  return s;
}

