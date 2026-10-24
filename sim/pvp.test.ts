import { describe, expect, it } from 'vitest';
import type { CodeDNA, InputFrame, PlayerState } from '../shared/types.ts';
import { ARENA_W, ARENA_H } from '../shared/types.ts';
import { createMatch, type Match } from './match.ts';
import { ClassroomMatch, pvpArenaSize, type ClassroomState } from './pvp.ts';
import { playerKitFromProfile } from './kits.ts';
import { createBot } from './bots.ts';
import { qualityProfile } from './classroom-bots.ts';
import { classroomFacts, type ClassroomKit } from './quality.ts';
import { classroomQuiz } from './quiz.ts';
import { LessonQueue } from './lessons.ts';

const frame = (patch: Partial<InputFrame> = {}): InputFrame => ({ seq: 1, move: [0, 0], aim: null, fire: false, dash: false, skill: false, source: 'keyboard', ...patch });
const students = (n = 2) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Student ${i}`, kit: playerKitFromProfile(qualityProfile(i % 2 === 0, i + 1)) }));
const advance = (match: Match, seconds: number, inputs = new Map<string, InputFrame>()) => { for (let i = 0; i < Math.ceil(seconds * 30); i++) match.step(1 / 30, inputs); };
interface Internals { state: ClassroomState; hurt(target: PlayerState, source: PlayerState, damage: number, direction: [number, number]): void; endRound(): void; quiz: ReturnType<typeof classroomQuiz> }
const internals = (m: Match) => m as unknown as Internals;

describe('code-quality classroom report card', () => {
  it('maps actual source signals into seven explainable stats and keeps battle equal-budget', () => {
    const good = qualityProfile(true), learning = qualityProfile(false);
    const a = playerKitFromProfile(good, { mode: 'edu' }), c = playerKitFromProfile(learning, { mode: 'edu' });
    expect(a.maxArmor).toBeGreaterThan(c.maxArmor); expect(a.speed).toBeGreaterThan(c.speed);
    expect(a.damageMul).toBeGreaterThan(c.damageMul); expect(a.maxEnergy).toBeGreaterThan(c.maxEnergy);
    expect(a.quality).toHaveLength(7); expect(c.quality!.find(q => q.stat === 'weakness')!.value).toBeGreaterThan(0);
    for (const q of a.quality!) { expect(q.signal.length).toBeGreaterThan(10); expect(q.tip.length).toBeGreaterThan(10); }
    expect(a.quality!.find(q => q.stat === 'damage')!.signal).toContain('24');
    expect(a.quality!.find(q => q.stat === 'armor')!.grade).toBe('A');
    for (const p of [good, learning]) {
      const k = playerKitFromProfile(p);
      expect((k.maxHp - 5) + (k.maxArmor - 3) + (k.maxEnergy - 150) / 35 + (k.speed - 77) / 8 + (k.damageMul - 0.9) / 0.1).toBeCloseTo(5);
      expect(k.quality).toBeUndefined();
    }
  });
  it('caps project-size bonuses, labels missing measurements and includes public upgrade evidence', () => {
    const p = qualityProfile(true); p.totalLoc = 1e12; p.dna = undefined; p.readme = undefined; p.tree = undefined;
    p.vulns = [{ id: 'OSV-FIXTURE', pkg: 'fixture-lib', fixed: '2.0', ecosystem: 'npm', summary: 'Public fixture' }];
    const k = playerKitFromProfile(p, { mode: 'edu' });
    expect(k.maxHp).toBeLessThanOrEqual(14); expect(k.quality!.find(q => q.stat === 'damage')!.signal).toContain('unavailable');
    expect(k.quality!.find(q => q.stat === 'weakness')!.tip).toContain('2.0');
    expect(classroomFacts(p).readmeLength).toBeNull(); expect(classroomFacts(p).avgFunctionLength).toBeNull();
  });
  it('labels LOC/definition estimates when precise lengths are absent', () => {
    const p = qualityProfile(true); delete (p.dna as CodeDNA & { avgFunctionLength?: number }).avgFunctionLength;
    expect(playerKitFromProfile(p, { mode: 'edu' }).quality!.find(q => q.stat === 'damage')!.signal).toContain('approx. LOC/definition');
  });
});

describe('classroom PvP', () => {
  it('routes the factory with no boss and scales the arena for 30 larger heroes', () => {
    const m = createMatch(students(30), null, { mode: 'edu' }), s = m.snapshot();
    expect(s.mode).toBe('edu'); expect(s.boss).toBeNull(); expect(s.heroScale).toBe(2);
    expect(s.players.every(p => p.kit.quality?.length === 7)).toBe(true);
    expect(pvpArenaSize(30).width).toBeGreaterThan(pvpArenaSize(8).width);
    expect(new Set(s.players.map(p => `${p.x},${p.y}`)).size).toBe(30);
    expect(() => new ClassroomMatch(students(1))).toThrow(); expect(() => new ClassroomMatch(students(31))).toThrow();
  });
  it('uses neutral labelled values for custom kits lacking source data', () => {
    const roster = students(); delete (roster[0].kit as ClassroomKit).classroom;
    const s = new ClassroomMatch(roster).snapshot();
    expect(s.players[0].kit.quality!.every(q => q.grade === 'C' && q.signal.includes('unavailable'))).toBe(true);
  });
  it('fires at classmates, emits directional hit feedback, and never hits the shooter', () => {
    const m = new ClassroomMatch(students()), raw = internals(m); advance(m, 4.1);
    const [a, b] = raw.state.players; a.x = 200; a.y = 200; b.x = 280; b.y = 200;
    advance(m, 1, new Map([[a.id, frame({ fire: true, aim: [1, 0] })]]));
    const hits = m.snapshot().events.filter(e => e.type === 'hit');
    expect(hits.length).toBeGreaterThan(0); expect(hits.every(e => e.target === b.id && e.source === a.id && e.direction?.[0] === 1)).toBe(true);
    expect(a.hp).toBe(a.kit.maxHp); expect(raw.state.pvp.scores[a.id].damage).toBeGreaterThan(0);
  });
  it('caps individual damage, scores KOs, then respawns with two seconds invulnerability', () => {
    const m = new ClassroomMatch(students()); advance(m, 4.1); const raw = internals(m), [a, b] = raw.state.players;
    raw.hurt(b, a, 1e8, [1, 0]); expect(b.alive).toBe(true);
    expect(b.kit.maxHp + b.kit.maxArmor - b.hp - b.armor).toBeLessThanOrEqual(b.kit.maxHp * 0.4 + 1e-6);
    for (let i = 0; i < 8 && b.alive; i++) { b.invuln = 0; raw.hurt(b, a, 1e8, [1, 0]); }
    expect(b.alive).toBe(false); expect(raw.state.pvp.scores[a.id].kos).toBe(1); expect(raw.state.pvp.scores[b.id].downs).toBe(1);
    advance(m, 2.6); expect(b.alive).toBe(true); expect(b.invuln).toBeGreaterThan(1.8);
    const hp = b.hp; raw.hurt(b, a, 10, [1, 0]); expect(b.hp).toBe(hp);
  });
  it('allows a shotgun volley to land several pellets while remaining far below a one-shot', () => {
    const roster = students(); roster[0].kit.weapon = 'shotgun';
    const m = new ClassroomMatch(roster); advance(m, 4.1); const raw = internals(m), [a, b] = raw.state.players;
    a.x = 200; a.y = 200; b.x = 235; b.y = 200; const before = b.hp + b.armor;
    m.step(1 / 30, new Map([[a.id, frame({ fire: true, aim: [1, 0] })]])); advance(m, 0.2);
    expect(m.snapshot().events.filter(e => e.type === 'hit' && e.target === b.id).length).toBeGreaterThan(1);
    expect(before - b.hp - b.armor).toBeLessThan(before / 2); expect(b.alive).toBe(true);
  });
  it('handles malformed PvP inputs and maintains finite bounded positions', () => {
    const m = new ClassroomMatch(students());
    advance(m, 3, new Map([['p0', { aim: 'broken', move: [NaN, Infinity], fire: true } as unknown as InputFrame]]));
    const a = m.snapshot().players[0]; expect(Number.isFinite(a.x + a.y + a.facing[0] + a.facing[1])).toBe(true);
  });
  it('adds tech-debt slows from actual TODO density, not cosmetic designs', () => {
    const m = new ClassroomMatch(students()); advance(m, 3); const p = internals(m).state.players[1];
    let slowed = false;
    for (let i = 0; i < 400; i++) { m.step(1 / 30, new Map([['p1', frame({ move: [1, 0] })]])); slowed ||= p.buffs.includes('tech-debt') && p.vx < p.kit.speed; }
    expect(slowed).toBe(true);
  });
  it('locks answers, reveals exactly one correct pad, and grants a small next-round buff', () => {
    const m = new ClassroomMatch(students()); advance(m, 77.1); const raw = internals(m), s = raw.state;
    expect(s.pvp.phase).toBe('quiz'); expect(s.bullets).toHaveLength(0);
    const q = raw.quiz, pad = s.perkOffer!.pads.find(p => p.id === q.correctId)!, a = s.players[0];
    expect(s.perkOffer!.pads.every(p => p.correct === undefined)).toBe(true); expect(s.perkOffer!.quiz!.explain).toBe('');
    a.x = pad.x; a.y = pad.y; advance(m, 1.1);
    expect(s.perkOffer!.picked[a.id]).toBe(pad.id); expect(s.pvp.quizScores[a.id]).toBe(1);
    advance(m, 11); expect(s.pvp.phase).toBe('reveal'); expect(s.perkOffer!.pads.filter(p => p.correct)).toHaveLength(1);
    expect(s.perkOffer!.quiz!.explain.length).toBeGreaterThan(10);
    advance(m, 3); expect(s.pvp.round).toBe(2); expect(s.pvp.phase).toBe('round'); expect(a.perks).toContain('quiz-boost');
    expect(s.pvp.roundEndsAt - s.t).toBeGreaterThan(74);
  });
  it('finishes best of three and returns classroom rankings rather than a boss victory', () => {
    const m = new ClassroomMatch(students()); advance(m, 4.1); const raw = internals(m), [a, b] = raw.state.players;
    raw.hurt(b, a, 2, [1, 0]); raw.endRound(); advance(m, 15.1);
    b.invuln = 0; raw.hurt(b, a, 2, [1, 0]); raw.endRound();
    expect(m.over).toBe(true); const report = m.autopsy();
    expect(report.mode).toBe('edu'); expect(report.boss).toBeNull(); expect(report.victory).toBe(false);
    expect(report.mvp).toBe(a.id); expect(report.ranking![0].roundWins).toBe(2); expect(report.ranking![0].quality).toHaveLength(7);
  });
  it('terminates an inactive class after three rounds without inventing a winner', () => {
    const m = new ClassroomMatch(students()); advance(m, 259);
    expect(m.over).toBe(true); expect(m.autopsy().mvp).toBeNull(); expect(m.snapshot().pvp.scores.p0.roundWins).toBe(0);
  });
  it('replays deterministic normal-input 30-student combat with bounded projectiles', () => {
    const a = new ClassroomMatch(students(30)), b = new ClassroomMatch(students(30));
    const bots = students(30).map((_, i) => createBot(i + 1, 0.7));
    let maxBullets = 0;
    for (let i = 0; i < 900; i++) {
      const s = a.snapshot(), inputs = new Map(s.players.map((p, j) => [p.id, bots[j](s, p)])); b.snapshot();
      a.step(1 / 30, inputs); b.step(1 / 30, inputs); maxBullets = Math.max(maxBullets, s.bullets.length);
    }
    expect(a.snapshot()).toEqual(b.snapshot()); expect(maxBullets).toBeLessThanOrEqual(1200);
    expect(a.autopsy().ranking!.reduce((s, p) => s + p.damage, 0)).toBeGreaterThan(0);
  });
});

describe('classroom explanations', () => {
  it('produces three distinct answers and one real answer across seeds', () => {
    const players = new ClassroomMatch(students(4)).snapshot().players;
    for (let seed = 0; seed < 100; seed++) {
      const q = classroomQuiz(players, 1, seed, 0, 720, 432);
      expect(new Set(q.offer.pads.map(p => p.answer)).size).toBe(3);
      expect(q.offer.pads.filter(p => p.id === q.correctId)).toHaveLength(1);
      expect(q.explain).not.toContain('undefined'); expect(q.endsAt).toBe(15);
    }
  });
  it('rate-limits lessons to eight seconds and prioritizes new concepts', () => {
    const q = new LessonQueue(), events: unknown[] = []; const emit = (e: unknown) => events.push(e);
    q.offer('component', 'p0', { loc: 100 }); q.step(0, emit); q.offer('component', 'p0', { loc: 100 });
    q.offer('test-coverage', 'p1', { percent: 20 }); q.step(7.9, emit); expect(events).toHaveLength(1);
    q.step(8, emit); expect(events[1]).toMatchObject({ concept: 'test-coverage', facts: { percent: 20 } });
    q.step(16, emit); expect(events).toHaveLength(3);
  });
});

describe('two-player PvP duel', () => {
  it('spawns and bounds both duelists inside the rendered arena', () => {
    const match = createMatch(students(), null, { mode: 'pvp' });
    const assertVisible = () => {
      const state = match.snapshot();
      expect(state.pvp).toMatchObject({ arenaW: ARENA_W, arenaH: ARENA_H });
      expect(state.players).toHaveLength(2);
      for (const player of state.players) {
        expect(player.x).toBeGreaterThanOrEqual(32);
        expect(player.x).toBeLessThanOrEqual(ARENA_W - 32);
        expect(player.y).toBeGreaterThanOrEqual(32);
        expect(player.y).toBeLessThanOrEqual(ARENA_H - 32);
      }
    };
    assertVisible();
    advance(match, 10, new Map([['p0', frame({ move: [-1, -1] })], ['p1', frame({ move: [1, 1] })]]));
    assertVisible();
  });
  it('uses exactly two balanced heroes without a boss, quality rubric, lessons or quizzes', () => {
    expect(() => createMatch(students(1), null, { mode: 'pvp' })).toThrow('exactly two');
    expect(() => createMatch(students(3), null, { mode: 'pvp' })).toThrow('exactly two');
    const roster = students(), match = createMatch(roster, null, { mode: 'pvp' });
    const state = match.snapshot();
    expect(state.mode).toBe('pvp'); expect(state.boss).toBeNull();
    expect(state.players.map(p => p.kit)).toEqual(roster.map(p => p.kit));
    expect(state.players.every(p => !p.kit.quality)).toBe(true);
    advance(match, 80);
    const second = match.snapshot();
    expect(second.pvp?.round).toBe(2); expect(second.perkOffer).toBeNull();
    expect(second.events.some(e => e.type === 'lesson')).toBe(false);
  });
  it('supports moving while firing, hurts only the opponent and finishes best of three', () => {
    const match = createMatch(students(), null, { mode: 'pvp' }), raw = internals(match);
    advance(match, 4.1);
    const [a, b] = raw.state.players; a.x = 200; a.y = 200; b.x = 260; b.y = 200;
    advance(match, .5, new Map([[a.id, frame({ move: [1, 0], fire: true, aim: [1, 0] })]]));
    expect(a.x).toBeGreaterThan(200); expect(a.hp).toBe(a.kit.maxHp);
    expect(raw.state.pvp.scores[a.id].damage).toBeGreaterThan(0);
    expect(match.snapshot().events.some(event => event.type === 'lesson')).toBe(false);
    raw.endRound();
    raw.state.pvp.scores[a.id].roundWins = 1;
    raw.state.players[1].invuln = 0;
    raw.hurt(raw.state.players[1], raw.state.players[0], 1, [1, 0]);
    raw.endRound();
    expect(match.over).toBe(true); expect(match.autopsy().mode).toBe('pvp');
    expect(match.autopsy().ranking?.[0].id).toBe(a.id);
  });
  it('reports a draw for equal final scores', () => {
    const match = createMatch(students(), null, { mode: 'pvp' });
    advance(match, 230);
    expect(match.over).toBe(true); expect(match.autopsy().mvp).toBeNull();
    expect(match.autopsy().ranking?.every(p => p.roundWins === 0)).toBe(true);
  });
  it('ends a duel when a player leaves and ranks the remaining player first', () => {
    const match = createMatch(students(), null, { mode: 'pvp' });
    match.removePlayer('p0');
    expect(match.over).toBe(true); expect(match.autopsy().mvp).toBe('p1');
    expect(match.autopsy().ranking?.[0].id).toBe('p1');
  });
});
