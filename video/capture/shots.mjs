// Pitch-video captures. Usage: node shots.mjs <shot> [<shot> ...]   (or "all")
// Every shot writes video/raw/<name>.mp4 (+ .json timing). Mock shots need no server; raid/classroom use DEV :5175.
// SHORT=1 trims every take to a few seconds (selector smoke test, not footage).
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { browser, newPage, record, BASE, DESK, PHONE, sleep, RAW } from "./rec.mjs";

const SHORT = !!process.env.SHORT;
const dur = (s) => (SHORT ? Math.min(s, 4) : s) * 1000;
const safe = async (label, f) => { try { return await f(); } catch (e) { console.log("step failed:", label, e.message.split("\n")[0]); } };

// one take of a URL on the 1920x1080 desktop canvas
async function take(name, url, seconds, { settle = 0, before } = {}) {
  const b = await browser(1.5);
  const p = await newPage(b, DESK, "hackpsu");
  if (settle) { await p.goto(BASE + url); await before?.(p); await sleep(settle * 1000); }
  const stop = await record(p, name);
  if (!settle) await p.goto(BASE + url);
  await sleep(dur(seconds));
  await stop(); await b.close();
}

// Frame-stepped take: the page runs on Playwright's paused fake clock and advances exactly 1/30 s per frame, so the
// game (CPU-bound at ~20 fps when drawing 1080p live) comes out perfectly smooth. Only for pages whose whole game
// loop runs in the browser (mock transport, genesis demo).
async function stepTake(name, url, seconds, { warm = 5 } = {}) {
  const b = await browser(1.5);
  const p = await newPage(b, DESK, "hackpsu");
  const T0 = new Date("2026-10-25T12:00:00Z").getTime();
  await p.clock.install({ time: T0 });
  await p.clock.pauseAt(T0 + 1000);
  await p.goto(BASE + url);
  for (let i = 0; i < warm * 10; i++) { await p.clock.runFor(100); await sleep(15); }
  const dir = `${RAW}${name}.frames/`; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const n = Math.round(dur(seconds) / 1000 * 30);
  for (let i = 0; i < n; i++) {
    await p.clock.runFor(1000 / 30);
    await p.screenshot({ path: `${dir}${String(i).padStart(5, "0")}.jpg`, type: "jpeg", quality: 93 });
  }
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", "30", "-i", `${dir}%05d.jpg`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", `${RAW}${name}.mp4`]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`step ${name}: ${n} frames`);
  await b.close();
}

const GEN = "/client/genesis/demo.html";
const SHOTS = {
  // 0/1 · genesis: flask compiles into the boss, ripgrep into the hero
  "genesis-boss": () => take("genesis-boss", `${GEN}?repo=pallets/flask&kind=boss&layout=desktop`, 26),
  "genesis-hero": () => take("genesis-hero", `${GEN}?repo=burntsushi/ripgrep&kind=hero&layout=desktop`, 22),
  // 2 · archetypes (only the reveal is used)
  "arch": () => Promise.all([["kaiju", "lodash/lodash"], ["hydra", "django/django"], ["mecha", "spring-projects/spring-petclinic"], ["abyssal", "redis/redis"]]
    .map(([a, r]) => take(`arch-${a}`, `${GEN}?repo=${r}&kind=boss&layout=desktop&arch=${a}`, 24))),
  // 2 · raid b-roll (real sim, mock transport)
  "match": () => stepTake("match", "/r/ABCD?mock=match", 48),
  "review": () => stepTake("review", "/r/ABCD?mock=review", 16),
  // 3 · autopsy / adopt an organ
  "autopsy": () => take("autopsy", "/r/ABCD?mock=autopsy", 14),
  // 4 · royale
  "royale-lobby": () => stepTake("royale-lobby", "/r/ABCD?mock=royale-lobby", 10),
  "royale": () => stepTake("royale", "/r/ABCD?mock=royale&real=1", 45),
  "royale-zone": () => stepTake("royale-zone", "/r/ABCD?mock=royale", 30),
  "royale-autopsy": () => take("royale-autopsy", "/r/ABCD?mock=royale-autopsy", 12),
  // 2 · phone + big screen, one real room
  "raid-split": raidSplit,
  // 5 · classroom
  "classroom": classroom,
};

