import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { InputFrame, MatchState, PlayerState, RepoProfile } from '../shared/types.ts';
import { bossKitFromProfile, playerKitFromProfile } from './kits.ts';
import { createMatch, WEAPONS } from './match.ts';
import { clamp, distance, random, unit } from './math.ts';

export function syntheticProfile(seed = 1, slug = `demo/repo-${seed}`): RepoProfile {
  const language = ['TypeScript', 'Rust', 'Python', 'Go', 'Java', 'C++', 'Ruby', 'Lua', 'JavaScript', 'C#'][seed % 10];
  const components = Array.from({ length: 3 + seed % 4 }, (_, i) => ({ name: ['src', 'lib', 'core', 'utils', 'test', 'api'][i], files: 9 + (seed * 7 + i * 13) % 60, loc: 2000 - i * 240, fanIn: (seed + i * 3) % 8, fanOut: (seed * 3 + i) % 7 }));
  return { slug, description: 'Deterministic balance fixture', stars: 10000, primaryLanguage: language,
    languages: { [language]: 10000 }, totalFiles: 150, totalLoc: 14000 + seed * 500,
    commits: 500, contributors: 5 + seed, ageDays: seed * 430, components, heart: 'src/index', heartFanIn: 8,
    edges: components.slice(1).map((_, i) => [i, i + 1]), cycles: seed % 3 === 0 ? [['src', 'lib'], ['utils', 'core']] : [],
    maxDepth: 2 + seed % 7, testRatio: seed % 4 === 0 ? 0.22 : 0.08, seed: seed * 12347, fallback: true };
}

/** Zero network: prefer the analysis owner's actual fallback set as soon as it lands. */
export function loadBalanceProfiles(): RepoProfile[] {
  const directory = new URL('../data/fallback/', import.meta.url);
  if (existsSync(directory)) {
    const files = readdirSync(directory).filter(f => f.endsWith('.json')).sort();
    const profiles = files.flatMap(file => {
      const data: unknown = JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
      if (Array.isArray(data)) return data as RepoProfile[];
      return data && typeof data === 'object' && 'slug' in data ? [data as RepoProfile] : [];
    });
    if (profiles.length) return profiles;
  }
  return Array.from({ length: 10 }, (_, i) => syntheticProfile(i + 1));
}

