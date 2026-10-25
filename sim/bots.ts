import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { InputFrame, MatchState, PlayerState, RepoProfile } from '../shared/types.ts';
import { bossKitFromProfile, playerKitFromProfile } from './kits.ts';
import { createMatch, WEAPONS } from './match.ts';
import { clamp, distance, random, unit } from './math.ts';
import { segmentRect } from './arena.ts';
import { pvpArenaSize } from './pvp.ts';

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

function avoidCover(state: MatchState, p: PlayerState, move: [number, number], seed: number): [number, number] {
  let [mx, my] = move;
  for (const o of state.obstacles) {
    const [ux, uy] = unit(mx, my);
    if (Math.hypot(mx, my) > 0.01 && segmentRect(p.x, p.y, p.x + ux * 25, p.y + uy * 25, o, 10) !== null) {
      const away = unit(p.x - o.x, p.y - o.y), side = seed & 1 ? 1 : -1;
      mx += -away[1] * side * 1.8 + away[0] * 0.5;
      my += away[0] * side * 1.8 + away[1] * 0.5;
    }
  }
  return [mx, my];
}

export function createBot(seed: number, skill = 0.72) {
  const rng = random(seed);
  const perkRng = random(seed ^ 0x50414453);
  let review = -1, selectedPad = '';
  let retreating = false;
  const reaction = 0.13 + (1 - skill) * 0.35;
  let nextThink = 0;
  let seq = 0;
  let frame: InputFrame = { seq: 0, move: [0, 0], aim: null, fire: true, dash: false, skill: false, source: 'keyboard' };
  return (state: MatchState, p: PlayerState): InputFrame => {
    if (state.mode === 'pvp' && (!p.alive || p.eliminated)) return { seq: seq++, move: [0, 0], aim: null, fire: false, dash: false, skill: false, source: 'keyboard' };
    if (state.t < nextThink) return { ...frame, seq: seq++, dash: false, skill: false };
    nextThink = state.t + reaction;
    if (state.perkOffer && !state.perkOffer.picked[p.id]) {
      if (review !== state.perkOffer.endsAt) {
        review = state.perkOffer.endsAt;
        selectedPad = state.perkOffer.pads[Math.floor(perkRng() * state.perkOffer.pads.length)].id;
      }
      const pad = state.perkOffer.pads.find(pad => pad.id === selectedPad)!;
      const move: [number, number] = distance(p, pad) > 7 ? unit(pad.x - p.x, pad.y - p.y) : [0, 0];
      const steered = avoidCover(state, p, move, seed), length = Math.max(1, Math.hypot(...steered));
      frame = { seq: seq++, move: [steered[0] / length, steered[1] / length], aim: null, fire: false, dash: false, skill: false, source: 'keyboard' };
      return frame;
    }
    const boss = state.boss;
    if (!boss) {
      const target = state.players.filter(other => other.id !== p.id && other.alive).sort((a, b) => distance(p, a) - distance(p, b))[0];
      const weapon = WEAPONS[p.kit.weapon], arena = pvpArenaSize(state.players.length, state.mode === 'pvp' ? 'pvp' : 'edu');
      const toward = target ? unit(target.x - p.x, target.y - p.y) : [0, 0] as [number, number];
      const d = target ? distance(p, target) : 0, preferred = Math.min(160, weapon.speed * weapon.life * 0.65);
      if (state.mode === 'pvp') {
        if (p.armor <= p.kit.maxArmor * 0.25) retreating = true;
        if (p.armor >= p.kit.maxArmor * 0.9) retreating = false;
      }
      const radial = state.mode === 'pvp' && retreating ? -1.5 : d > preferred + 18 ? 1 : d < preferred - 20 ? -0.65 : 0;
      const orbit = (seed & 1 ? 1 : -1) * 0.35;
      let mx = toward[0] * radial - toward[1] * orbit, my = toward[1] * radial + toward[0] * orbit, danger = false;
      for (const bullet of state.bullets) {
        if (bullet.owner === p.id || distance(bullet, p) > 110) continue;
        const t = clamp(((p.x - bullet.x) * bullet.vx + (p.y - bullet.y) * bullet.vy) / Math.max(1, bullet.vx ** 2 + bullet.vy ** 2), 0, 0.5);
        const x = bullet.x + bullet.vx * t, y = bullet.y + bullet.vy * t;
        if (Math.hypot(x - p.x, y - p.y) < 20 + bullet.r && rng() < skill * 0.65) {
          const away = unit(p.x - x, p.y - y); mx += away[0] * 1.3; my += away[1] * 1.3; danger = true;
        }
      }
      if (p.x < 70) mx += 0.8; if (p.x > arena.width - 70) mx -= 0.8;
      if (p.y < 70) my += 0.8; if (p.y > arena.height - 70) my -= 0.8;
      if (state.pvp?.royale) {
        // Wall projection keeps a retreat from pinning itself to a corner while shots catch up.
        if (p.x < 55 && mx < 0) { mx = 0.3; if (Math.abs(my) < 0.5) my = p.y < arena.height / 2 ? 1 : -1; }
        if (p.x > arena.width - 55 && mx > 0) { mx = -0.3; if (Math.abs(my) < 0.5) my = p.y < arena.height / 2 ? 1 : -1; }
        if (p.y < 55 && my < 0) { my = 0.3; if (Math.abs(mx) < 0.5) mx = p.x < arena.width / 2 ? 1 : -1; }
        if (p.y > arena.height - 55 && my > 0) { my = -0.3; if (Math.abs(mx) < 0.5) mx = p.x < arena.width / 2 ? 1 : -1; }
        const zone = state.pvp.royale.zone;
        if (zone && state.t >= zone.shrinkStart - 4 && distance(p, { x: zone.cx, y: zone.cy }) > Math.max(0, zone.r - 26)) {
          const inward = unit(zone.cx - p.x, zone.cy - p.y); mx = inward[0] * 3; my = inward[1] * 3; danger = true;
        } else {
          const drop = state.pickups.filter(drop => distance(p, drop) < 65 && (drop.kind === 'heart' ? p.hp < p.kit.maxHp : p.energy < p.kit.maxEnergy / 2))
            .sort((a, b) => distance(a, p) - distance(b, p))[0];
          if (drop) { const towardDrop = unit(drop.x - p.x, drop.y - p.y); mx += towardDrop[0] * 1.5; my += towardDrop[1] * 1.5; }
        }
      }
      const length = Math.max(1, Math.hypot(mx, my)), lead = target ? Math.min(0.35, d / (weapon.speed * 1.35)) * skill : 0;
      const aim = target ? unit(target.x + target.vx * lead - p.x, target.y + target.vy * lead - p.y) : null;
      frame = { seq: seq++, move: [mx / length, my / length], aim, fire: !!target,
        dash: danger && p.dashCd <= 0 && rng() < skill * 0.5,
        skill: p.skillCd <= 0 && (p.kit.skill === 'hotfix' ? p.hp <= p.kit.maxHp - 3 : !!target && d < 210), source: 'keyboard' };
      return frame;
    }
    let mx = 0, my = 0, danger = false;
    const downed = state.players.filter(a => !a.alive).sort((a, b) => distance(a, p) - distance(b, p))[0];
    const weapon = WEAPONS[p.kit.weapon];
    const preferred = Math.min(126, weapon.speed * weapon.life * 0.65);
    const d = distance(p, boss);
    const toward = unit(boss.x - p.x, boss.y - p.y);
    const loot = state.pickups.filter(drop => distance(drop, p) < 85 &&
      (drop.kind === 'heart' ? p.hp < p.kit.maxHp : drop.kind === 'armor' ? p.armor < p.kit.maxArmor : p.energy < p.kit.maxEnergy * 0.5))
      .sort((a, b) => distance(a, p) - distance(b, p))[0];
    if (downed && distance(downed, p) < 160) {
      if (distance(downed, p) > 17) [mx, my] = unit(downed.x - p.x, downed.y - p.y);
    } else if (loot) {
      [mx, my] = unit(loot.x - p.x, loot.y - p.y);
    } else {
      const radial = d < preferred - 15 ? -0.8 : d > preferred + 20 ? 0.65 : 0;
      const orbit = (seed & 1) ? 0.42 : -0.42;
      mx = toward[0] * radial - toward[1] * orbit; my = toward[1] * radial + toward[0] * orbit;
    }
    [mx, my] = avoidCover(state, p, [mx, my], seed);
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

export interface BalanceRow {
  boss: string; players: number; runs: number; wins: number; winRate: number; duration: number; winDuration: number;
  reviews: number; blocksBroken: number; perksPicked: Record<string, number>; pickupsCollected: Record<string, number>;
}
export function runBalance(profiles = loadBalanceProfiles(), trials = 5, counts = [1, 4, 6, 8], onRow?: (row: BalanceRow) => void): BalanceRow[] {
  const rows: BalanceRow[] = [];
  for (const profile of profiles) for (const count of counts) {
    let wins = 0, duration = 0, winDuration = 0;
    let reviews = 0, blocksBroken = 0;
    const perksPicked: Record<string, number> = {}, pickupsCollected: Record<string, number> = {};
    for (let trial = 0; trial < trials; trial++) {
      const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Bot ${i + 1}`, kit: playerKitFromProfile(syntheticProfile(i + trial * 3 + 1)) }));
      const match = createMatch(players, bossKitFromProfile(profile, count));
      // Paired trials: same squad/reaction RNG faces every boss, isolating repo style.
      const bots = players.map((_, i) => createBot(1009 + trial * 401 + i * 37, 0.55 + (trial % 3) * 0.12));
      let state = match.snapshot();
      while (!match.over) {
        const inputs = new Map(state.players.map((p, i) => [p.id, bots[i](state, p)]));
        match.step(1 / 30, inputs); state = match.snapshot();
        for (const event of state.events) {
          if (event.type === 'phase' && event.phase === 2) reviews++;
          if (event.type === 'obstacleBroken') blocksBroken++;
          if (event.type === 'perk') perksPicked[event.perk] = (perksPicked[event.perk] ?? 0) + 1;
          if (event.type === 'pickup') pickupsCollected[event.kind] = (pickupsCollected[event.kind] ?? 0) + 1;
        }
      }
      const result = match.autopsy();
      duration += result.duration;
      if (result.victory) { wins++; winDuration += result.duration; }
    }
    const row = { boss: profile.slug, players: count, runs: trials, wins, winRate: wins / trials, duration: duration / trials, winDuration: wins ? winDuration / wins : 0,
      reviews, blocksBroken, perksPicked, pickupsCollected };
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
