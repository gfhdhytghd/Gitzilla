import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PlayerKit, RepoProfile } from '../shared/types.ts';
import { bossKitFromProfile, playerKitFromProfile } from '../sim/kits.ts';
import { type PvpPower, asPvpKit } from '../sim/pvpPower.ts';
import { buildGenesis, heroBudget, MAX_GENESIS_BYTES, pvpPowerTrace } from './index.ts';

const folder = new URL('../data/fallback/', import.meta.url);
const profiles = readdirSync(folder).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(new URL(f, folder), 'utf8')) as RepoProfile);

describe('PvP repo power captions', () => {
  it('shows real signals, the authoritative score, and final stats first', () => {
    const p = { ...profiles[0], stars: 412, testRatio: 0.38 };
    const kit = { ...playerKitFromProfile(p), maxHp: 8, damageMul: 1.585,
      battleStats: { maxHp: 5, maxArmor: 3, maxEnergy: 150, speed: 77, damageMul: 0.9 },
      pvpPower: { score: 78, parts: [] } };
    const g = buildGenesis(p, kit, 'hero');
    expect(g.trace.slice(0, 3)).toEqual([
      { part: 'stats', from: '412 stars · 38% tests', to: 'POWER 78', ref: 'pvp-power' },
      { part: 'stats', from: 'POWER 78', to: '+2 HP · +58.5% damage', ref: 'pvp-power:boost' },
      { part: 'stats', from: 'POWER 78', to: '8 HP · 1.585× damage', ref: 'pvp-power:stats' },
    ]);
    expect(g.budget).toEqual([]); expect(heroBudget(kit)).toEqual([]);
    expect(JSON.stringify(g.trace)).not.toMatch(/5 points|fair fight|budget points/);
  });

  it.each(profiles.map(p => [p.slug, p] as const))('%s stays compact, detached, and uses the supplied score', (_, p) => {
    const kit = playerKitFromProfile(p, { mode: 'pvp' }) as PlayerKit & { pvpPower: PvpPower };
    const before = JSON.stringify({ p, kit });
    const g = buildGenesis(p, kit, 'hero');
    expect(g.trace[0].to).toBe(`POWER ${kit.pvpPower.score}`);
    expect(g.trace.filter(t => t.ref?.startsWith('pvp-power:part:'))).toHaveLength(kit.pvpPower.parts.length);
    expect(kit.pvpPower.parts).toHaveLength(9);
    expect(g.trace[0].from).toContain(p.stars.toLocaleString('en-US'));
    expect(g.trace.find(t => t.ref === 'pvp-power:stats')?.to).toContain(`${kit.maxHp} HP`);
    expect(g.trace.every(t => t.from.length <= 40 && t.to.length <= 40)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(g))).toBeLessThanOrEqual(MAX_GENESIS_BYTES);
    expect(JSON.stringify({ p, kit })).toBe(before);
    g.trace[0].from = 'mutated';
    expect(JSON.stringify({ p, kit })).toBe(before);
  });

  it('preserves zero power and distinguishes close damage multipliers', () => {
    const p = profiles[0], base = playerKitFromProfile(p);
    expect(pvpPowerTrace(p, { ...base, pvpPower: { score: 0, parts: [] } })[0].to).toBe('POWER 0');
    const a = pvpPowerTrace(p, { ...base, damageMul: 1.16, pvpPower: { score: 10, parts: [] } });
    const b = pvpPowerTrace(p, { ...base, damageMul: 1.18, pvpPower: { score: 11, parts: [] } });
    expect(a[2].to).toContain('1.16× damage'); expect(b[2].to).toContain('1.18× damage');
  });

  it('explains supplied part strengths and weights without recalculating the total', () => {
    const p = profiles[0];
    const kit = { ...playerKitFromProfile(p), pvpPower: {
      score: 78, parts: [
        { label: 'Tests (38.0% files)', value: 82.4, weight: 0.16 },
        { label: 'Stars (12485)', value: 81.9, weight: 0.12 },
        { label: 'Commit activity (unmeasured; neutral)', value: 50, weight: 0.08 },
      ],
    } };
    const rows = pvpPowerTrace(p, kit);
    expect(rows[0].to).toBe('POWER 78'); // supplied total wins, even with partial evidence
    expect(rows.find(t => t.ref === 'pvp-power:part:0')).toMatchObject({ from: 'Tests · 38.0% files', to: '82.4/100 · 16% influence' });
    expect(rows.find(t => t.ref === 'pvp-power:part:1')).toMatchObject({ from: 'Stars · 12,485', to: '81.9/100 · 12% influence' });
    expect(rows.find(t => t.ref === 'pvp-power:part:2')?.from).toContain('unmeasured; neutral');
    expect(kit.pvpPower.parts[1].label).toBe('Stars (12485)');
  });

  it('labels the sim fallback neutral rather than inventing measured source power', () => {
    const base = playerKitFromProfile(profiles[0]);
    const { classroom, powerSource, ...identity } = base as typeof base & { classroom?: unknown; powerSource?: unknown };
    const kit = asPvpKit(identity);
    const g = buildGenesis(profiles[0], kit, 'hero');
    expect(g.trace[0]).toMatchObject({ from: 'Source unmeasured · neutral power', to: 'POWER 50' });
    expect(g.trace.find(t => t.ref === 'pvp-power:part:0')?.from).toContain('unavailable; neutral');
  });

  it('filters credentials in part labels before clipping and retains short captions', () => {
    const token = `ghp_${'x'.repeat(36)}`;
    const kit = { ...playerKitFromProfile(profiles[0]), pvpPower: { score: 40, parts: [
      { label: `Stars (${token})`, value: 50, weight: 0.12 },
      { label: 'const password = "hunter42";', value: 30, weight: 0.16 },
    ] } };
    const g = buildGenesis(profiles[0], kit, 'hero');
    expect(JSON.stringify(g)).not.toContain(token); expect(JSON.stringify(g)).not.toContain('hunter42');
    expect(g.trace.find(t => t.ref === 'pvp-power:part:0')?.from).toBe('[source omitted]');
    expect(g.trace.find(t => t.ref === 'pvp-power:part:1')?.from).toBe('[source omitted]');
    expect(g.trace.every(t => t.from.length <= 40 && t.to.length <= 40)).toBe(true);
  });

  it('does not add power rows to battle, edu, or boss stories without metadata', () => {
    const p = profiles[0], battle = playerKitFromProfile(p), edu = playerKitFromProfile(p, { mode: 'edu' });
    expect(pvpPowerTrace(p, battle)).toEqual([]);
    for (const g of [buildGenesis(p, battle, 'hero'), buildGenesis(p, edu, 'hero'), buildGenesis(p, bossKitFromProfile(p, 4), 'boss')]) {
      expect(g.trace.some(t => t.ref?.startsWith('pvp-power'))).toBe(false);
    }
    expect(heroBudget(battle).reduce((sum, b) => sum + b.value, 0)).toBe(5);
    expect(buildGenesis(p, edu, 'hero').trace[0].ref).toBe('quality:armor');
  });
});
