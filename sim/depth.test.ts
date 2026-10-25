import { describe, expect, it } from 'vitest';
import type { BossAttack, CodeDNA, InputFrame, MatchState, Pickup, PlayerState } from '../shared/types.ts';
import { createMatch, type BattleState, type Match } from './match.ts';
import { bossKitFromProfile, playerKitFromProfile } from './kits.ts';
import { syntheticProfile } from './bots.ts';
import { createObstacles, segmentRect } from './arena.ts';
import { createPerkOffer, PERKS } from './perks.ts';

const input = (patch: Partial<InputFrame> = {}): InputFrame => ({ seq: 1, move: [0, 0], aim: null, fire: false, dash: false, skill: false, source: 'keyboard', ...patch });
interface Runtime {
  state: BattleState;
  bullet(owner: string, kind: string, x: number, y: number, vx: number, vy: number, r: number, damage: number, life: number): void;
  drop(kind: Pickup['kind'], x: number, y: number): void;
  hurtBoss(p: PlayerState, id: string, base: number, x: number, y: number): void;
  hurtPlayer(p: PlayerState, damage: number): void;
  attack(a: BossAttack, target: [number, number]): void;
}
const runtime = (m: Match) => m as unknown as Runtime;
const advance = (m: Match, t: number, inputs = new Map<string, InputFrame>()) => { for (let i = 0; i < Math.ceil(t * 30); i++) m.step(1 / 30, inputs); };
function fixture() {
  const p = syntheticProfile(4), kit = playerKitFromProfile(p);
  const m = createMatch([{ id: 'a', name: 'A', kit: { ...kit, weapon: 'cannon' } }, { id: 'b', name: 'B', kit }], bossKitFromProfile(p, 2));
  advance(m, 2.1);
  const s = runtime(m).state;
  s.boss.casting = { attackId: s.boss.kit.attacks[0].id, t: 0, total: 999, target: [400, 200] };
  return m;
}
function dna(): CodeDNA {
  return { identifiers: ['parse_args', 'Router'], componentSymbols: { src: ['parse_args'], lib: ['Router'] },
    heartLines: ['return parse_args(argv)'], snippets: [{ file: 'src/main.py', line: 4, code: 'def parse_args(argv):' }],
    todos: [{ file: 'src/main.py', text: 'TODO: handle empty argv' }], commits: ['Fix empty input'], tokens: ['def', 'return', ':'],
    bigFiles: Array.from({ length: 6 }, (_, i) => ({ path: `src/file${i}.py`, loc: 100 * (i + 1) })),
    longestFunction: { name: 'parse_args', file: 'src/main.py', lines: 40 },
    counts: { functions: 2, classes: 1, todo: 1, fixme: 0, hack: 0, comments: 2 }, maxNesting: 5, avgLineLength: 25, indent: 'spaces4' };
}

