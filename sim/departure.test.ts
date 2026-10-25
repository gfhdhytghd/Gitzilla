import { describe, expect, it } from 'vitest';
import type { BossAttack, InputFrame, PlayerState } from '../shared/types.ts';
import { createMatch, type BattleState, type Match } from './match.ts';
import { ClassroomMatch, type ClassroomState } from './pvp.ts';
import { playerKitFromProfile, bossKitFromProfile } from './kits.ts';
import { createBot, syntheticProfile } from './bots.ts';
import { qualityProfile } from './classroom-bots.ts';

const frame = (patch: Partial<InputFrame> = {}): InputFrame => ({ seq: 1, move: [0, 0], aim: null, fire: false, dash: false, skill: false, source: 'keyboard', ...patch });
const advance = (m: Match, seconds: number, inputs = new Map<string, InputFrame>()) => { for (let i = 0; i < Math.ceil(seconds * 30); i++) m.step(1 / 30, inputs); };
const roster = (count = 3) => Array.from({ length: count }, (_, i) => ({ id: i === 2 ? 'bot-c' : `p${i}`, name: `Player ${i}`, kit: playerKitFromProfile(qualityProfile(i % 2 === 0, i + 1)) }));
interface BattleRaw {
  state: BattleState; players: Map<string, unknown>; shots: Map<number, unknown>; decoys: Map<string, unknown>;
  recent: Map<string, Map<string, number>>; reviveBy: Map<string, string>; reviewProgress: Map<string, { pad: string; t: number }>;
  pressure: { targetPlayer: string; hazardId: number }[]; charge: unknown; pending: unknown[];
  hazardData: Map<number, { targetPlayer?: string; attackId: string }>;
  skill(p: PlayerState): void; telegraph(a: BossAttack, target: [number, number]): void;
  attack(a: BossAttack, target: [number, number]): void; updatePressure(dt: number, players: PlayerState[]): void; beginReview(): void;
}
interface PvpRaw {
  state: ClassroomState; runtime: Map<string, unknown>; byId: Map<string, unknown>; shots: Map<number, unknown>;
  holds: Map<string, { pad: string; t: number }>; nextBuff: Set<string>;
  quiz: { subject: string; endsAt: number; correctId: string };
  hurt(target: PlayerState, source: PlayerState, amount: number, direction: [number, number]): void;
}
const battle = (count = 3) => createMatch(roster(count), bossKitFromProfile(syntheticProfile(5), count));

