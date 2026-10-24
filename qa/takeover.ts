import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { devURL, request, sleep, until } from './common.ts';

const base = devURL();
const output = `qa/artifacts/takeover-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
const counts = [{ welcomes: 0, sockets: 0 }, { welcomes: 0, sockets: 0 }];
const errors: string[] = [];
function observe(page: Page, index: number) {
  page.on('websocket', socket => {
    if (new URL(socket.url()).pathname !== '/ws') return;
    counts[index].sockets++;
    socket.on('framereceived', frame => {
      const msg = JSON.parse(frame.payload.toString());
      if (msg.t === 'welcome') counts[index].welcomes++;
      if (msg.t === 'error') errors.push(msg.message);
    });
  });
}
let failure: string | undefined;
try {
  const { room } = await (await request('/api/room', 'POST')).json() as { room: string };
  const context = await browser.newContext();
  const original = await context.newPage(); observe(original, 0);
  await original.goto(new URL(`/r/${room}`, base).href);
  await original.getByTestId('player-name').fill('QA duplicate'); await original.getByTestId('join-room').click();
  await until(() => counts[0].welcomes > 0, 'original joined');
  const before = counts[0].welcomes;
  const duplicate = await context.newPage(); observe(duplicate, 1);
  await duplicate.goto(original.url());
  await until(() => counts[1].welcomes > 0, 'duplicate resumed shared localStorage token');
  await sleep(2200);
  await original.screenshot({ path: `${output}/original.png` });
  await duplicate.screenshot({ path: `${output}/duplicate.png` });
  assert.equal(counts[0].welcomes, before, 'Displaced original tab should not repeatedly steal session back');
} catch (error) { failure = String(error); console.log(failure); process.exitCode = 1; }
finally {
  await browser.close();
  writeFileSync(`${output}/summary.json`, JSON.stringify({ target: base.origin, counts, errors, failure }, null, 2));
  console.log(JSON.stringify({ counts, evidence: `${output}/summary.json` }));
}