describe('code-backed kits and cover', () => {
  it('copies actual DNA into kits and attack names without increasing battle combat stats', () => {
    const p = syntheticProfile(4), beforeP = playerKitFromProfile(p), beforeB = bossKitFromProfile(p, 4);
    p.dna = dna(); const hero = playerKitFromProfile(p), boss = bossKitFromProfile(p, 4);
    expect(hero.code).toMatchObject({ signature: 'parse_args()', snippet: 'def parse_args(argv):', tokens: ['def', 'return', ':'] });
    expect(boss.code).toMatchObject({ heartLines: ['return parse_args(argv)'], todos: ['TODO: handle empty argv'], commits: ['Fix empty input'], limbSymbols: { 'limb-0': ['parse_args'] } });
    expect(boss.attacks.some(a => a.name.includes('parse_args()'))).toBe(true);
    expect({ ...hero, code: undefined, classroom: undefined, powerSource: undefined }).toEqual({ ...beforeP, code: undefined, classroom: undefined, powerSource: undefined });
    const source = (hero as import('./quality.ts').ClassroomKit).powerSource!, beforeSource = (beforeP as import('./quality.ts').ClassroomKit).powerSource!;
    expect({ ...source, todoMeasured: undefined }).toEqual({ ...beforeSource, todoMeasured: undefined });
    expect(source.todoMeasured).toBe(true); expect(beforeSource.todoMeasured).toBe(false);
    expect({ ...boss, code: undefined, attacks: boss.attacks.map(a => ({ ...a, name: '' })) }).toEqual({ ...beforeB, code: undefined, attacks: beforeB.attacks.map(a => ({ ...a, name: '' })) });
    hero.code!.tokens.push('changed'); expect(p.dna.tokens).not.toContain('changed');
  });
  it('creates 3–6 file-named blocks with fixed total HP, outside spawn/body and pad positions', () => {
    for (let count = 1; count <= 8; count++) {
      const p = syntheticProfile(4); p.dna = dna(); p.dna.bigFiles = p.dna.bigFiles.slice(0, count);
      let id = 0; const blocks = createObstacles(bossKitFromProfile(p, 4), () => ++id);
      expect(blocks.length).toBeGreaterThanOrEqual(3); expect(blocks.length).toBeLessThanOrEqual(6);
      expect(blocks.reduce((sum, b) => sum + b.maxHp, 0)).toBe(150);
      for (const b of blocks) {
        expect(b.label).toMatch(/^file\d.py$/); expect(b.x).toBeGreaterThan(110);
        expect(Math.hypot(b.x - 335, b.y - 144)).toBeGreaterThan(70);
        expect(b.maxHp).toBeGreaterThan(0);
      }
    }
    expect(segmentRect(0, 50, 300, 50, { x: 150, y: 50, w: 20, h: 20 })).toBeCloseTo(140 / 300);
    expect(segmentRect(0, 20, 300, 20, { x: 150, y: 50, w: 20, h: 20 })).toBeNull();
  });
  it('blocks both sides’ fast shots, breaks once, and drops loot', () => {
    for (const owner of ['a', 'boss']) {
      const m = fixture(), r = runtime(m), s = r.state;
      s.obstacles = [{ id: 900, x: 150, y: 140, w: 20, h: 20, hp: 12, maxHp: 12, label: 'parser.ts' }];
      const hp = s.boss.hp;
      r.bullet(owner, 'laser', 100, 140, 3600, 0, 2, 12, 1);
      m.step(1 / 30, new Map());
      expect(s.obstacles).toHaveLength(0); expect(s.boss.hp).toBe(hp); expect(s.bullets).toHaveLength(0);
      expect(s.pickups.some(p => p.kind === 'energy')).toBe(true);
      expect(m.snapshot().events.filter(e => e.type === 'obstacleBroken')).toHaveLength(1);
      m.step(1 / 30, new Map()); expect(m.snapshot().events.some(e => e.type === 'obstacleBroken')).toBe(false);
    }
  });
  it('blocks movement while allowing escape from a cover boundary', () => {
    const m = fixture(), s = runtime(m).state, p = s.players[0]; p.x = 120; p.y = 140;
    s.obstacles = [{ id: 900, x: 150, y: 140, w: 20, h: 20, hp: 100, maxHp: 100, label: 'cover' }];
    advance(m, 1, new Map([['a', input({ move: [1, 0] })]])); expect(p.x).toBeLessThanOrEqual(134);
    advance(m, 0.3, new Map([['a', input({ move: [-1, 0] })]])); expect(p.x).toBeLessThan(120);
  });
});