describe('battle explicit player departure', () => {
  it('removes owned shots/runtime/unsent cues while teammates and bots continue without a reset', () => {
    const m = battle(), raw = m as unknown as BattleRaw; advance(m, 2.1);
    advance(m, 0.1, new Map(raw.state.players.map(p => [p.id, frame({ fire: true })])));
    const owned = raw.state.bullets.filter(b => b.owner === 'p0').map(b => b.id);
    expect(owned.length).toBeGreaterThan(0);
    const t = raw.state.t, hp = raw.state.boss.hp, friendHp = raw.state.players[1].hp;
    raw.state.events.push({ type: 'revived', player: 'p1', by: 'p0' }, { type: 'telegraph', attackId: 'test', name: 'test', targetPlayer: 'p0' });
    m.removePlayer('p0'); m.removePlayer('p0'); m.removePlayer('unknown');
    expect(raw.state.players.map(p => p.id)).toEqual(['p1', 'bot-c']); expect(raw.players.has('p0')).toBe(false);
    expect(raw.state.bullets.some(b => b.owner === 'p0')).toBe(false); expect(owned.every(id => !raw.shots.has(id))).toBe(true);
    expect(raw.state.bullets.some(b => b.owner === 'p1')).toBe(true);
    expect(raw.state.t).toBe(t); expect(raw.state.boss.hp).toBe(hp); expect(raw.state.players[0].hp).toBe(friendHp);
    expect(raw.state.events).not.toContainEqual(expect.objectContaining({ by: 'p0' }));
    expect(raw.state.events).not.toContainEqual(expect.objectContaining({ targetPlayer: 'p0' }));
    advance(m, 0.3, new Map([['p1', frame({ move: [1, 0], fire: true })], ['p0', frame({ fire: true })]]));
    expect(m.snapshot().t).toBeGreaterThan(t); expect(m.over).toBe(false); expect(m.autopsy().players.some(p => p.id === 'p0')).toBe(false);
  });
  it('cancels aggro, a targeted cast and queued charge/spiral effects', () => {
    const m = battle(), raw = m as unknown as BattleRaw, s = raw.state;
    s.boss.kit.archetype = 'kaiju';
    const attack = { ...s.boss.kit.attacks[0], kind: 'slam' as const };
    s.boss.targetPlayer = 'p0'; s.boss.casting = { attackId: attack.id, t: 0, total: 1, target: [90, 90] };
    raw.telegraph(attack, [90, 90]); raw.attack({ ...attack, kind: 'charge' }, [90, 90]); raw.attack({ ...attack, kind: 'spiral' }, [90, 90]);
    expect(raw.charge).not.toBeNull(); expect(raw.pending.length).toBeGreaterThan(0);
    m.removePlayer('p0');
    expect(s.boss.targetPlayer).toBeNull(); expect(s.boss.casting).toBeNull(); expect(raw.charge).toBeNull(); expect(raw.pending).toHaveLength(0);
    expect(s.hazards).toHaveLength(0);
  });
  it('removes only the departed player’s pressure lane and secondary cascade target', () => {
    const m = battle(6), raw = m as unknown as BattleRaw, s = raw.state;
    raw.updatePressure(4.6, s.players);
    expect(raw.pressure).toHaveLength(2); const keep = raw.pressure.find(p => p.targetPlayer !== 'p0')!.hazardId;
    s.boss.targetPlayer = 'p1'; const a = { ...s.boss.kit.attacks[0], kind: 'cascade' as const };
    raw.telegraph(a, [450, 250]);
    expect([...raw.hazardData.values()].some(h => h.targetPlayer === 'p0')).toBe(true);
    m.removePlayer('p0');
    expect(raw.pressure).toHaveLength(1); expect(s.hazards.some(h => h.id === keep)).toBe(true);
    expect([...raw.hazardData.values()].some(h => h.targetPlayer === 'p0')).toBe(false);
    expect(s.boss.targetPlayer).toBe('p1');
  });
  it('removes forks, firewall protection and combo participation', () => {
    const m = battle(), raw = m as unknown as BattleRaw, [left, friend] = raw.state.players;
    left.kit.skill = 'fork'; raw.skill(left); expect(raw.decoys.has(left.id)).toBe(true);
    left.kit.skill = 'firewall'; raw.skill(left); friend.x = left.x; friend.y = left.y; friend.buffs.push('firewall');
    raw.recent.set('heart', new Map([['p0', 1], ['p1', 1]]));
    m.removePlayer(left.id);
    expect(raw.decoys.has(left.id)).toBe(false); expect(friend.buffs).not.toContain('firewall');
    expect(raw.state.hazards.some(h => h.kind === 'firewall')).toBe(false);
    expect(raw.recent.get('heart')!.has('p0')).toBe(false); expect(raw.recent.get('heart')!.has('p1')).toBe(true);
  });
  it('breaks a departed helper’s partial revive link', () => {
    const m = battle(), raw = m as unknown as BattleRaw; advance(m, 2.1);
    const [left, downed, bot] = raw.state.players;
    left.x = 100; left.y = 100; downed.x = 101; downed.y = 100; downed.alive = false; downed.hp = 0; bot.x = 430; bot.y = 250;
    advance(m, 0.5); expect(downed.reviveProgress).toBeGreaterThan(0); expect(raw.reviveBy.get(downed.id)).toBe(left.id);
    m.removePlayer(left.id); expect(downed.reviveProgress).toBe(0); expect(raw.reviveBy.has(downed.id)).toBe(false);
    advance(m, 0.3); expect(downed.alive).toBe(false);
  });
  it('cleans review choices/hold state and ends immediately when the last player leaves', () => {
    const m = battle(2), raw = m as unknown as BattleRaw; raw.beginReview();
    raw.state.perkOffer!.picked.p0 = 'force'; raw.reviewProgress.set('p0', { pad: 'force', t: 0.4 });
    Object.assign(raw.state.perkOffer!, { progress: { p0: { pad: 'force', t: 0.4 } } });
    m.removePlayer('p0'); expect(raw.state.perkOffer!.picked).not.toHaveProperty('p0'); expect(raw.reviewProgress.has('p0')).toBe(false);
    expect((raw.state.perkOffer as unknown as { progress: object }).progress).not.toHaveProperty('p0');
    m.removePlayer('p1'); expect(m.over).toBe(true); expect(m.snapshot().status).toBe('defeat'); expect(raw.state.perkOffer).toBeNull();
    const t = raw.state.t; m.step(0.25, new Map()); expect(raw.state.t).toBe(t); expect(m.autopsy().mvp).toBeNull();
  });
});