export function createBot(seed: number, skill = 0.72) {
  const rng = random(seed);
  const reaction = 0.13 + (1 - skill) * 0.35;
  let nextThink = 0;
  let seq = 0;
  let frame: InputFrame = { seq: 0, move: [0, 0], aim: null, fire: true, dash: false, skill: false, source: 'keyboard' };
  return (state: MatchState, p: PlayerState): InputFrame => {
    if (state.t < nextThink) return { ...frame, seq: seq++, dash: false, skill: false };
    nextThink = state.t + reaction;
    let mx = 0, my = 0, danger = false;
    const downed = state.players.filter(a => !a.alive).sort((a, b) => distance(a, p) - distance(b, p))[0];
    const weapon = WEAPONS[p.kit.weapon];
    const preferred = Math.min(126, weapon.speed * weapon.life * 0.65);
    const d = distance(p, state.boss);
    const toward = unit(state.boss.x - p.x, state.boss.y - p.y);
    if (downed && distance(downed, p) < 160) {
      if (distance(downed, p) > 17) [mx, my] = unit(downed.x - p.x, downed.y - p.y);
    } else {
      const radial = d < preferred - 15 ? -0.8 : d > preferred + 20 ? 0.65 : 0;
      const orbit = (seed & 1) ? 0.42 : -0.42;
      mx = toward[0] * radial - toward[1] * orbit; my = toward[1] * radial + toward[0] * orbit;
    }
    for (const b of state.bullets) {
      if (b.owner !== 'boss') continue;
      const dx = p.x - b.x, dy = p.y - b.y;
      const v2 = b.vx * b.vx + b.vy * b.vy;
      const t = clamp((dx * b.vx + dy * b.vy) / Math.max(1, v2), 0, 0.65);
      const px = b.x + b.vx * t, py = b.y + b.vy * t;
      const near = Math.hypot(p.x - px, p.y - py);
      if (near < 19 && Math.hypot(dx, dy) < 58 && rng() < skill) {
        const away = unit(p.x - px, p.y - py);
        mx += away[0] * 1.6; my += away[1] * 1.6; danger ||= t < 0.3;
      }
    }
    for (const h of state.hazards) {
      if (h.kind === 'firewall') continue;
      const dx = p.x - h.x, dy = p.y - h.y;
      if (h.kind === 'laser') {
        const side = -dx * Math.sin(h.angle) + dy * Math.cos(h.angle);
        if (dx * Math.cos(h.angle) + dy * Math.sin(h.angle) > 0 && Math.abs(side) < h.r + 18) {
          mx += -Math.sin(h.angle) * Math.sign(side || 1) * 2; my += Math.cos(h.angle) * Math.sign(side || 1) * 2; danger = true;
        }
      } else if (distance(h, p) < h.r + 20) {
        const away = unit(dx, dy); mx += away[0] * 2; my += away[1] * 2; danger = true;
      }
    }
    // Steer off walls before they trap the orbit.
    if (p.x < 38) mx += 1.3; if (p.x > 442) mx -= 1.3;
    if (p.y < 38) my += 1.3; if (p.y > 250) my -= 1.3;
    const length = Math.max(1, Math.hypot(mx, my));
    frame = { seq: seq++, move: [mx / length, my / length], aim: null,
      fire: rng() < 0.88, dash: danger && p.dashCd <= 0 && rng() < skill,
      skill: p.skillCd <= 0 && (p.kit.skill !== 'hotfix' || state.players.some(a => a.alive && a.hp <= a.kit.maxHp - 2 && distance(p, a) < 76)), source: 'keyboard' };
    return frame;
  };
}

export interface BalanceRow { boss: string; players: number; runs: number; wins: number; winRate: number; duration: number; winDuration: number }
export function runBalance(profiles = loadBalanceProfiles(), trials = 5, counts = [1, 4, 6, 8], onRow?: (row: BalanceRow) => void): BalanceRow[] {
  const rows: BalanceRow[] = [];
  for (const profile of profiles) for (const count of counts) {
    let wins = 0, duration = 0, winDuration = 0;
    for (let trial = 0; trial < trials; trial++) {
      const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Bot ${i + 1}`, kit: playerKitFromProfile(syntheticProfile(i + trial * 3 + 1)) }));
      const match = createMatch(players, bossKitFromProfile(profile, count));
      // Paired trials: same squad/reaction RNG faces every boss, isolating repo style.
      const bots = players.map((_, i) => createBot(1009 + trial * 401 + i * 37, 0.55 + (trial % 3) * 0.12));
      let state = match.snapshot();
      while (!match.over) {
        const inputs = new Map(state.players.map((p, i) => [p.id, bots[i](state, p)]));
        match.step(1 / 30, inputs); state = match.snapshot();
      }
      const result = match.autopsy();
      duration += result.duration;
      if (result.victory) { wins++; winDuration += result.duration; }
    }
    const row = { boss: profile.slug, players: count, runs: trials, wins, winRate: wins / trials, duration: duration / trials, winDuration: wins ? winDuration / wins : 0 };
    rows.push(row); onRow?.(row);
  }
  return rows;
}

export function balanceTable(rows: BalanceRow[]): string {
  return ['| Boss | Players | Wins | Win rate | Mean duration | Mean win |', '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(r => `| ${r.boss} | ${r.players} | ${r.wins}/${r.runs} | ${Math.round(r.winRate * 100)}% | ${r.duration.toFixed(1)}s | ${r.winDuration.toFixed(1)}s |`)].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const trials = Number(process.argv[2] ?? 5);
  const counts = process.argv[3]?.split(',').map(Number) ?? [1, 4, 6, 8];
  console.log(balanceTable(runBalance(loadBalanceProfiles(), trials, counts)));
}