describe('loot', () => {
  it('collects hearts, energy and armor within 14px, respecting caps and full-health teammates', () => {
    const m = fixture(), r = runtime(m), p = r.state.players[0]; p.x = 100; p.y = 100; p.hp--; p.armor = 0; p.energy = 10;
    for (const kind of ['heart', 'armor', 'energy'] as const) r.drop(kind, 113, 100);
    m.step(1 / 30, new Map());
    expect(p.hp).toBe(p.kit.maxHp); expect(p.armor).toBe(2); expect(p.energy).toBeCloseTo(40 + 1 / 3);
    expect(r.state.pickups).toHaveLength(0); expect(m.snapshot().events.filter(e => e.type === 'pickup')).toHaveLength(3);
    r.drop('heart', 113, 100); m.step(1 / 30, new Map()); expect(r.state.pickups).toHaveLength(1);
    advance(m, 15.1); expect(r.state.pickups).toHaveLength(0);
  });
  it('drops loot exactly once from dead minions and a broken limb', () => {
    const m = fixture(), r = runtime(m), s = r.state;
    s.minions.push({ id: 900, x: 200, y: 200, hp: 0, kind: 'TODO' });
    m.step(1 / 30, new Map()); expect(s.minions).toHaveLength(0);
    expect(s.pickups.filter(p => p.kind === 'energy')).toHaveLength(1);
    m.step(1 / 30, new Map()); expect(s.pickups.filter(p => p.kind === 'energy')).toHaveLength(1);
    s.boss.limbs[0].hp = 1;
    r.hurtBoss(s.players[0], s.boss.limbs[0].id, 10, s.boss.x, s.boss.y);
    expect(s.pickups.filter(p => p.kind === 'heart')).toHaveLength(1);
    expect(s.pickups.filter(p => p.kind === 'energy')).toHaveLength(2);
  });
  it('caps armor loot per room so a minion-heavy repo cannot add an unlimited healing budget', () => {
    const m = fixture(), s = runtime(m).state;
    for (let i = 0; i < 100; i++) s.minions.push({ id: 1000 + i, x: 220, y: 220, hp: 0, kind: 'bug' });
    m.step(1 / 30, new Map());
    expect(s.pickups.filter(p => p.kind === 'energy')).toHaveLength(100);
    expect(s.pickups.filter(p => p.kind === 'armor')).toHaveLength(1); // ceil(2 heroes / 2)
  });
});

describe('code review', () => {
  it('selects three seeded distinct perks and freezes attacks for five seconds', () => {
    expect(createPerkOffer(10, 2)).toEqual(createPerkOffer(10, 2));
    expect(new Set(createPerkOffer(10, 2).pads.map(p => p.id)).size).toBe(3); expect(PERKS).toHaveLength(8);
    const m = fixture(), r = runtime(m), s = r.state, p = s.players[0];
    s.boss.hp = s.boss.maxHp * 0.49;
    r.hurtBoss(p, 'heart', 1, s.boss.x, s.boss.y);
    r.bullet('boss', 'ring', p.x, p.y, 0, 0, 3, 20, 1);
    s.minions.push({ id: 901, x: p.x, y: p.y, hp: 10, kind: 'bug' });
    m.step(1 / 30, new Map()); const offer = s.perkOffer!, until = offer.endsAt, hp = p.hp;
    expect(offer).not.toBeNull(); expect(s.bullets).toHaveLength(0); expect(s.boss.casting).toBeNull();
    advance(m, 4.8, new Map([['a', input({ fire: true })]]));
    expect(s.t).toBeLessThan(until); expect(p.hp).toBe(hp); expect(s.bullets).toHaveLength(0);
    advance(m, 0.3); expect(s.perkOffer).toBeNull(); expect(s.players.every(p => p.perks.length === 1)).toBe(true);
    expect(m.snapshot().events.filter(e => e.type === 'perk')).toHaveLength(2);
  });
  it('requires one contiguous second on a pad and auto-picks the nearest at timeout', () => {
    const m = fixture(), r = runtime(m), s = r.state;
    s.boss.hp = s.boss.maxHp * 0.49; r.hurtBoss(s.players[0], 'heart', 1, s.boss.x, s.boss.y); m.step(1 / 30, new Map());
    const p = s.players[0], pad = s.perkOffer!.pads[0]; p.x = pad.x; p.y = pad.y;
    advance(m, 0.6); p.y += 40; advance(m, 0.1); p.y = pad.y;
    advance(m, 0.6); expect(p.perks).toHaveLength(0);
    advance(m, 0.45); expect(p.perks).toEqual([pad.id]);
    const other = s.players[1]; other.x = 380; other.y = 180;
    const last = s.perkOffer!.pads[2].id;
    advance(m, 4); expect(other.perks).toEqual([last]);
    expect(m.snapshot().events.filter(e => e.type === 'perk' && e.player === p.id)).toHaveLength(1);
  });
});