describe('classroom explicit player departure', () => {
  it('archives scores marked left, removes active state/owned shots, and excludes the leaver from leader/MVP', () => {
    const m = new ClassroomMatch(roster()), raw = m as unknown as PvpRaw; advance(m, 4.1);
    const [left, friend] = raw.state.players; raw.hurt(friend, left, 1, [1, 0]);
    raw.state.pvp.scores[left.id].kos = 2;
    advance(m, 0.1, new Map([[left.id, frame({ fire: true })], [friend.id, frame({ fire: true })]]));
    const owned = raw.state.bullets.filter(b => b.owner === left.id).map(b => b.id), t = raw.state.t;
    m.removePlayer(left.id);
    expect(raw.state.pvp.scores).not.toHaveProperty(left.id); expect(raw.state.pvp.quizScores).not.toHaveProperty(left.id);
    expect(raw.byId.has(left.id)).toBe(false); expect(raw.runtime.has(left.id)).toBe(false);
    expect(raw.state.players.some(p => p.id === left.id)).toBe(false); expect(raw.state.bullets.some(b => b.owner === left.id)).toBe(false);
    expect(owned.length).toBeGreaterThan(0); expect(owned.every(id => !raw.shots.has(id))).toBe(true);
    const report = m.autopsy(), row = report.ranking.find(p => p.id === left.id)!;
    expect(row).toMatchObject({ left: true, kos: 2 }); expect(row.damage).toBeGreaterThan(0); expect(report.mvp).not.toBe(left.id);
    row.quality[0].signal = 'changed'; expect(m.autopsy().ranking.find(p => p.id === left.id)!.quality[0].signal).not.toBe('changed');
    const bot = createBot(2), state = m.snapshot();
    m.step(1 / 30, new Map(state.players.map(p => [p.id, bot(state, p)]))); expect(m.snapshot().t).toBeGreaterThan(t); expect(m.over).toBe(false);
  });
  it('never respawns a departed downed student', () => {
    const m = new ClassroomMatch(roster()), raw = m as unknown as PvpRaw; advance(m, 4.1);
    const [left, attacker] = raw.state.players;
    for (let i = 0; i < 10 && left.alive; i++) raw.hurt(left, attacker, 999, [1, 0]);
    expect(left.alive).toBe(false); m.removePlayer(left.id); advance(m, 4);
    expect(m.snapshot().players.some(p => p.id === left.id)).toBe(false);
    expect(m.autopsy().ranking.find(p => p.id === left.id)?.left).toBe(true);
  });
  it('removes quiz choices/holds/rewards without resetting a question about a remaining student', () => {
    const m = new ClassroomMatch(roster()), raw = m as unknown as PvpRaw; advance(m, 77.1);
    const left = raw.state.players.find(p => p.id !== raw.quiz.subject)!;
    raw.holds.set(left.id, { pad: raw.quiz.correctId, t: 0.5 }); raw.nextBuff.add(left.id);
    raw.state.perkOffer!.picked[left.id] = raw.quiz.correctId;
    Object.assign(raw.state.perkOffer!, { progress: { [left.id]: { pad: raw.quiz.correctId, t: 0.5 } } });
    const deadline = raw.quiz.endsAt;
    m.removePlayer(left.id);
    expect(raw.holds.has(left.id)).toBe(false); expect(raw.nextBuff.has(left.id)).toBe(false); expect(raw.state.perkOffer!.picked).not.toHaveProperty(left.id);
    expect(raw.quiz.endsAt).toBe(deadline); advance(m, 15.1);
    expect(m.snapshot().pvp.round).toBe(2); expect(m.snapshot().players.some(p => p.id === left.id)).toBe(false);
  });
  it('replaces a departed quiz subject with a real remaining student and a fair answer window', () => {
    const m = new ClassroomMatch(roster()), raw = m as unknown as PvpRaw; advance(m, 77.1);
    const subject = raw.quiz.subject, friend = raw.state.players.find(p => p.id !== subject)!;
    raw.state.perkOffer!.picked[friend.id] = raw.quiz.correctId; raw.nextBuff.add(friend.id); raw.state.pvp.quizScores[friend.id] = 1;
    const t = raw.state.t, hp = friend.hp;
    m.removePlayer(subject);
    expect(raw.quiz.subject).not.toBe(subject); expect(raw.byId.has(raw.quiz.subject)).toBe(true);
    expect(raw.quiz.endsAt).toBeCloseTo(t + 15); expect(raw.state.perkOffer!.picked).toEqual({}); expect(raw.state.pvp.quizScores[friend.id]).toBe(0);
    expect(raw.state.t).toBe(t); expect(friend.hp).toBe(hp); expect(raw.state.pvp.round).toBe(1);
    advance(m, 15.1); expect(m.snapshot().pvp.round).toBe(2);
  });
  it('ends an empty classroom idempotently with archived left entries and no ghost leader', () => {
    const m = new ClassroomMatch(roster(2));
    m.removePlayer('unknown'); expect(m.over).toBe(false);
    m.removePlayer('p0'); m.removePlayer('p1'); m.removePlayer('p1');
    const s = m.snapshot(); expect(m.over).toBe(true); expect(s.status).toBe('defeat'); expect(s.pvp.leader).toBeNull();
    expect(s.players).toEqual([]); expect(s.pvp.scores).toEqual({}); expect(s.perkOffer).toBeNull();
    expect(m.autopsy().ranking).toHaveLength(2); expect(m.autopsy().ranking.every(p => p.left)).toBe(true); expect(m.autopsy().mvp).toBeNull();
    m.step(0.25, new Map()); expect(m.snapshot().t).toBe(s.t);
    expect(s.events.filter(e => e.type === 'defeat')).toHaveLength(1);
  });
});
