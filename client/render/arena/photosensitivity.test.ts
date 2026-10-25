// Photosensitivity (WCAG 2.3.1): render the real arena / boss / events / postfx through a crit storm in headless
// Chromium and measure every frame. No frame may change the mean luminance by more than 10 % or turn more than 25 % of
// the pixels near-white. A positive control (the old full-screen white flash) proves the detector catches a flash.
// Skips itself when no Chromium can be launched.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";

const HERE = fileURLToPath(new URL(".", import.meta.url));

// runs in the page: a dark arena + boss, a storm of crits / limb breaks / phase changes, per-frame luminance stats
const ENTRY = `
import { bossKitFromProfile } from "../../../sim/kits.ts";
import { drawBoss } from "../boss/index.ts";
import { drawEvents, drawPostFx, getFxCues } from "./index.ts";
const profile = { slug: "storm/repo", description: "", stars: 1, primaryLanguage: "TypeScript", languages: { TypeScript: 1 }, totalFiles: 50, totalLoc: 40000,
  commits: 10, contributors: 3, ageDays: 300, heart: "src/index", heartFanIn: 4, maxDepth: 4, testRatio: 0.1, seed: 4242, fallback: true,
  components: ["src", "lib", "core", "utils", "test", "api"].map((name, i) => ({ name, files: 10, loc: 3000 - i * 300, fanIn: 2, fanOut: 2 })), edges: [], cycles: [] };
function lum(d) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  let sum = 0, white = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
    sum += y; if (y > 0.8) white++;
  }
  const n = d.length / 4;
  return { mean: sum / n, white: white / n };
}
window.runStorm = (opts) => {
  const S = 2, W = 480, H = 288;
  const c = document.createElement("canvas"); c.width = W * S; c.height = H * S;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const kit = bossKitFromProfile(profile, 4);
  const boss = { x: 330, y: 140, hp: kit.maxHp, maxHp: kit.maxHp, phase: 1, enraged: false, limbs: kit.limbs.map((l) => ({ id: l.id, hp: l.maxHp, maxHp: l.maxHp, broken: false })),
    casting: null, targetPlayer: null, regions: [], kit, pose: { name: "idle", t: 0, total: 1, dir: [-1, 0] }, airborne: false };
  const out = [];
  let li = 0;
  for (let f = 0; f < opts.frames; f++) {
    const t = f / 30;
    const ev = [];
    // three heavy crits on the boss every frame, a hit on a hero every 0.3 s
    for (let k = 0; k < 3; k++) ev.push({ type: "hit", target: "boss", limb: boss.limbs[(f + k) % boss.limbs.length].id, amount: 60, x: 300 + k * 10, y: 120, crit: true, impact: 0.9, combo: 4, source: "p0" });
    if (f % 9 === 0) ev.push({ type: "hit", target: "p0", amount: 2, x: 120, y: 150, source: "boss", impact: 0.8 });
    if (f % 15 === 0) ev.push({ type: "obstacleBroken", id: f, label: "src/x.ts", x: 200, y: 200 });
    if (f % 21 === 0 && li < boss.limbs.length) { const l = boss.limbs[li++]; l.broken = true; l.hp = 0; ev.push({ type: "limbBroken", limb: l.id, by: "p0" }); }
    if (f === 60 || f === 150) { boss.phase = f === 60 ? 2 : 3; boss.enraged = true; ev.push({ type: "phase", phase: boss.phase }); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0b0a14"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.fillStyle = "#1a1730"; for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 ? 16 : 0; x < W; x += 32) ctx.fillRect(x, y, 16, 16);
    drawBoss(ctx, boss, t);
    drawEvents(ctx, ev, t);
    drawPostFx(ctx, t, getFxCues().shake);
    if (opts.control && f % 15 === 7) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.9; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); ctx.globalAlpha = 1; }
    out.push(lum(ctx.getImageData(0, 0, c.width, c.height).data));
  }
  return out;
};
`;

let browser: Browser | null = null;
let page: Awaited<ReturnType<Browser["newPage"]>> | null = null;

beforeAll(async () => {
  try { browser = await chromium.launch(); } catch {
    try { browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] }); } catch { browser = null; }
  }
  if (!browser) return;
  const js = await build({ stdin: { contents: ENTRY, resolveDir: HERE, loader: "ts", sourcefile: "storm.ts" }, bundle: true, write: false, format: "iife", platform: "browser", target: "es2022", logLevel: "silent" });
  page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ content: js.outputFiles[0].text });
}, 60_000);
afterAll(async () => { await browser?.close(); });

type Stat = { mean: number; white: number };
const worst = (s: Stat[]) => ({
  jump: Math.max(...s.slice(1).map((x, i) => Math.abs(x.mean - s[i].mean))),
  white: Math.max(...s.map((x) => x.white)),
});

describe("postfx photosensitivity (WCAG 2.3.1)", () => {
  it("a crit storm never flashes: mean luminance steps <= 10 %, near-white pixels <= 25 % per frame", async (ctx) => {
    if (!page) return ctx.skip();
    const stats = (await page.evaluate((o) => (window as unknown as { runStorm: (o: unknown) => Stat[] }).runStorm(o), { frames: 255 })) as Stat[];
    const w = worst(stats);
    expect(w.jump, `max frame-to-frame mean luminance change ${w.jump.toFixed(3)}`).toBeLessThanOrEqual(0.1);
    expect(w.white, `max near-white share ${w.white.toFixed(3)}`).toBeLessThanOrEqual(0.25);
  }, 120_000);

  it("the detector catches a full-screen white flash (positive control)", async (ctx) => {
    if (!page) return ctx.skip();
    const stats = (await page.evaluate((o) => (window as unknown as { runStorm: (o: unknown) => Stat[] }).runStorm(o), { frames: 45, control: true })) as Stat[];
    const w = worst(stats);
    expect(w.jump).toBeGreaterThan(0.1);
    expect(w.white).toBeGreaterThan(0.25);
  }, 120_000);
});