// ---------- phone as controller: a real room with synthetic motion sensors ----------
// The page-side choreography is deterministic in t (seconds since it started) so the edit can tilt the phone
// frame exactly like the sensors did: gamma = 14·sin(2πt/6), beta = 10·sin(2πt/4.3); swing every 0.8 s;
// twist every 7 s.
const CHOREO = `(() => {
  if (window.__choreo) return;
  const t0 = performance.now();
  window.__choreo = { t0wall: Date.now() };
  const fire = (type, init) => { const e = new Event(type); Object.assign(e, init); window.dispatchEvent(e); };
  let lastSwing = -1, lastTwist = -1;
  setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    const gamma = 14 * Math.sin(2 * Math.PI * t / 6), beta = 10 * Math.sin(2 * Math.PI * t / 4.3);
    fire("deviceorientation", { alpha: 0, beta, gamma, absolute: false });
    const sw = Math.floor(t / 0.8), inSwing = t % 0.8 < 0.06;
    const tw = t % 7, inTwist = tw > 3 && tw < 3.24;
    const ax = inSwing ? 22 : 0;
    const rot = inTwist ? (tw < 3.12 ? 320 : -320) : 0;
    fire("devicemotion", { acceleration: { x: ax, y: 0, z: 0 }, accelerationIncludingGravity: { x: ax, y: 0, z: 9.81 },
      rotationRate: { alpha: rot, beta: 0, gamma: 0 }, interval: 16 });
  }, 16);
})()`;

