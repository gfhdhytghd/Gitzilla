import type { Autopsy, Bullet, Concept, GameEvent, InputFrame, MatchState, PlayerKit, PlayerState, PvpState } from '../shared/types.ts';
import { ARENA_W, ARENA_H } from '../shared/types.ts';
import type { Match } from './match.ts';
import { clamp, distance, random, unit } from './math.ts';
import { safeInput } from './input.ts';
import { asClassroomKit, qualityValue, type ClassroomKit } from './quality.ts';
import { LessonQueue } from './lessons.ts';
import { classroomQuiz, type ClassroomQuiz } from './quiz.ts';
import { WEAPONS } from './weapons.ts';
import { forgetPlayer } from './departure.ts';

export interface ClassroomPvpState extends PvpState {
  arenaW: number; arenaH: number;
  phase: 'countdown' | 'round' | 'quiz' | 'reveal' | 'finished';
  quizEndsAt: number | null;
  quizScores: Record<string, number>;
}
export type ClassroomState = MatchState & { mode: 'edu' | 'pvp'; boss: null; heroScale: 2; pvp: ClassroomPvpState };
export type ClassroomRankingRow = NonNullable<Autopsy['ranking']>[number] & { left?: boolean };
export type ClassroomAutopsy = Omit<Autopsy, 'ranking'> & { ranking: ClassroomRankingRow[] };
type Student = { id: string; name: string; kit: PlayerKit };
interface Runtime {
  shot: number; lastHit: number; armor: number; dash: number; direction: [number, number];
  buff: number; respawn: number; streak: number; slow: boolean;
  history: { t: number; x: number; y: number }[];
}
interface Shot { damage: number; life: number }

export function pvpArenaSize(count: number) {
  const scale = Math.max(1, Math.sqrt(count / 8));
  return { width: Math.ceil(720 * scale / 16) * 16, height: Math.ceil(432 * scale / 16) * 16 };
}

