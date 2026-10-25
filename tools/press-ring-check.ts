// Regression check (claude-ui): the long-press charging ring must never outlive the fight.
// Bug: a "tap anywhere to continue" on the victory BSOD scheduled the ring (180 ms), the tap advanced to the autopsy,
// destroy() didn't clear the timer, and the ring was appended to <body> forever.
//   PRESS_RING_URL=http://localhost:5175 npx tsx tools/press-ring-check.ts      (mock match, no server state)
// The input module draws its own charge ring on phones (game.ts then skips its ring), so the check removes that
// element first: that's the device path where the bug appeared. Positive control: a long press mid-fight does show it.
import { devices, webkit } from 'playwright';

const base = process.env.PRESS_RING_URL ?? 'http://localhost:5175';
if (/:5173\b/.test(base)) throw new Error('never test against the live server');
const browser = await webkit.launch();
let failed = false;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed = true; };
try {
  const ctx = await browser.newContext({ ...devices['iPhone 15'] });
  await ctx.addInitScript(() => {
    localStorage.setItem('kaiju.name', 'ringcheck'); localStorage.setItem('gitzilla.onboarding.v1', '1');
    sessionStorage.setItem('gitzilla.onboarding.session', '1');
    localStorage.setItem('kaiju.motionProfile', 'tap-only'); localStorage.setItem('kaiju.touchTrained.v1', '1');
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(false, `page error: ${e.message}`));
  await page.goto(`${base}/r/ABCD?mock=match&bosswin=9`);
  await page.waitForTimeout(2500);
  const gate = page.getByTestId('countdown-touch-only'); if (await gate.isVisible().catch(() => false)) await gate.click();
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelectorAll('[data-testid="input-charge"]').forEach((n) => n.remove()));
  // positive control: a long press during the fight shows the ring, and it goes away on release
  const stage = await page.locator('.stage').boundingBox();
  if (!stage) throw new Error('no stage');
  const x = stage.x + stage.width / 2, y = stage.y + stage.height / 2;
  const fire = (type: string) => page.evaluate(([type, x, y]) => {
    const t = document.elementFromPoint(x as number, y as number)!;
    t.dispatchEvent(new PointerEvent(type as string, { bubbles: true, pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: x as number, clientY: y as number }));
  }, [type, x, y]);
  await fire('pointerdown'); await page.waitForTimeout(400);
  check(await page.locator('.press-ring').count() === 1, 'long press mid-fight shows the charging ring (path is live)');
  await fire('pointerup'); await page.waitForTimeout(300);
  check(await page.locator('.press-ring').count() === 0, 'ring removed on release');
  // victory BSOD → tap anywhere → autopsy → no ring after 1 s
  await page.locator('.bsod').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(900); // past the BSOD's 0.6 s arm delay
  await fire('pointerdown'); await page.waitForTimeout(40); await fire('pointerup');
  await page.locator('.screen.autopsy').waitFor({ timeout: 10_000 });
  check(true, 'tap continued to the autopsy');
  await page.waitForTimeout(1000);
  check(await page.locator('.press-ring').count() === 0, 'no .press-ring in the DOM 1 s after the autopsy');
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
