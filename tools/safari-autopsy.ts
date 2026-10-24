// WebKit (Safari) regression check for the autopsy page: it must scroll vertically, never horizontally, and every
// action (REMATCH / new room / leave / share / adopt-an-organ QR) must be reachable.
//
//   npx tsx tools/safari-autopsy.ts                 # mock battle + edu autopsy on iPhone 15, iPhone SE, desktop Safari
//   npx tsx tools/safari-autopsy.ts --real          # also plays a real (bot-filled) battle to its autopsy on DEV
//
// DEV only (default http://localhost:5175, override with SAFARI_URL). Needs Playwright WebKit (`npx playwright install
// webkit`). On non-Ubuntu hosts missing libicu74/libflite, set PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 after placing
// those libs in ~/.cache/ms-playwright/webkit-*/minibrowser-wpe/sys/lib. Exit 1 on any failure.
import { devices, webkit, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { playtestBaseURL } from "./playtest";

const BASE = playtestBaseURL(process.env.SAFARI_URL);
const output = `docs/shots/${new Date().toISOString().replace(/[:.]/g, "-")}-safari-autopsy`;
mkdirSync(output, { recursive: true });
const REAL = process.argv.includes("--real");
const DEVICES: [string, Record<string, unknown>][] = [
  ["iPhone 15", { ...devices["iPhone 15"] }],
  ["iPhone SE", { ...devices["iPhone SE"] }],
  ["Desktop Safari 1440", { viewport: { width: 1440, height: 900 } }],
];

async function check(page: Page, label: string): Promise<string[]> {
  await page.getByTestId("autopsy").waitFor({ timeout: 30_000 });
  await page.locator(".ap-scroll").waitFor({ timeout: 15_000 });
  await page.getByTestId("autopsy-leave").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1500); // share card / reports render async
  const shot = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  await page.screenshot({ path: `${output}/${shot}-top.png` });
  const fails: string[] = [];
  const m = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const sc = document.querySelector<HTMLElement>(".ap-scroll");
    const wide = [...document.querySelectorAll<HTMLElement>(".screen.autopsy *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.right > vw + 1 || r.left < -1) && !e.closest(".backdrop, .crt");
      })
      .slice(0, 5)
      .map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")}`);
    return { vw, docSW: document.documentElement.scrollWidth, scSW: sc?.scrollWidth ?? 0, scCW: sc?.clientWidth ?? 0, scSH: sc?.scrollHeight ?? 0, scCH: sc?.clientHeight ?? 0, wide };
  });
  if (m.docSW > m.vw + 1) fails.push(`${label}: document scrolls horizontally (${m.docSW} > ${m.vw})`);
  if (m.scSW > m.scCW + 1) fails.push(`${label}: autopsy scroller overflows horizontally (${m.scSW} > ${m.scCW})`);
  if (m.wide.length) fails.push(`${label}: elements outside the viewport: ${m.wide.join(", ")}`);
  // every action reachable: scroll it into view inside the scroller and make sure it's fully on screen horizontally
  const actions = ["autopsy-new-room", "autopsy-leave", "rematch", "adopt-organ"];
  for (const id of actions) {
    const loc = page.getByTestId(id);
    if (!(await loc.count())) {
      if (id === "rematch" || id === "adopt-organ") continue; // owner-only / battle-only
      fails.push(`${label}: missing [data-testid=${id}]`);
      continue;
    }
    await loc.first().scrollIntoViewIfNeeded();
    const box = await loc.first().boundingBox();
    if (!box || box.x < -1 || box.x + box.width > m.vw + 1) fails.push(`${label}: ${id} not horizontally reachable`);
  }
  for (const text of ["share ↗", "save card.png"]) {
    const loc = page.getByText(text, { exact: true });
    if (!(await loc.count())) continue;
    await loc.first().scrollIntoViewIfNeeded();
    const box = await loc.first().boundingBox();
    if (!box || box.x + box.width > m.vw + 1) fails.push(`${label}: "${text}" not reachable`);
  }
  console.log(`${fails.length ? "FAIL" : "ok  "} ${label}  vw=${m.vw} scroll=${m.scSH}/${m.scCH}`);
  await page.screenshot({ path: `${output}/${shot}-actions.png` });
  return fails;
}

async function realBattle(page: Page) {
  // create a room as owner, fill with bots, pick fallback repos, start, wait for the natural autopsy
  await page.goto(BASE + "/");
  await page.getByTestId("create-room").click();
  if (await page.getByTestId("player-name").isVisible().catch(() => false)) {
    await page.getByTestId("player-name").fill("safari");
    await page.getByTestId("join-room").click();
  }
  await page.getByTestId("player-repo-input").fill("pallets/flask");
  await page.getByTestId("player-repo-submit").click();
  // This layout regression uses the explicit touch fallback; synthetic browser
  // phones have no real sensors. Motion permission is verified by permission-gate.
  const touch = page.getByTestId("controls-touch");
  if (await touch.isVisible()) await touch.click();
  // no bots: a lone idle owner loses fast, which still produces a real server autopsy
  await page.getByTestId("boss-repo-input").fill("expressjs/express");
  await page.getByTestId("boss-repo-submit").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="boss-ready"]')?.getAttribute("data-status") === "ready", null, { timeout: 60_000 });
  // the phone START bar becomes `start-match` only once everything is ready; retry until the game screen shows
  for (let i = 0; i < 10 && !(await page.getByTestId("game-canvas").isVisible().catch(() => false)); i++) {
    await page.getByTestId("start-match").click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  try {
    await page.getByTestId("autopsy").waitFor({ timeout: 300_000 });
  } catch (e) {
    await page.screenshot({ path: `${output}/real-autopsy-timeout.png` }).catch(() => {});
    throw e;
  }
}

const fails: string[] = [];
const browser = await webkit.launch();
try {
  for (const [name, opts] of DEVICES) {
    for (const mock of ["autopsy", "edu-autopsy"]) {
      const ctx = await browser.newContext(opts);
      await ctx.addInitScript(() => localStorage.setItem("kaiju.name", "safari"));
      const page = await ctx.newPage();
      await page.goto(`${BASE}/r/QAQA?mock=${mock}`);
      fails.push(...(await check(page, `${name} · mock ${mock}`)));
      await ctx.close();
    }
  }
  if (REAL) {
    for (const [name, opts] of DEVICES.slice(0, 1).concat(DEVICES.slice(2))) {
      const ctx = await browser.newContext(opts);
      await ctx.addInitScript(() => localStorage.setItem("kaiju.name", "safari"));
      const page = await ctx.newPage();
      await realBattle(page);
      fails.push(...(await check(page, `${name} · real battle`)));
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
if (fails.length) {
  writeFileSync(`${output}/summary.json`, JSON.stringify({ base: BASE, real: REAL, pass: false, fails }, null, 2));
  console.error(fails.join("\n"));
  process.exit(1);
}
writeFileSync(`${output}/summary.json`, JSON.stringify({ base: BASE, real: REAL, pass: true, fails,
  evidence: "WebKit emulation; real battles use explicit touch fallback. Physical Safari and native sensor dialogs unverified." }, null, 2));
console.log("safari autopsy: no horizontal overflow, all actions reachable");
