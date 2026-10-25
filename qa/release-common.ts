import type { Page } from 'playwright';
import type { LobbyState, MatchState, ServerMsg } from '../shared/types';
import { completeLandingOnboarding } from '../tools/onboarding';

export const releaseBase = 'http://localhost:5191';
export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export interface Traffic { lobby?: LobbyState; snapshot?: MatchState; id?: string; autopsy?: Extract<ServerMsg, { t: 'autopsy' }>['result']; hits: number; crits: number; errors: string[]; selections: unknown[] }
export function observe(page: Page): Traffic {
  const t: Traffic = { hits: 0, crits: 0, errors: [], selections: [] };
  page.on('pageerror', error => t.errors.push(error.stack ?? error.message));
  page.on('console', msg => { if (msg.type() === 'error') t.errors.push(msg.text()); });
  page.on('websocket', socket => {
    if (new URL(socket.url()).pathname !== '/ws') return;
    socket.on('framereceived', frame => {
      const m = JSON.parse(frame.payload.toString()) as ServerMsg;
      if (m.t === 'welcome') { t.id = m.you; t.lobby = m.lobby; }
      if (m.t === 'lobby') t.lobby = m.lobby;
      if (m.t === 'snapshot') {
        t.snapshot = m.state;
        for (const event of m.state.events) if (event.type === 'hit') { t.hits++; if (event.crit) t.crits++; }
      }
      if (m.t === 'autopsy') t.autopsy = m.result;
      if (m.t === 'error') t.errors.push(m.message);
    });
  });
  return t;
}
export async function until(test: () => boolean, label: string, ms = 30_000) {
  const end = Date.now() + ms;
  while (!test() && Date.now() < end) await delay(50);
  if (!test()) throw new Error(`Timed out: ${label}`);
}
export async function createBattle(page: Page, t: Traffic, view: '2d' | '25d', bots: number) {
  await page.goto(`${releaseBase}/?view=${view}`);
  await completeLandingOnboarding(page);
  await page.getByTestId('create-room').click();
  await page.waitForURL(/\/r\//);
  if (await page.getByTestId('player-name').isVisible()) {
    await page.getByTestId('player-name').fill('QA_release'); await page.getByTestId('join-room').click();
  }
  await page.getByTestId('player-repo-input').fill('lodash/lodash'); await page.getByTestId('player-repo-submit').click();
  await page.locator('[data-testid="player-ready"][data-status="ready"]').waitFor({ timeout: 60_000 });
  await page.getByTestId('boss-repo-input').fill('expressjs/express'); await page.getByTestId('boss-repo-submit').click();
  await page.locator('[data-testid="boss-ready"][data-status="ready"]').waitFor({ timeout: 60_000 });
  while ((t.lobby?.players.filter(p => p.bot).length ?? 0) < bots) {
    const count = t.lobby?.players.filter(p => p.bot).length ?? 0;
    await page.getByTestId('bots-plus').click();
    await until(() => (t.lobby?.players.filter(p => p.bot).length ?? 0) > count, 'bot added');
  }
  return new URL(page.url()).pathname.split('/')[2];
}
export async function startBattle(page: Page, t: Traffic) {
  await page.getByTestId('start-match').click();
  await page.getByTestId('game-canvas').waitFor();
  await until(() => t.snapshot?.status === 'fighting', 'real fighting snapshot');
}
