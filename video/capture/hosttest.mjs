import { chromium } from "../../node_modules/playwright/index.mjs";
const b = await chromium.launch({ headless: true, executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`,
  args: ["--host-rules=MAP gitzilla.wilflin.me 127.0.0.1:5175", "--unsafely-treat-insecure-origin-as-secure=http://gitzilla.wilflin.me"] });
const p = await (await b.newContext()).newPage();
p.on("pageerror", e => console.log("PAGEERROR", e.message));
await p.goto("http://gitzilla.wilflin.me/r/ABCD?mock=match", { timeout: 20000 });
await p.waitForTimeout(3000);
console.log("origin", await p.evaluate(() => location.origin), "secure", await p.evaluate(() => isSecureContext), "title", await p.title());
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 120).replace(/\s+/g, " "));
await b.close();
