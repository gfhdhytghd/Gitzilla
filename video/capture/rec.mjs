// Headless capture helpers for the pitch video: CDP screencast → JPEG frames with timestamps → CFR 30fps MP4.
import { chromium, webkit } from "../../node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
// The capture browser serves the public origin from the local dev server (--host-rules), so every join link,
// QR code and ssh prompt says gitzilla.wilflin.me while nothing touches the live site.
export const PUBLIC_HOST = "gitzilla.wilflin.me";
export const DEV = process.env.DEV ?? "127.0.0.1:5175";
export const BASE = process.env.BASE ?? `http://${PUBLIC_HOST}`;
export const RAW = new URL("../raw/", import.meta.url).pathname;
mkdirSync(RAW, { recursive: true });

// Screencast frames come out at CSS px × the *forced* device scale factor, so each browser is launched at one scale:
// desktop 1280x720 @1.5 → 1920x1080, phone 390x844 @2 → 780x1688.
export async function browser(scale = 1.5) {
  return chromium.launch({ headless: true, executablePath: process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`, args: [`--force-device-scale-factor=${scale}`, `--host-rules=MAP ${PUBLIC_HOST} ${DEV}`, `--unsafely-treat-insecure-origin-as-secure=http://${PUBLIC_HOST}`, "--autoplay-policy=no-user-gesture-required", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
}
export const DESK = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 };   // browser(1.5)
export const BIG = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 };     // browser(1)
export const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }; // browser(2)

export async function newPage(b, opts = DESK, name) {
  const c = await b.newContext({ ...opts, locale: "en-US" });
  await c.addInitScript((n) => {
    try {
      if (n) localStorage.setItem("kaiju.name", n);
      localStorage.setItem("gitzilla.onboarding.v1", "1");
      sessionStorage.setItem("gitzilla.onboarding.session", "1");
    } catch {}
  }, name ?? null);
  const p = await c.newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  p.on("dialog", (d) => d.accept());
  return p;
}

// Start a screencast. Returns stop() → writes RAW/<name>.mp4 (30fps CFR) and returns its duration.
export async function record(page, name, { w, h } = {}) {
  const vp = page.viewportSize();
  const dir = `${RAW}${name}.frames/`;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    const i = frames.length;
    const file = `${dir}${String(i).padStart(6, "0")}.jpg`;
    writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  const dsf = await page.evaluate(() => devicePixelRatio);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: w ?? Math.round(vp.width * dsf), maxHeight: h ?? Math.round(vp.height * dsf), everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  return async function stop() {
    const tEnd = Date.now() / 1000;
    await cdp.send("Page.stopScreencast").catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    if (!frames.length) { console.log("no frames", name); return 0; }
    // concat list with per-frame durations; last frame holds until stop
    let list = "";
    for (let i = 0; i < frames.length; i++) {
      const next = i + 1 < frames.length ? frames[i + 1].t : Math.max(tEnd, frames[i].t + 1 / 30);
      list += `file '${frames[i].file}'\nduration ${Math.max(0.001, next - frames[i].t).toFixed(4)}\n`;
    }
    list += `file '${frames.at(-1).file}'\n`;
    writeFileSync(`${dir}list.txt`, list);
    const out = `${RAW}${name}.mp4`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}list.txt`, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", out]);
    const dur = frames.at(-1).t - frames[0].t;
    console.log(`rec ${name}: ${frames.length} frames over ${dur.toFixed(1)}s (${(frames.length / dur).toFixed(1)} fps) → ${out}`);
    writeFileSync(`${RAW}${name}.json`, JSON.stringify({ frames: frames.length, dur, fps: frames.length / dur, startedWall: t0, firstFrame: frames[0].t }, null, 1));
    rmSync(dir, { recursive: true, force: true });
    return dur;
  };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