async function raidSplit() {
  const pb = await browser(2), bb = await browser(1); // big screen at 1280x720 @1: ~40 fps live (1.5x only manages ~18)
  const P = await newPage(pb, PHONE, "you");
  await P.goto(BASE + "/"); await P.getByTestId("create-room").tap();
  await P.getByTestId("player-repo-input").waitFor();
  const room = P.url().match(/\/r\/(\w+)/)[1]; console.log("raid room", room);
  const B = await newPage(bb, { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await B.goto(`${BASE}/r/${room}?screen=1`);
  await P.getByTestId("player-repo-input").fill("burntsushi/ripgrep"); await P.getByTestId("player-repo-submit").tap();
  await P.getByTestId("boss-repo-input").fill("pallets/flask"); await P.getByTestId("boss-repo-submit").tap();
  await P.locator("[data-testid=player-ready][data-status=ready]").waitFor({ timeout: 90000 });
  await P.locator("[data-testid=boss-ready][data-status=ready]").waitFor({ timeout: 90000 });
  for (let i = 0; i < 3; i++) { await P.getByTestId("bots-plus").tap(); await sleep(400); }
  await safe("motion", async () => { await P.getByTestId("controls-motion").tap({ timeout: 4000 }); });
  await P.evaluate(CHOREO);
  await P.waitForFunction(() => !document.querySelector("[data-testid=start-match]")?.disabled, null, { timeout: 40000 });
  await sleep(1500);
  const stopP = await record(P, "raid-phone"), stopB = await record(B, "raid-big");
  const choreoWall = await P.evaluate(() => window.__choreo.t0wall);
  await sleep(1500);
  await P.getByTestId("start-match").tap();
  await sleep(dur(42));
  await stopP(); await stopB();
  writeFileSync(`${RAW}raid-choreo.json`, JSON.stringify({ choreoWall }));
  await pb.close(); await bb.close();
}

// ---------- classroom: teacher console + projector window + students on phones ----------
async function classroom() {
  const tb = await browser(1.5), pb = await browser(1.5), sb = await browser(2);
  const T = await newPage(tb, DESK);
  await T.goto(BASE + "/"); await T.getByTestId("create-classroom").click();
  await T.waitForURL(/\/r\/\w+/); await sleep(2500);
  const room = T.url().match(/\/r\/(\w+)/)[1]; console.log("class room", room);
  const stopT = await record(T, "class-teacher");
  const mark = (label) => console.log(`mark ${label} ${((Date.now() - t0) / 1000).toFixed(2)}`);
  const t0 = Date.now();
  await sleep(1500);
  await safe("preset", async () => { await T.getByTestId("classroom-preset-library").scrollIntoViewIfNeeded(); await sleep(1800); });
  mark("use-lesson");
  await safe("use", () => T.getByTestId("classroom-preset-use").click({ timeout: 4000 }));
  await sleep(2000);
  await T.evaluate(() => document.querySelector(".classroom-screen")?.scrollTo({ top: 0, behavior: "smooth" }));
  // the class-facing projector window (no names, scores or feedback)
  const P = await newPage(pb, DESK);
  await P.goto(`${BASE}/r/${room}?screen=1&view=projector`); await sleep(2500);
  const stopP = await record(P, "class-projector");
  mark("projector");
  const S = [];
  for (const n of ["maya", "leo", "sam", "ivy"]) { const p = await newPage(sb, PHONE, n); await p.goto(`${BASE}/r/${room}`); S.push(p); await sleep(900); }
  await sleep(2500);
  mark("start");
  await safe("start", () => T.getByTestId("classroom-start").click({ timeout: 5000 }));
  await sleep(2000);
  const M = S[0];
  await safe("scroll editor", () => M.evaluate(() => document.querySelector("[data-testid=classroom-inapp]")?.scrollIntoView({ block: "start" })));
  await sleep(500);
  const stopM = await record(M, "class-phone");
  const tm = Date.now(); const markM = (l) => console.log(`phone ${l} ${((Date.now() - tm) / 1000).toFixed(2)}`);
  await sleep(1000);
  markM("type");
  await safe("type", async () => {
    const ta = M.locator(".cr-inapp textarea").first();
    // focus without a tap and type above the starter's long "# TODO" comment, so the editor never scrolls sideways
    const left = () => ta.evaluate((el) => { el.scrollLeft = 0; el.dispatchEvent(new Event("scroll")); });
    await ta.evaluate((el) => { el.focus({ preventScroll: true }); const i = el.value.indexOf("# TODO"); const at = i < 0 ? el.value.length : i; el.setSelectionRange(at, at); });
    await left();
    for (const line of ['print("Hello, Python!")', 'print(f"I am {name}, {age}")']) {
      for (const ch of line) { await M.keyboard.type(ch); await left(); await sleep(40); }
      await M.keyboard.press("Enter"); await left();
    }
  });
  await sleep(700);
  markM("run");
  await safe("run", () => M.getByTestId("classroom-run").tap());
  await M.waitForFunction(() => /Hello, Python!/.test(document.querySelector("[data-testid=classroom-run-output]")?.textContent ?? ""), null, { timeout: 30000 }).catch(() => console.log("run output not seen"));
  await sleep(2000);
  markM("submit");
  await safe("submit", () => M.getByTestId("classroom-submit-code").tap());
  // only leo also submits (his untouched starter): a partial hit, so the shared boss survives the first attack
  await safe("leo submit", () => S[1].getByTestId("classroom-submit-code").tap());
  await sleep(3500);
  markM("feedback");
  await safe("feedback", () => M.evaluate(() => document.querySelector("[data-testid=classroom-feedback]")?.scrollIntoView({ block: "start", behavior: "smooth" })));
  await sleep(dur(6));
  await stopM();
  mark("review");
  await safe("open maya", () => T.locator(".cr-student", { hasText: "maya" }).first().click({ timeout: 4000 }));
  await sleep(1200);
  await safe("scroll review", () => T.evaluate(() => document.querySelector("[data-testid=classroom-feedback]")?.scrollIntoView({ block: "start", behavior: "smooth" })));
  await sleep(dur(4));
  await safe("code view", () => T.getByTestId("classroom-code-view").locator("summary").click({ timeout: 3000 }));
  await sleep(dur(3));
  mark("attack");
  await safe("attack", () => T.getByTestId("classroom-attack").click({ timeout: 5000 }));
  await sleep(dur(14));
  await stopP(); await stopT();
  await tb.close(); await pb.close(); await sb.close();
}

const want = process.argv.slice(2);
const list = want.includes("all") ? Object.keys(SHOTS) : want;
for (const k of list) {
  if (!SHOTS[k]) { console.log("unknown shot", k, "· have:", Object.keys(SHOTS).join(" ")); continue; }
  const t = Date.now(); await SHOTS[k](); console.log(`✓ ${k} in ${((Date.now() - t) / 1000).toFixed(0)}s`);
}