describe('perk effects', () => {
  it('cannot bank idle or code-review time into a rapid-fire burst', () => {
    const m = fixture(), r = runtime(m), s = r.state;
    advance(m, 5);
    for (const p of s.players) { p.x = 45; p.y = 45; }
    const inputs = new Map([['a', input({ fire: true, aim: [0, 1] })]]);
    advance(m, 0.3, inputs);
    expect(s.bullets.filter(b => b.owner === 'a')).toHaveLength(1); // cannon interval is 0.85s
    s.perkOffer = createPerkOffer(10, s.t);
    advance(m, 5.1); s.bullets = [];
    advance(m, 0.3, inputs);
    expect(s.bullets.filter(b => b.owner === 'a')).toHaveLength(1);
  });
  it('applies damage, cost, dash, skill and speed bonuses without changing kit stats', () => {
    for (const perk of ['force', 'cache-hit', 'no-verify', 'hotfix-plus', 'tail-call']) {
      const base = fixture(), improved = fixture();
      const p = runtime(base).state.players[0], q = runtime(improved).state.players[0]; q.perks = [perk];
      const originalKit = structuredClone(q.kit);
      for (const hero of [p, q]) { hero.x = 240; hero.y = 144; }
      const inputMap = new Map([['a', input({ fire: true, dash: perk === 'no-verify', skill: perk === 'hotfix-plus', move: perk === 'tail-call' ? [0, 1] : [0, 0] })]]);
      base.step(1 / 30, inputMap); improved.step(1 / 30, inputMap);
      if (perk === 'cache-hit') expect(q.kit.maxEnergy - q.energy).toBeCloseTo((p.kit.maxEnergy - p.energy) * 0.7);
      if (perk === 'no-verify') expect(q.dashCd).toBeCloseTo(p.dashCd * 0.6);
      if (perk === 'hotfix-plus') expect(q.skillCd).toBeCloseTo(p.skillCd * 0.7);
      if (perk === 'tail-call') expect(q.vy).toBeCloseTo(p.vy * 1.12);
      if (perk === 'force') {
        advance(base, 0.5); advance(improved, 0.5);
        const a = runtime(base).state.boss, b = runtime(improved).state.boss;
        expect(b.maxHp - b.hp).toBeCloseTo((a.maxHp - a.hp) * 1.25);
      }
      expect(q.kit).toEqual(originalKit);
    }
  });
  it('makes armor recover faster, reduces incoming damage and extends the revive aura', () => {
    const base = fixture(), improved = fixture(), p = runtime(base).state.players[0], q = runtime(improved).state.players[0];
    p.armor = q.armor = 0; q.perks = ['safe-mode', 'lint-fix'];
    runtime(base).hurtPlayer(p, 2); runtime(improved).hurtPlayer(q, 2);
    expect(q.kit.maxHp - q.hp).toBeCloseTo((p.kit.maxHp - p.hp) * 0.8);
    advance(base, 3.2); advance(improved, 3.2); expect(q.armor).toBeGreaterThan(p.armor);
    const m = fixture(), s = runtime(m).state, [downed, helper] = s.players;
    downed.hp = 0; downed.alive = false; downed.x = helper.x + 35; downed.y = helper.y;
    helper.perks = ['pair-programming']; advance(m, 1.1);
    expect(downed.alive).toBe(true); expect(helper.stats.revives).toBe(1);
  });
});