function segmentCircle(b: Bullet, x0: number, y0: number, p: PlayerState): number | null {
  const dx = b.x - x0, dy = b.y - y0, fx = x0 - p.x, fy = y0 - p.y, radius = 12 + b.r;
  const c = fx * fx + fy * fy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a < 1e-10) return null;
  const linear = 2 * (fx * dx + fy * dy), disc = linear * linear - 4 * a * c;
  if (disc < 0) return null;
  const t = (-linear - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export class ClassroomMatch implements Match {
  private state: ClassroomState;
  private runtime = new Map<string, Runtime>();
  private byId = new Map<string, PlayerState>();
  private shots = new Map<number, Shot>();
  private roundScores = new Map<string, { kos: number; damage: number }>();
  private nextBuff = new Set<string>();
  private departed = new Map<string, ClassroomRankingRow>();
  private lessons = new LessonQueue();
  private quiz: ClassroomQuiz | null = null;
  private holds = new Map<string, { pad: string; t: number }>();
  private id = 1;
  private forfeited = false;
  private seed = 0x434c4153;
  private rng: () => number;
  private width: number;
  private height: number;

  constructor(students: Student[], private duel = false) {
    if (duel && students.length !== 2) throw new Error('PvP requires exactly two players');
    if (students.length < 2 || students.length > 30) throw new Error('Classroom PvP needs 2–30 students');
    this.seed = students.reduce((seed, p) => [...p.id].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), seed), this.seed);
    this.rng = random(this.seed);
    // The direct-control duel uses the renderer's arena. The larger classroom
    // arena would spawn player two beyond the 480px viewport and camera bounds.
    const arena = duel ? { width: ARENA_W, height: ARENA_H } : pvpArenaSize(students.length);
    this.width = arena.width; this.height = arena.height;
    this.state = {
      t: 0, status: 'countdown', mode: duel ? 'pvp' : 'edu', boss: null, heroScale: 2,
      players: students.map(student => {
        const kit = duel ? structuredClone(student.kit) : asClassroomKit(student.kit);
        return { id: student.id, name: student.name, kit, x: 0, y: 0, vx: 0, vy: 0, facing: [1, 0], hp: kit.maxHp, armor: kit.maxArmor, energy: kit.maxEnergy,
          alive: true, downedFor: 0, reviveProgress: 0, skillCd: 0, dashCd: 0, invuln: 2, buffs: [], perks: [],
          stats: { damage: 0, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false } };
      }),
      pvp: { round: 1, rounds: 3, roundEndsAt: 77, scores: {}, leader: null, arenaW: this.width, arenaH: this.height, phase: 'countdown', quizEndsAt: null, quizScores: {} },
      bullets: [], hazards: [], minions: [], events: [], obstacles: [], pickups: [], perkOffer: null,
    };
    for (const p of this.state.players) {
      this.byId.set(p.id, p);
      this.runtime.set(p.id, { shot: 0, lastHit: -10, armor: 0, dash: 0, direction: [1, 0], buff: 0, respawn: 0, streak: 0, slow: false, history: [] });
      this.state.pvp.scores[p.id] = { kos: 0, downs: 0, damage: 0, roundWins: 0 };
      this.state.pvp.quizScores[p.id] = 0; this.roundScores.set(p.id, { kos: 0, damage: 0 });
    }
    this.state.players.forEach((p, i) => this.resetPlayer(p, this.spawnPoints()[i]));
  }

  get over() { return this.state.pvp.phase === 'finished'; }
  removePlayer(id: string): void {
    const s = this.state, p = this.byId.get(id);
    if (!p) return;
    const score = s.pvp.scores[id];
    this.departed.set(id, { id, name: p.name, repo: p.kit.repo, kos: score.kos, damage: score.damage,
      roundWins: score.roundWins, quality: structuredClone(p.kit.quality ?? []), left: true });
    s.players = s.players.filter(other => other.id !== id);
    this.byId.delete(id); this.runtime.delete(id); this.roundScores.delete(id); this.holds.delete(id); this.nextBuff.delete(id);
    delete s.pvp.scores[id]; delete s.pvp.quizScores[id];
    for (const bullet of forgetPlayer(s, id)) this.shots.delete(bullet);
    this.lessons.removePlayer(id);
    this.updateLeader();
    if (!s.players.length || (this.duel && s.players.length < 2)) { this.finish(true); return; }
    if (!this.over && this.quiz?.subject === id) {
      // The question's subject left. Reopen only this quiz, giving the remaining
      // students a fair answer window; combat time, HP and round scores stay intact.
      for (const student of this.nextBuff) s.pvp.quizScores[student] = Math.max(0, s.pvp.quizScores[student] - 1);
      this.nextBuff.clear(); this.holds.clear();
      this.quiz = classroomQuiz(s.players, s.pvp.round, this.seed, s.t, this.width, this.height);
      s.perkOffer = this.quiz.offer; s.pvp.phase = 'quiz'; s.pvp.quizEndsAt = this.quiz.endsAt;
    }
  }
  step(dt: number, inputs: Map<string, InputFrame>) {
    let left = clamp(dt, 0, 0.25);
    let safe = new Map([...inputs].map(([id, frame]) => [id, safeInput(frame)]));
    while (left > 1e-6 && !this.over) {
      const slice = Math.min(1 / 30, left); this.tick(slice, safe); left -= slice;
      if (left > 1e-6) safe = new Map([...safe].map(([id, frame]) => [id, { ...frame, dash: false, skill: false }]));
    }
  }
  private tick(dt: number, inputs: Map<string, InputFrame>) {
    const s = this.state;
    s.t += dt;
    if (s.status === 'countdown') {
      if (s.t < 2) return;
      s.status = 'fighting'; s.pvp.phase = 'round';
    }
    const active = s.pvp.phase === 'round';
    for (const p of s.players) this.updatePlayer(p, dt, inputs.get(p.id), active);
    if (active) {
      this.updateBullets(dt);
      if (s.t >= s.pvp.roundEndsAt) this.endRound();
    } else this.updateQuiz(dt);
    this.updateLeader();
    this.lessons.step(s.t, event => this.emit(event));
  }

  private spawnPoints() {
    const count = this.state.players.length, cols = Math.ceil(Math.sqrt(count * this.width / this.height)), rows = Math.ceil(count / cols);
    return Array.from({ length: count }, (_, i) => ({
      x: cols === 1 ? this.width / 2 : 64 + (i % cols) * (this.width - 128) / (cols - 1),
      y: rows === 1 ? this.height / 2 : 64 + Math.floor(i / cols) * (this.height - 128) / (rows - 1),
    }));
  }
  private resetPlayer(p: PlayerState, position: { x: number; y: number }) {
    const r = this.runtime.get(p.id)!;
    p.x = position.x; p.y = position.y; p.vx = p.vy = 0;
    p.hp = p.kit.maxHp; p.armor = p.kit.maxArmor; p.energy = p.kit.maxEnergy;
    p.alive = true; p.downedFor = p.reviveProgress = p.dashCd = p.skillCd = 0; p.invuln = 2; p.buffs = [];
    r.shot = 0; r.lastHit = this.state.t; r.armor = r.dash = r.buff = r.respawn = 0; r.streak = 0; r.slow = false; r.history = [];
  }
  private respawn(p: PlayerState) {
    const others = this.state.players.filter(other => other.id !== p.id && other.alive);
    const points = this.spawnPoints().sort((a, b) => Math.min(...others.map(p => distance(p, b)), Infinity) - Math.min(...others.map(p => distance(p, a)), Infinity));
    this.resetPlayer(p, points[0]); this.emit({ type: 'revived', player: p.id, by: p.id });
  }
  private target(p: PlayerState) {
    const foes = this.state.players.filter(other => other.id !== p.id && other.alive);
    const exposed = foes.filter(other => other.invuln <= 0);
    return (exposed.length ? exposed : foes).sort((a, b) => distance(p, a) - distance(p, b))[0];
  }
  private updatePlayer(p: PlayerState, dt: number, input: InputFrame | undefined, active: boolean) {
    const r = this.runtime.get(p.id)!;
    p.skillCd = Math.max(0, p.skillCd - dt); p.dashCd = Math.max(0, p.dashCd - dt); p.invuln = Math.max(0, p.invuln - dt);
    r.shot = Math.max(-dt, r.shot - dt); r.dash -= dt; r.buff -= dt;
    if (!p.alive) {
      p.downedFor += dt; r.respawn -= dt; p.reviveProgress = clamp(1 - r.respawn / 2.5, 0, 1); p.vx = p.vy = 0;
      if (active && r.respawn <= 0) this.respawn(p);
      return;
    }
    if (r.buff <= 0) p.buffs = p.buffs.filter(b => b === 'tech-debt');
    p.energy = Math.min(p.kit.maxEnergy, p.energy + dt * qualityValue(p.kit, 'regen', 6) * (p.perks.includes('quiz-boost') ? 1.1 : 1));
    if (this.state.t - r.lastHit >= 3 && p.armor < p.kit.maxArmor) {
      r.armor += dt;
      if (r.armor >= 1.5) { p.armor = Math.min(p.kit.maxArmor, p.armor + 1); r.armor = 0; }
    }
    r.history.push({ t: this.state.t, x: p.x, y: p.y });
    while (r.history.length && r.history[0].t < this.state.t - 2) r.history.shift();
    const foe = this.target(p), aim = input?.aim ?? (foe ? unit(foe.x - p.x, foe.y - p.y) : p.facing);
    p.facing = aim;
    const [mx, my] = input?.move ?? [0, 0];
    if (input?.dash && p.dashCd <= 0) { r.direction = Math.hypot(mx, my) > 0.1 ? unit(mx, my) : aim; r.dash = 0.19; p.dashCd = 1.7; p.invuln = Math.max(p.invuln, 0.24); }
    const facts = this.duel ? undefined : (p.kit as ClassroomKit).classroom;
    const slow = active && (facts?.todoDensity ?? 0) > 0 && (this.state.t + (p.kit.seed >>> 0) % 120 / 10) % 12 < 1.5;
    if (slow && !r.slow) this.lessons.offer('tech-debt', p.id, { player: p.name, repo: p.kit.repo, todos: facts!.todoCount, density: facts!.todoDensity.toFixed(1),
      text: `${p.name}'s open TODOs add a short game slow. The analyzed repo has ${facts!.todoCount} TODO/FIXME/HACK notes.` });
    r.slow = slow;
    p.buffs = p.buffs.filter(b => b !== 'tech-debt'); if (slow) p.buffs.push('tech-debt');
    const speed = p.kit.speed * (slow ? 1 - Math.min(0.25, facts!.todoDensity * 0.015) : 1) * (p.buffs.includes('overclock') ? 1.15 : 1);
    p.vx = r.dash > 0 ? r.direction[0] * 310 : mx * speed; p.vy = r.dash > 0 ? r.direction[1] * 310 : my * speed;
    p.x = clamp(p.x + p.vx * dt, 32, this.width - 32); p.y = clamp(p.y + p.vy * dt, 32, this.height - 32);
    if (active && input?.skill && p.skillCd <= 0) this.skill(p);
    if (active && input?.fire && r.shot <= 0) this.fire(p);
  }
  private skill(p: PlayerState) {
    const r = this.runtime.get(p.id)!; p.skillCd = p.kit.skill === 'hotfix' ? 16 : 12;
    this.emit({ type: 'skill', player: p.id, skill: p.kit.skill });
    if (p.kit.skill === 'hotfix') p.hp = Math.min(p.kit.maxHp, p.hp + 3);
    else if (p.kit.skill === 'rollback') {
      const old = r.history[0]; if (old) { p.x = old.x; p.y = old.y; }
      p.invuln = Math.max(p.invuln, 0.5);
      this.state.bullets = this.state.bullets.filter(b => {
        if (b.owner !== p.id && distance(p, b) < 60) { this.shots.delete(b.id); return false; } return true;
      });
      p.buffs.push('rollback'); r.buff = 0.7;
    } else {
      p.buffs = [...new Set([...p.buffs, p.kit.skill])]; r.buff = 4;
      if (p.kit.skill === 'firewall') p.armor = Math.min(p.kit.maxArmor, p.armor + 3);
    }
  }
  private fire(p: PlayerState) {
    if (this.state.bullets.length >= 1200) return;
    const w = WEAPONS[p.kit.weapon], r = this.runtime.get(p.id)!;
    if (p.energy < w.cost) return;
    p.energy -= w.cost; r.shot += w.interval / (p.buffs.includes('overclock') ? 1.35 : 1);
    const angle = Math.atan2(p.facing[1], p.facing[0]);
    for (let i = 0; i < w.count && this.state.bullets.length < 1200; i++) {
      const a = angle + (w.count === 1 ? (this.rng() - 0.5) * w.spread : (i / (w.count - 1) - 0.5) * w.spread);
      const id = this.id++;
      this.state.bullets.push({ id, owner: p.id, kind: p.kit.weapon, x: p.x + Math.cos(a) * 15, y: p.y + Math.sin(a) * 15,
        vx: Math.cos(a) * w.speed * 1.35, vy: Math.sin(a) * w.speed * 1.35, r: w.r * 1.35 });
      this.shots.set(id, { damage: w.damage * p.kit.damageMul * 0.14 * (p.perks.includes('quiz-boost') ? 1.1 : 1), life: w.life });
    }
  }
  private updateBullets(dt: number) {
    const live: Bullet[] = [];
    for (const b of this.state.bullets) {
      const shot = this.shots.get(b.id)!; shot.life -= dt;
      if (b.kind === 'staff') {
        const foe = this.state.players.filter(p => p.alive && p.id !== b.owner).sort((a, c) => distance(b, a) - distance(b, c))[0];
        if (foe) { const [x, y] = unit(foe.x - b.x, foe.y - b.y); b.vx += (x * 216 - b.vx) * dt * 4; b.vy += (y * 216 - b.vy) * dt * 4; }
      }
      const x0 = b.x, y0 = b.y; b.x += b.vx * dt; b.y += b.vy * dt;
      let victim: PlayerState | undefined, first = Infinity;
      for (const p of this.state.players) {
        if (!p.alive || p.id === b.owner || p.invuln > 0) continue;
        const t = segmentCircle(b, x0, y0, p); if (t !== null && t < first) { first = t; victim = p; }
      }
      if (victim) this.hurt(victim, this.byId.get(b.owner)!, shot.damage, unit(b.vx, b.vy));
      if (!victim && shot.life > 0 && b.x > 12 && b.x < this.width - 12 && b.y > 12 && b.y < this.height - 12) live.push(b);
      else this.shots.delete(b.id);
    }
    this.state.bullets = live;
  }
  private hurt(target: PlayerState, source: PlayerState, base: number, direction: [number, number]) {
    if (!target.alive || target.invuln > 0 || target.id === source.id) return;
    const weakness = qualityValue(target.kit, 'weakness', 0);
    const amount = Math.min(target.hp + target.armor, target.kit.maxHp * 0.4, base * (1 + weakness) * (target.buffs.includes('firewall') ? 0.65 : target.buffs.includes('fork') ? 0.75 : 1));
    const armor = Math.min(target.armor, amount); target.armor -= armor; target.hp = Math.max(0, target.hp - amount + armor);
    const r = this.runtime.get(target.id)!; r.lastHit = this.state.t; r.armor = 0;
    source.stats.damage += amount; this.state.pvp.scores[source.id].damage += amount; this.roundScores.get(source.id)!.damage += amount;
    this.emit({ type: 'hit', target: target.id, source: source.id, amount, x: target.x, y: target.y, direction, crit: weakness > 0, impact: clamp(amount / 4, 0.1, 1), hitStop: amount >= 3 ? 40 : 0 });
    const facts = this.duel ? undefined : (source.kit as ClassroomKit).classroom, damage = source.kit.quality?.find(q => q.stat === 'damage');
    if (!this.duel) this.lessons.offer('component', source.id, { player: source.name, repo: source.kit.repo, component: facts?.components[0]?.name ?? source.kit.repo,
      amount: Number(amount.toFixed(1)), grade: damage?.grade ?? 'C', cycles: facts?.cycles.length ?? 0, signal: damage?.signal ?? 'Analysis unavailable',
      text: `${source.name} dealt ${amount.toFixed(1)} damage. Their damage grade ${damage?.grade ?? 'C'} comes from ${damage?.signal ?? 'a neutral value until analysis is available'}.` });
    if (armor > 0) {
      const f = (target.kit as ClassroomKit).classroom;
      if (!this.duel) this.lessons.offer('test-coverage', target.id, { player: target.name, repo: target.kit.repo, percent: Number(((f?.testRatio ?? 0) * 100).toFixed(1)), armor: target.kit.maxArmor,
        text: `${target.name}'s test-derived armor absorbed ${armor.toFixed(1)} damage. ${target.kit.quality?.find(q => q.stat === 'armor')?.signal ?? 'Source analysis is unavailable.'}` });
    }
    const targetFacts = this.duel ? undefined : (target.kit as ClassroomKit).classroom;
    if (targetFacts?.cycles.length) this.lessons.offer('circular-dependency', target.id, { player: target.name, repo: target.kit.repo, members: targetFacts.cycles[0].join(' ↔ '), cycles: targetFacts.cycles.length, bonus: Math.round(weakness * 100) });
    if (target.hp <= 0) {
      target.alive = false; target.downedFor = 0; target.reviveProgress = 0; r.respawn = 2.5; r.streak = 0; target.vx = target.vy = 0;
      this.state.pvp.scores[source.id].kos++; this.state.pvp.scores[target.id].downs++; this.roundScores.get(source.id)!.kos++;
      const attacker = this.runtime.get(source.id)!; attacker.streak++; source.stats.bestCombo = Math.max(source.stats.bestCombo, attacker.streak);
      this.emit({ type: 'downed', player: target.id });
      if (targetFacts) this.lessons.offer('heart-module', target.id, { player: target.name, repo: target.kit.repo, heart: targetFacts.heart, fanIn: targetFacts.heartFanIn,
        text: `${target.name} is restarting. Their heart file ${targetFacts.heart} has ${targetFacts.heartFanIn} analyzed incoming dependencies.` });
    }
    const advisory = targetFacts?.vulns[0];
    if (advisory) this.lessons.offer('vulnerability', target.id, { player: target.name, id: advisory.id, pkg: advisory.pkg, fixed: advisory.fixed ?? 'not reported',
      text: `${advisory.pkg} has the public advisory ${advisory.id}. ${advisory.fixed ? `A reported fixed version is ${advisory.fixed}.` : 'Check the advisory for upgrade guidance.'}` });
  }
  private ranked() {
    return [...this.state.players].sort((a, b) => {
      const x = this.state.pvp.scores[a.id], y = this.state.pvp.scores[b.id];
      return y.roundWins - x.roundWins || y.kos - x.kos || y.damage - x.damage || x.downs - y.downs || a.id.localeCompare(b.id);
    });
  }
  private updateLeader() {
    const leader = this.ranked()[0];
    if (!leader) { this.state.pvp.leader = null; return; }
    const score = this.state.pvp.scores[leader.id];
    if (this.duel) {
      const other = this.ranked()[1];
      const next = other ? this.state.pvp.scores[other.id] : undefined;
      if (next && next.roundWins === score.roundWins && next.kos === score.kos && next.damage === score.damage && next.downs === score.downs) { this.state.pvp.leader = null; return; }
    }
    this.state.pvp.leader = score.kos > 0 || score.damage > 0 || score.roundWins > 0 ? leader.id : null;
  }
  private endRound() {
    if (!this.state.players.length) { this.finish(true); return; }
    const sorted = [...this.state.players].sort((a, b) => {
      const x = this.roundScores.get(a.id)!, y = this.roundScores.get(b.id)!; return y.kos - x.kos || y.damage - x.damage || a.id.localeCompare(b.id);
    });
    const winner = sorted[0], score = this.roundScores.get(winner.id)!;
    const runnerUp = sorted[1] ? this.roundScores.get(sorted[1].id) : undefined;
    const tied = this.duel && runnerUp?.kos === score.kos && runnerUp.damage === score.damage;
    if (!tied && (score.kos > 0 || score.damage > 0)) this.state.pvp.scores[winner.id].roundWins++;
    this.state.bullets = []; this.shots.clear();
    if (this.state.pvp.round >= 3 || this.state.pvp.scores[winner.id].roundWins >= 2) { this.finish(); return; }
    const s = this.state;
    if (this.duel) {
      s.pvp.round++; s.pvp.roundEndsAt = s.t + 75;
      s.players.forEach((p, i) => { this.resetPlayer(p, this.spawnPoints()[i]); this.roundScores.set(p.id, { kos: 0, damage: 0 }); });
      return;
    }
    this.quiz = classroomQuiz(s.players, s.pvp.round, this.seed, s.t, this.width, this.height);
    s.perkOffer = this.quiz.offer; s.pvp.phase = 'quiz'; s.pvp.quizEndsAt = this.quiz.endsAt; this.holds.clear(); this.nextBuff.clear();
    s.players.forEach((p, i) => this.resetPlayer(p, { x: this.width / 2 + (i % 6 - 2.5) * 24, y: this.height / 2 + 80 + Math.floor(i / 6) * 18 }));
  }
  private updateQuiz(dt: number) {
    const s = this.state, quiz = this.quiz!, offer = s.perkOffer!;
    const progress: Record<string, { pad: string; t: number }> = {};
    Object.assign(offer, { progress });
    const choose = (p: PlayerState, id: string) => {
      const correct = id === quiz.correctId; offer.picked[p.id] = id;
      if (correct) { this.nextBuff.add(p.id); s.pvp.quizScores[p.id]++; }
      this.emit({ type: 'perk', player: p.id, perk: correct ? 'quiz-boost' : 'review-note', correct });
    };
    if (s.pvp.phase === 'quiz') for (const p of s.players) {
      if (offer.picked[p.id]) continue;
      const pad = offer.pads.find(pad => distance(p, pad) <= pad.r), old = this.holds.get(p.id);
      if (pad) { const t = old?.pad === pad.id ? old.t + dt : dt; this.holds.set(p.id, { pad: pad.id, t }); progress[p.id] = { pad: pad.id, t: clamp(t, 0, 1) }; if (t >= 1 - 1e-6) choose(p, pad.id); }
      else this.holds.delete(p.id);
      if (!offer.picked[p.id] && s.t >= offer.endsAt) choose(p, [...offer.pads].sort((a, b) => distance(p, a) - distance(p, b))[0].id);
    }
    if (s.t >= offer.endsAt && s.pvp.phase === 'quiz') {
      s.pvp.phase = 'reveal'; offer.pads.forEach(p => { p.correct = p.id === quiz.correctId; }); offer.quiz!.explain = quiz.explain;
      if (!this.duel) this.lessons.offer(offer.quiz!.concept as Concept, quiz.subject, { question: offer.quiz!.question, answer: offer.pads.find(p => p.id === quiz.correctId)!.answer!, explain: quiz.explain });
    }
    if (s.t >= quiz.endsAt) {
      s.pvp.round++; s.pvp.phase = 'round'; s.pvp.roundEndsAt = s.t + 75; s.pvp.quizEndsAt = null; s.perkOffer = null; this.quiz = null;
      s.players.forEach((p, i) => {
        this.resetPlayer(p, this.spawnPoints()[i]); p.perks = this.nextBuff.has(p.id) ? ['quiz-boost'] : [];
        this.roundScores.set(p.id, { kos: 0, damage: 0 });
      });
    }
  }
  private finish(abandoned = false) {
    if (this.over) return;
    this.forfeited = abandoned;
    this.updateLeader(); this.state.pvp.phase = 'finished'; this.state.status = abandoned ? 'defeat' : 'victory';
    this.state.perkOffer = null; this.state.pvp.quizEndsAt = null; this.quiz = null; this.holds.clear(); this.nextBuff.clear();
    this.emit({ type: abandoned ? 'defeat' : 'victory' });
  }
  private emit(event: GameEvent) { this.state.events.push(event); }
  snapshot(): ClassroomState { const copy = structuredClone(this.state); this.state.events = []; return copy; }
  autopsy(): ClassroomAutopsy {
    this.updateLeader();
    const ranking: ClassroomRankingRow[] = this.ranked().map(p => ({ id: p.id, name: p.name, repo: p.kit.repo, kos: this.state.pvp.scores[p.id].kos,
      damage: this.state.pvp.scores[p.id].damage, roundWins: this.state.pvp.scores[p.id].roundWins, quality: structuredClone(p.kit.quality ?? []) }));
    ranking.push(...structuredClone([...this.departed.values()]));
    ranking.sort((a, b) => (this.duel && this.forfeited ? Number(!!a.left) - Number(!!b.left) : 0) || b.roundWins - a.roundWins || b.kos - a.kos || b.damage - a.damage || a.id.localeCompare(b.id));
    return { mode: this.duel ? 'pvp' : 'edu', victory: this.duel && this.state.players.length > 0, boss: null, duration: Math.max(0, this.state.t - 2), mvp: this.duel && this.forfeited ? this.state.players[0]?.id ?? null : this.state.pvp.leader,
      players: this.state.players.map(p => ({ id: p.id, name: p.name, repo: p.kit.repo, stats: { ...p.stats } })),
      ranking };
  }
}
