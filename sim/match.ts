import { ARENA_H, ARENA_W } from '../shared/types.ts';
import type { Autopsy, BossAttack, BossKit, BossState, Bullet, GameEvent, GameMode, Hazard, InputFrame, MatchState, Pickup, PlayerKit, PlayerState, WeaponKind } from '../shared/types.ts';
import { BossAi } from './bossAi.ts';
import { clamp, distance, random, unit } from './math.ts';
import { activeBossRegions, bossMouth, bossRegions } from './regions.ts';
import { archetypeContactCost, ENCOUNTER_SEED, squadBudget, type HitFeedback } from './balance.ts';
import { createObstacles, segmentRect } from './arena.ts';
import { createPerkOffer, hasPerk } from './perks.ts';
import { safeInput } from './input.ts';
import { WEAPONS, SOLO_DAMAGE_MUL } from './weapons.ts';
import { ClassroomMatch } from './pvp.ts';
import type { SocialBossKit } from './social.ts';
import { reconcileCodeNames } from './code.ts';
import { forgetPlayer } from './departure.ts';
import { BossMotion } from './bossMotion.ts';
import { bossAnchors } from '../shared/kaiju-anatomy.ts';

export interface Match {
  removePlayer(id: string): void;
  step(dt: number, inputs: Map<string, InputFrame>): void;
  snapshot(): MatchState;
  autopsy(): Autopsy;
  readonly over: boolean;
}
export type BattleState = MatchState & { mode: 'battle'; boss: BossState; heroScale: 1; pvp: null };
export type BattleAutopsy = Autopsy & { mode: 'battle'; boss: NonNullable<Autopsy['boss']> };
export interface BattleMatch extends Match { snapshot(): BattleState; autopsy(): BattleAutopsy }

export { WEAPONS, SOLO_DAMAGE_MUL } from './weapons.ts';

interface PlayerRuntime {
  shot: number; lastDamage: number; armorTick: number; dash: number; dashDir: [number, number];
  buff: number; history: { t: number; x: number; y: number }[];
}
interface ShotRuntime { damage: number; life: number; push: number }
interface HazardRuntime { damage: number; telegraph: number; victims: Set<string>; attackId: string; targetPlayer?: string; mouth?: boolean; head?: number }

class ArenaMatch implements BattleMatch {
  private state: BattleState;
  private ai: BossAi;
  private id = 1;
  private players = new Map<string, PlayerRuntime>();
  private shots = new Map<number, ShotRuntime>();
  private hazardData = new Map<number, HazardRuntime>();
  private recent = new Map<string, Map<string, number>>();
  private limbDamage = new Map<string, number>();
  private charge: { vx: number; vy: number; t: number; damage: number } | null = null;
  private minionShot = 0;
  private pending: { t: number; angle: number; speed: number; damage: number; x: number; y: number; kind: string }[] = [];
  private decoys = new Map<string, { x: number; y: number; until: number }>();
  private pressureCd = 3;
  private pressureRound = 0;
  private pressure: { t: number; x: number; y: number; angle: number; targetPlayer: string; hazardId: number }[] = [];
  private dropExpiry = new Map<number, number>();
  private lootRng = random(ENCOUNTER_SEED ^ 0x4c4f4f54);
  private armorDropsLeft = 0;
  private reviewQueued = false;
  private reviewProgress = new Map<string, { pad: string; t: number }>();
  private reviewSeed = ENCOUNTER_SEED;
  private reviveBy = new Map<string, string>();
  private motion: BossMotion;
  private ending: { t: number; at: number } | null = null;

  constructor(players: { id: string; name: string; kit: PlayerKit }[], kit: BossKit) {
    this.ai = new BossAi(ENCOUNTER_SEED ^ players.length, players.length);
    this.armorDropsLeft = Math.max(1, Math.ceil(players.length / 2));
    this.reviewSeed = players.reduce((seed, p) => [...p.id].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), seed), ENCOUNTER_SEED);
    this.state = {
      t: 0, status: 'countdown', mode: 'battle', heroScale: 1, pvp: null, bullets: [], hazards: [], minions: [], events: [], obstacles: [], pickups: [], perkOffer: null,
      players: players.map((p, i) => ({
        ...p, kit: structuredClone(p.kit), x: 64 + i % 2 * 24, y: 70 + Math.floor(i / 2) * 47,
        vx: 0, vy: 0, facing: [1, 0], hp: p.kit.maxHp, armor: p.kit.maxArmor, energy: p.kit.maxEnergy,
        alive: true, downedFor: 0, reviveProgress: 0, skillCd: 0, dashCd: 0, invuln: 0, buffs: [], perks: [],
        stats: { damage: 0, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false },
      })),
      boss: { x: 335, y: 144, hp: kit.maxHp, maxHp: kit.maxHp, phase: 1, regions: [],
        limbs: kit.limbs.map(l => ({ id: l.id, hp: l.maxHp, maxHp: l.maxHp, broken: false })),
        casting: null, targetPlayer: null, enraged: false, pose: { name: 'idle', t: 0, total: 1, dir: [-1, 0] }, airborne: false, kit: reconcileCodeNames(kit) },
    };
    this.motion = new BossMotion(this.state.boss, players.length);
    this.state.boss.regions = bossRegions(this.state.boss);
    this.state.obstacles = createObstacles(kit, () => this.id++);
    for (const p of this.state.players) this.players.set(p.id, { shot: 0, lastDamage: -10, armorTick: 0, dash: 0, dashDir: [1, 0], buff: 0, history: [] });
  }

  get over() { return this.state.status === 'victory' || this.state.status === 'defeat'; }

  removePlayer(id: string): void {
    const s = this.state;
    if (!s.players.some(p => p.id === id)) return;
    s.players = s.players.filter(p => p.id !== id);
    this.players.delete(id); this.decoys.delete(id); this.reviewProgress.delete(id);
    this.motion.removePlayer(id);
    for (const bullet of forgetPlayer(s, id)) this.shots.delete(bullet);
    for (const hits of this.recent.values()) hits.delete(id);
    this.reviveBy.delete(id);
    for (const [downed, helper] of this.reviveBy) if (helper === id) {
      const p = s.players.find(p => p.id === downed); if (p) p.reviveProgress = 0;
      this.reviveBy.delete(downed);
    }
    const cancelled = new Set<number>();
    for (const stream of this.pressure) if (stream.targetPlayer === id) cancelled.add(stream.hazardId);
    this.pressure = this.pressure.filter(stream => stream.targetPlayer !== id);
    const castId = s.boss.targetPlayer === id ? s.boss.casting?.attackId : undefined;
    if (s.boss.targetPlayer === id) {
      s.boss.targetPlayer = null; s.boss.casting = null; this.charge = null; this.pending = [];
    }
    s.hazards = s.hazards.filter(h => {
      const meta = this.hazardData.get(h.id);
      if (cancelled.has(h.id) || meta?.targetPlayer === id || (castId && meta?.attackId === castId) || (h.kind === 'firewall' && meta?.attackId === id)) {
        this.hazardData.delete(h.id); return false;
      }
      meta?.victims.delete(id); return true;
    });
    for (const p of s.players) {
      p.buffs = p.buffs.filter(b => b !== 'firewall');
      if (s.hazards.some(h => h.kind === 'firewall' && distance(p, h) < h.r)) p.buffs.push('firewall');
    }
    if (!s.players.length) {
      s.perkOffer = null; s.boss.casting = null; s.boss.targetPlayer = null;
      s.bullets = []; this.shots.clear(); s.hazards = []; this.hazardData.clear();
      this.pressure = []; this.pending = []; this.charge = null;
      this.finish(false);
    }
  }

  step(dt: number, inputs: Map<string, InputFrame>) {
    inputs = new Map([...inputs].map(([id, frame]) => [id, safeInput(frame)]));
    // Substeps preserve collision behavior when a delayed server tick arrives.
    let remaining = clamp(dt, 0, 0.25);
    while (remaining > 0.000001 && !this.over) {
      const slice = Math.min(1 / 30, remaining);
      this.tick(slice, inputs);
      remaining -= slice;
      // Dash and skill are edges, so only consume them once in a catch-up step.
      if (remaining > 0.000001) inputs = new Map([...inputs].map(([id, frame]) => [id, { ...frame, dash: false, skill: false }]));
    }
  }

  private tick(dt: number, inputs: Map<string, InputFrame>) {
    const s = this.state;
    s.t += dt;
    if (this.ending) {
      this.ending.t += dt; this.motion.step(dt, [], true, false);
      if (this.ending.t >= 2 - 1e-6) { s.status = 'victory'; this.emit({ type: 'victory' }); }
      return;
    }
    if (s.status === 'countdown') {
      if (s.t < 2) { this.motion.step(dt, [], true, false); return; }
      s.status = 'fighting';
    }
    if (this.reviewQueued && s.boss.hp > 0) this.beginReview();
    for (const p of s.players) this.updatePlayer(p, dt, inputs.get(p.id));
    this.revive(dt);
    const living = s.players.filter(p => p.alive);
    if (!living.length) { this.finish(false); return; }
    this.updatePickups();
    if (s.perkOffer) {
      this.motion.step(dt, living, true, false);
      this.updateReview(dt);
      if (s.t >= 360) this.finish(false);
      return;
    }
    const targets = living.map(p => {
      const decoy = this.decoys.get(p.id);
      if (decoy && decoy.until > s.t) return { ...p, x: decoy.x, y: decoy.y, hp: 1, buffs: [], stats: { ...p.stats, damage: p.stats.damage * 3 + 1000 } };
      return p;
    });
    const decision = this.ai.step(dt, s.boss, targets, !this.motion.blocked);
    if (decision.started) { this.motion.castStarted(decision.started); this.telegraph(decision.started, decision.target!); }
    if (decision.fired) { this.motion.castFired(decision.fired, living); this.attack(decision.fired, decision.target!); }
    this.updatePressure(dt, targets);
    this.moveBoss(dt);
    s.boss.regions = bossRegions(s.boss);
    this.pending = this.pending.filter(shot => {
      shot.t -= dt;
      if (shot.t > 0) return true;
      this.bullet('boss', shot.kind, shot.x + Math.cos(shot.angle) * 24, shot.y + Math.sin(shot.angle) * 24,
        Math.cos(shot.angle) * shot.speed, Math.sin(shot.angle) * shot.speed, 3, shot.damage, 8);
      return false;
    });
    this.updateBullets(dt);
    if (s.boss.hp <= 0) { this.finish(true); return; }
    if (this.reviewQueued && s.boss.hp > 0) { this.beginReview(); return; }
    this.updateHazards(dt);
    this.updateMinions(dt);
    if (s.boss.hp <= 0) this.finish(true);
    else if (!s.players.some(p => p.alive)) this.finish(false);
    else if (s.t >= 360) this.finish(false);
  }

  private updatePlayer(p: PlayerState, dt: number, input?: InputFrame) {
    const r = this.players.get(p.id)!;
    p.skillCd = Math.max(0, p.skillCd - dt); p.dashCd = Math.max(0, p.dashCd - dt); p.invuln = Math.max(0, p.invuln - dt);
    // Preserve sub-tick cadence while firing, without banking idle/review time as free shots.
    r.shot = Math.max(-dt, r.shot - dt); r.dash -= dt; r.buff -= dt;
    if (r.buff <= 0) p.buffs = p.buffs.filter(b => b === 'firewall');
    if (!p.alive) { p.downedFor += dt; p.vx = p.vy = 0; return; }
    r.history.push({ t: this.state.t, x: p.x, y: p.y });
    while (r.history.length && r.history[0].t < this.state.t - 2.1) r.history.shift();
    p.energy = Math.min(p.kit.maxEnergy, p.energy + dt * 10);
    if (this.state.t - r.lastDamage >= (hasPerk(p, 'lint-fix') ? 2 : 3) && p.armor < p.kit.maxArmor) {
      r.armorTick += dt;
      if (r.armorTick >= (hasPerk(p, 'lint-fix') ? 1 : 1.5)) { p.armor = Math.min(p.kit.maxArmor, p.armor + 1); r.armorTick = 0; }
    }
    let [mx, my] = input?.move ?? [0, 0];
    const magnitude = Math.hypot(mx, my);
    const aim = input?.aim ?? this.autoAim(p);
    p.facing = aim;
    if (input?.dash && p.dashCd <= 0) {
      r.dashDir = magnitude > 0.1 ? unit(mx, my) : aim;
      r.dash = 0.19; p.invuln = 0.24; p.dashCd = 1.7 * (hasPerk(p, 'no-verify') ? 0.6 : 1);
    }
    const speed = p.kit.speed * (p.buffs.includes('overclock') ? 1.3 : 1) * (hasPerk(p, 'tail-call') ? 1.12 : 1);
    p.vx = r.dash > 0 ? r.dashDir[0] * 310 : mx * speed;
    p.vy = r.dash > 0 ? r.dashDir[1] * 310 : my * speed;
    const nextX = clamp(p.x + p.vx * dt, 23, ARENA_W - 23), nextY = clamp(p.y + p.vy * dt, 23, ARENA_H - 23);
    const blocked = (x: number, y: number) => this.state.obstacles.some(o => Math.abs(x - o.x) < o.w / 2 + 6 && Math.abs(y - o.y) < o.h / 2 + 6);
    if (!blocked(nextX, p.y)) p.x = nextX;
    if (!blocked(p.x, nextY)) p.y = nextY;
    if (input?.skill && p.skillCd <= 0) this.skill(p);
    if (input?.fire && r.shot <= 0 && !this.state.perkOffer) this.fire(p);
  }

  private autoAim(p: PlayerState): [number, number] {
    const regions = activeBossRegions(this.state.boss);
    const targets = [...regions, ...this.state.minions].sort((a, b) => distance(p, a) - distance(p, b));
    const target = targets[0] ?? this.state.boss;
    return unit(target.x - p.x, target.y - p.y);
  }

  private fire(p: PlayerState) {
    const w = WEAPONS[p.kit.weapon];
    const cost = w.cost * (hasPerk(p, 'cache-hit') ? 0.7 : 1);
    if (p.energy < cost) return;
    p.energy -= cost;
    this.players.get(p.id)!.shot += w.interval / (p.buffs.includes('overclock') ? 1.55 : 1);
    const angle = Math.atan2(p.facing[1], p.facing[0]);
    for (let i = 0; i < w.count; i++) {
      const a = angle + (w.count === 1 ? 0 : (i / (w.count - 1) - 0.5) * w.spread);
      this.bullet(p.id, p.kit.weapon, p.x + Math.cos(a) * 9, p.y + Math.sin(a) * 9, Math.cos(a) * w.speed, Math.sin(a) * w.speed, w.r,
        w.damage * p.kit.damageMul * (this.state.players.length === 1 ? SOLO_DAMAGE_MUL : 1) * (hasPerk(p, 'force') ? 1.25 : 1), w.life);
    }
  }

  private skill(p: PlayerState) {
    const r = this.players.get(p.id)!;
    const kind = p.kit.skill;
    p.skillCd = (kind === 'hotfix' ? 22 : 13) * (hasPerk(p, 'hotfix-plus') ? 0.7 : 1);
    this.emit({ type: 'skill', player: p.id, skill: kind });
    if (kind === 'hotfix') {
      for (const ally of this.state.players.filter(a => a.alive && distance(a, p) < 76)) ally.hp = Math.min(ally.kit.maxHp, ally.hp + 2);
    } else if (kind === 'firewall') {
      this.hazard('firewall', p.x, p.y, 49, 0, 4, 0, 0, p.id);
    } else if (kind === 'rollback') {
      const then = r.history[0];
      if (then) { p.x = then.x; p.y = then.y; }
      p.invuln = 0.8;
      this.state.bullets = this.state.bullets.filter(b => {
        if (b.owner === 'boss' && distance(b, p) < 60) { this.shots.delete(b.id); return false; }
        return true;
      });
    } else {
      p.buffs = [...new Set([...p.buffs, kind])]; r.buff = kind === 'fork' ? 5 : 4;
      if (kind === 'fork') this.decoys.set(p.id, { x: p.x, y: p.y, until: this.state.t + 5 });
    }
  }

  private revive(dt: number) {
    for (const p of this.state.players.filter(p => !p.alive)) {
      const helper = this.state.players.filter(a => a.alive && distance(a, p) <= (hasPerk(a, 'pair-programming') ? 40 : 24))
        .sort((a, b) => Number(hasPerk(b, 'pair-programming')) - Number(hasPerk(a, 'pair-programming')))[0];
      if (helper) this.reviveBy.set(p.id, helper.id); else this.reviveBy.delete(p.id);
      p.reviveProgress = helper ? Math.min(1, p.reviveProgress + dt / (hasPerk(helper, 'pair-programming') ? 1 : 2)) : Math.max(0, p.reviveProgress - dt / 2);
      if (helper && p.reviveProgress >= 0.99999) {
        p.alive = true; p.hp = Math.ceil(p.kit.maxHp / 2); p.armor = 0; p.invuln = 2; p.downedFor = 0; p.reviveProgress = 0;
        helper.stats.revives++; this.emit({ type: 'revived', player: p.id, by: helper.id });
        this.reviveBy.delete(p.id);
      }
    }
  }

  private telegraph(a: BossAttack, target: [number, number]) {
    this.emit({ type: 'telegraph', attackId: a.id, name: a.name, targetPlayer: this.state.boss.targetPlayer });
    const dive = a.kind === 'charge' && ['hydra', 'abyssal'].includes(this.state.boss.kit.archetype);
    if (a.kind === 'slam' || a.kind === 'cascade' || dive) {
      this.hazard(dive ? 'slam' : a.kind as 'slam' | 'cascade', target[0], target[1], a.params.radius ?? 30, 0, a.telegraph + 0.45, a.telegraph, a.damage, a.id, this.state.boss.targetPlayer ?? undefined);
      if (a.kind === 'cascade') {
        for (const p of this.state.players.filter(p => p.alive && distance(p, { x: target[0], y: target[1] }) > 35).slice(0, 3))
          this.hazard('cascade', p.x, p.y, 23, 0, a.telegraph + 0.75, a.telegraph + 0.3, a.damage, a.id, p.id);
      }
    }
    if (a.kind === 'laser' || a.kind === 'charge' && !dive) {
      const b = this.state.boss;
      const origin = a.kind === 'laser' ? bossMouth(b) : b;
      const id = this.hazard('laser', origin.x, origin.y, a.kind === 'charge' ? 18 : 7, Math.atan2(target[1] - origin.y, target[0] - origin.x), a.telegraph + (a.kind === 'charge' ? 0.1 : 0.75), a.telegraph, a.kind === 'charge' ? 0 : a.damage, a.id, this.state.boss.targetPlayer ?? undefined);
      if (a.kind === 'laser') { this.hazardData.get(id)!.mouth = true; this.hazardData.get(id)!.head = b.pose.head; }
    }
  }

  private attack(a: BossAttack, target: [number, number]) {
    const b = this.state.boss;
    const part = b.kit.archetype === 'mecha' && (a.kind === 'fan' || a.kind === 'charge')
      ? bossAnchors(b.kit).limbs.find(l => l.tag === (a.kind === 'charge' ? 'arm' : 'jet'))
      : b.kit.archetype === 'hydra' && a.kind === 'fan' ? bossAnchors(b.kit).limbs.find(l => l.tag === 'wing') : undefined;
    const origin = part ? { x: b.x + part.dx, y: b.y + part.dy } : b;
    const angle = Math.atan2(target[1] - origin.y, target[0] - origin.x);
    const speed = (a.params.speed ?? 50) * (b.phase === 3 ? 1.1 : 1);
    const count = a.params.count ?? 12;
    if (['ring', 'spiral', 'fan'].includes(a.kind)) {
      for (let i = 0; i < count; i++) {
        const theta = a.kind === 'fan' ? angle + (i / Math.max(1, count - 1) - 0.5) * (a.params.spread ?? 1.2) : angle + i * Math.PI * 2 / count;
        if (a.kind === 'spiral') {
          this.pending.push({ t: i * 0.085, angle: angle + i * 0.48, speed, damage: a.damage, x: b.x, y: b.y, kind: a.kind });
        } else {
          this.bullet('boss', b.kit.archetype === 'mecha' && a.kind === 'ring' ? 'missile' : a.kind, origin.x + Math.cos(theta) * 24, origin.y + Math.sin(theta) * 24, Math.cos(theta) * speed, Math.sin(theta) * speed, 3, a.damage, 8, b.kit.archetype === 'hydra' && a.kind === 'fan' ? 6 : 0);
        }
      }
    } else if (a.kind === 'charge') {
      if (b.kit.archetype === 'mecha') this.bullet('boss', 'rocket-fist', origin.x, origin.y, Math.cos(angle) * 130, Math.sin(angle) * 130, 6, a.damage, 2.6);
      else if (b.kit.archetype === 'hydra' || b.kit.archetype === 'abyssal') {
        b.x = target[0]; b.y = target[1]; this.motion.constrain(b);
      } else this.charge = { vx: Math.cos(angle) * 190, vy: Math.sin(angle) * 190, t: Math.min(0.8, Math.hypot(target[0] - b.x, target[1] - b.y) / 190), damage: a.damage };
    } else if (a.kind === 'summon') {
      if (b.kit.archetype === 'mecha') {
        for (let i = 0; i < Math.min(4, count); i++) this.pending.push({ t: i * 0.18, x: b.x, y: b.y,
          angle: angle + (i - 1) * 0.22, speed, damage: a.damage, kind: 'missile' });
        return;
      }
      for (let i = 0; i < Math.min(4, count); i++) {
        const theta = i * Math.PI * 2 / count;
        if (this.state.minions.length < 12) this.state.minions.push({ id: this.id++, x: clamp(b.x + Math.cos(theta) * 55, 24, 456), y: clamp(b.y + Math.sin(theta) * 55, 24, 264), hp: 12, kind: b.kit.code?.todos[i % (b.kit.code.todos.length || 1)] ?? 'bug' });
      }
    }
  }

  private moveBoss(dt: number) {
    const b = this.state.boss;
    this.motion.step(dt, this.state.players.filter(p => p.alive), false, !!this.charge);
    if (this.motion.takeFlightNotice()) this.emit({ type: 'telegraph', attackId: 'hydra-takeoff', name: 'Wings rising: heads + wings exposed', targetPlayer: null });
    const emerge = this.motion.takeEmergePoint();
    if (emerge) this.hazard('slam', emerge.x, emerge.y, 22, 0, 0.85, 0.85, 0, 'burrow-travel', emerge.targetPlayer);
    if (this.charge) {
      const c = this.charge;
      b.x = clamp(b.x + c.vx * dt, 70, ARENA_W - 70); b.y = clamp(b.y + c.vy * dt, 65, ARENA_H - 65);
      this.motion.constrain(b);
      for (const p of this.state.players) if (distance(p, b) < 33) this.hurtPlayer(p, c.damage);
      c.t -= dt; if (c.t <= 0) this.charge = null;
    }
  }

  /** A common threat floor independent of repo shape, overlapping the anatomical cast. */
  private updatePressure(dt: number, targets: PlayerState[]) {
    const budget = squadBudget(this.state.players.length);
    this.pressure = this.pressure.filter(stream => {
      stream.t -= dt;
      if (stream.t > 0) return true;
      for (const offset of [-0.13, 0, 0.13]) {
        const a = stream.angle + offset;
        this.bullet('boss', 'fan', stream.x + Math.cos(a) * 24, stream.y + Math.sin(a) * 24,
          Math.cos(a) * 60, Math.sin(a) * 60, 3, budget.hitDamage, 8);
      }
      return false;
    });
    this.pressureCd -= dt;
    if (this.pressureCd > 0 || !budget.pressureLanes || !targets.length) return;
    this.pressureCd += budget.pressurePeriod * (this.state.boss.enraged ? 0.9 : 1);
    const b = this.state.boss;
    const lanes = Math.min(targets.length, budget.pressureLanes);
    for (let lane = 0; lane < lanes; lane++) {
      const target = targets[(this.pressureRound + Math.floor(lane * targets.length / lanes)) % targets.length];
      const angle = Math.atan2(target.y - b.y, target.x - b.x);
      const id = `pressure-${this.pressureRound}-${lane}`;
      const hazardId = this.hazard('laser', b.x, b.y, 3, angle, 1, 0.95, 0, id, target.id);
      this.emit({ type: 'telegraph', attackId: id, name: `WARN: parallel worker ${lane + 1}`, targetPlayer: target.id });
      this.pressure.push({ t: 0.95, x: b.x, y: b.y, angle, targetPlayer: target.id, hazardId });
    }
    this.pressureRound++;
  }

  private bullet(owner: string, kind: string, x: number, y: number, vx: number, vy: number, r: number, damage: number, life: number, push = 0) {
    const bullet = { id: this.id++, owner, kind, x, y, vx, vy, r };
    this.state.bullets.push(bullet); this.shots.set(bullet.id, { damage, life, push });
  }

  private updateBullets(dt: number) {
    const next: Bullet[] = [];
    for (const b of this.state.bullets) {
      if (this.reviewQueued && b.owner === 'boss') { this.shots.delete(b.id); continue; }
      const meta = this.shots.get(b.id)!;
      meta.life -= dt;
      if (b.kind === 'staff' && b.owner !== 'boss') {
        const target = activeBossRegions(this.state.boss).sort((a, c) => distance(b, a) - distance(b, c))[0];
        if (target) { const [ux, uy] = unit(target.x - b.x, target.y - b.y);
          b.vx += (ux * 160 - b.vx) * dt * 4; b.vy += (uy * 160 - b.vy) * dt * 4; }
      }
      if (b.owner === 'boss' && b.kind === 'missile') {
        const target = this.state.players.filter(p => p.alive).sort((a, c) => distance(b, a) - distance(b, c))[0];
        if (target) { const angle = Math.atan2(b.vy, b.vx), desired = Math.atan2(target.y - b.y, target.x - b.x);
          const turn = clamp(Math.atan2(Math.sin(desired - angle), Math.cos(desired - angle)), -dt * 0.23, dt * 0.23);
          const speed = Math.hypot(b.vx, b.vy); b.vx = Math.cos(angle + turn) * speed; b.vy = Math.sin(angle + turn) * speed; }
      }
      const oldX = b.x, oldY = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      let hit = false;
      const cover = this.state.obstacles.map(o => ({ o, t: segmentRect(oldX, oldY, b.x, b.y, o, b.r) }))
        .filter((v): v is { o: MatchState['obstacles'][number]; t: number } => v.t !== null).sort((a, c) => a.t - c.t)[0];
      if (cover) {
        const amount = Math.min(cover.o.hp, meta.damage); cover.o.hp -= amount;
        this.hit({ type: 'hit', target: `obstacle:${cover.o.id}`, amount, x: cover.o.x, y: cover.o.y }, b.owner, unit(b.vx, b.vy));
        if (cover.o.hp <= 0) {
          this.emit({ type: 'obstacleBroken', id: cover.o.id, label: cover.o.label, x: cover.o.x, y: cover.o.y });
          this.drop('energy', cover.o.x, cover.o.y);
          this.maybeArmor(cover.o.x + 6, cover.o.y, 0.25);
          this.state.obstacles = this.state.obstacles.filter(o => o.id !== cover.o.id);
        }
        hit = true;
      } else if (b.owner === 'boss') {
        const blocked = this.state.hazards.some(h => h.kind === 'firewall' && distance(h, b) <= h.r);
        if (blocked) hit = true;
        else for (const p of this.state.players) if (p.alive && p.invuln <= 0 && distance(p, b) < 6 + b.r) {
          const direction = unit(b.vx, b.vy); this.hurtPlayer(p, meta.damage, direction);
          if (meta.push) { const x = clamp(p.x + direction[0] * meta.push, 23, ARENA_W - 23), y = clamp(p.y + direction[1] * meta.push, 23, ARENA_H - 23);
            if (!this.state.obstacles.some(o => Math.abs(x - o.x) < o.w / 2 + 6 && Math.abs(y - o.y) < o.h / 2 + 6)) { p.x = x; p.y = y; } }
          hit = true; break;
        }
      } else {
        const player = this.state.players.find(p => p.id === b.owner)!;
        const minion = this.state.minions.find(m => m.hp > 0 && distance(m, b) <= 7 + b.r);
        if (minion) {
          const damage = Math.min(minion.hp, meta.damage); minion.hp -= damage; player.stats.damage += damage;
          this.hit({ type: 'hit', target: String(minion.id), amount: damage, x: minion.x, y: minion.y }, player.id, unit(b.vx, b.vy)); hit = true;
        } else {
          const region = activeBossRegions(this.state.boss).find(region => distance(region, b) < region.r + b.r);
          if (region) { this.hurtBoss(player, region.id, meta.damage, region.x, region.y, unit(b.vx, b.vy)); hit = true;
            if (b.kind === 'cannon') for (const m of this.state.minions) if (m.hp > 0 && distance(m, b) < 28) {
              const amount = Math.min(m.hp, meta.damage * 0.5); m.hp -= amount; player.stats.damage += amount;
              this.hit({ type: 'hit', target: String(m.id), amount, x: m.x, y: m.y }, player.id, unit(m.x - b.x, m.y - b.y));
            }
          }
        }
      }
      if (!hit && meta.life > 0 && b.x > 12 && b.x < ARENA_W - 12 && b.y > 12 && b.y < ARENA_H - 12) next.push(b);
      else this.shots.delete(b.id);
    }
    this.state.bullets = next;
  }

  private hurtBoss(p: PlayerState, id: string, base: number, x: number, y: number, direction = unit(x - p.x, y - p.y)) {
    const b = this.state.boss;
    if (b.hp <= 0 || !activeBossRegions(b).some(region => region.id === id)) return;
    const limb = b.limbs.find(l => l.id === id);
    const kit = b.kit.limbs.find(l => l.id === id);
    const hits = this.recent.get(id) ?? new Map<string, number>();
    for (const [other, t] of hits) if (this.state.t - t > 0.5) hits.delete(other);
    hits.set(p.id, this.state.t); this.recent.set(id, hits);
    const combo = hits.size;
    p.stats.bestCombo = Math.max(p.stats.bestCombo, combo);
    const critical = !!(kit?.weakPoint || kit?.fragile);
    const damage = base * (1 + Math.min(4, combo - 1) * 0.14) * (id === 'heart' || critical ? 1.5 : 1);
    // Cycles still break faster and flash as crits, but don't add free core DPS to a repo's total budget.
    const dealt = Math.min(b.hp, damage * (limb ? 0.8 / (critical ? 1.5 : 1) : b.phase === 3 && b.limbs.some(l => !l.broken) ? 0.6 : 1));
    b.hp = Math.max(0, b.hp - dealt); p.stats.damage += dealt;
    if (limb && !limb.broken) {
      const limbHit = Math.min(limb.hp, damage);
      this.limbDamage.set(id, (this.limbDamage.get(id) ?? 0) + limbHit);
      limb.hp = Math.max(0, limb.hp - damage);
      if (limb.hp <= 0) {
        this.motion.pose('stagger', 0.25);
        limb.broken = true; p.stats.limbsBroken++;
        this.emit({ type: 'limbBroken', limb: id, by: p.id });
        this.drop('heart', x - 5, y); this.drop('energy', x + 5, y);
        // A broken source interrupts its in-flight cast as well as future selection.
        const attack = b.kit.attacks.find(a => a.id === b.casting?.attackId);
        if (attack && attack.source === kit?.component) {
          b.casting = null;
          this.state.hazards = this.state.hazards.filter(h => {
            if (this.hazardData.get(h.id)?.attackId === attack.id) { this.hazardData.delete(h.id); return false; }
            return true;
          });
        }
      }
    }
    this.hit({ type: 'hit', target: 'boss', ...(limb ? { limb: id } : {}), amount: dealt, x, y, combo }, p.id, direction, id === 'heart' || critical || combo >= 3);
    const ratio = b.hp / b.maxHp;
    if (ratio <= b.kit.enrageAt && b.phase === 1) { b.phase = 2; b.enraged = true; this.motion.pose('roar', 0.9); this.emit({ type: 'phase', phase: 2 }); this.reviewQueued = true; }
    if (ratio <= 0.15 && b.phase < 3) { b.phase = 3; b.enraged = true; this.motion.pose('enrage', 0.7); this.emit({ type: 'phase', phase: 3 }); }
    if (b.hp <= 0) p.stats.killingBlow = true;
  }

  private hurtPlayer(p: PlayerState, damage: number, direction = unit(p.x - this.state.boss.x, p.y - this.state.boss.y)) {
    if (!p.alive || p.invuln > 0 || damage <= 0) return;
    damage /= archetypeContactCost(this.state.boss.kit.archetype, this.state.players.length);
    if (hasPerk(p, 'safe-mode')) damage *= 0.8;
    if (p.buffs.includes('fork')) damage *= 0.5;
    const armor = Math.min(p.armor, damage); p.armor -= armor; p.hp = Math.max(0, p.hp - (damage - armor));
    p.invuln = 0.65;
    const r = this.players.get(p.id)!; r.lastDamage = this.state.t; r.armorTick = 0;
    this.hit({ type: 'hit', target: p.id, amount: damage, x: p.x, y: p.y }, 'boss', direction);
    if (p.hp <= 0) { p.alive = false; p.downedFor = 0; p.reviveProgress = 0; this.emit({ type: 'downed', player: p.id }); }
  }

  private hazard(kind: Hazard['kind'], x: number, y: number, r: number, angle: number, total: number, telegraph: number, damage: number, attackId: string, targetPlayer?: string) {
    const h: Hazard = { id: this.id++, kind, x, y, r, angle, total, t: 0, armed: telegraph <= 0 };
    this.state.hazards.push(h); this.hazardData.set(h.id, { damage, telegraph, victims: new Set(), attackId, targetPlayer });
    return h.id;
  }

  private updateHazards(dt: number) {
    for (const p of this.state.players) p.buffs = p.buffs.filter(b => b !== 'firewall');
    this.state.hazards = this.state.hazards.filter(h => {
      const meta = this.hazardData.get(h.id)!; h.t += dt; h.armed = h.t >= meta.telegraph;
      if (meta.mouth) { const origin = bossMouth(this.state.boss, meta.head); h.x = origin.x; h.y = origin.y; }
      if (h.kind === 'laser' && h.armed && meta.damage > 0) h.angle += dt * 0.35 * (h.id % 2 ? 1 : -1);
      if (h.kind === 'firewall') {
        for (const p of this.state.players) if (p.alive && distance(p, h) < h.r) p.buffs.push('firewall');
      } else if (h.armed) {
        for (const p of this.state.players) {
          let inside = distance(p, h) < h.r + 5;
          if (h.kind === 'laser') {
            const dx = p.x - h.x, dy = p.y - h.y;
            inside = dx * Math.cos(h.angle) + dy * Math.sin(h.angle) >= 0 && Math.abs(-dx * Math.sin(h.angle) + dy * Math.cos(h.angle)) < h.r + 5;
          }
          if (inside && p.alive && p.invuln <= 0 && !p.buffs.includes('firewall') && !meta.victims.has(p.id)) {
            this.hurtPlayer(p, meta.damage, h.kind === 'laser' ? [Math.cos(h.angle), Math.sin(h.angle)] : unit(p.x - h.x, p.y - h.y)); meta.victims.add(p.id);
          }
        }
      }
      if (h.t >= h.total) { this.hazardData.delete(h.id); return false; }
      return true;
    });
  }

  private updateMinions(dt: number) {
    this.cleanupMinions();
    this.minionShot -= dt;
    for (const m of this.state.minions.filter(m => m.hp > 0)) {
      const target = this.state.players.filter(p => p.alive).sort((a, b) => distance(a, m) - distance(b, m))[0];
      if (!target) continue;
      const [x, y] = unit(target.x - m.x, target.y - m.y);
      m.x += x * 22 * dt; m.y += y * 22 * dt;
      if (distance(m, target) < 12) this.hurtPlayer(target, 1);
      if (this.minionShot <= 0) this.bullet('boss', 'bug', m.x, m.y, x * 42, y * 42, 2.5, 1, 5);
    }
    if (this.minionShot <= 0) this.minionShot = 3;
    this.state.minions = this.state.minions.filter(m => m.hp > 0);
  }

  private cleanupMinions() {
    for (const m of this.state.minions.filter(m => m.hp <= 0)) {
      this.drop('energy', m.x, m.y);
      this.maybeArmor(m.x + 5, m.y, 0.2);
    }
    this.state.minions = this.state.minions.filter(m => m.hp > 0);
  }

  private drop(kind: Pickup['kind'], x: number, y: number) {
    const id = this.id++;
    this.state.pickups.push({ id, kind, x: clamp(x, 24, ARENA_W - 24), y: clamp(y, 24, ARENA_H - 24) });
    this.dropExpiry.set(id, this.state.t + 15);
  }

  private maybeArmor(x: number, y: number, chance: number) {
    // Summoner-style repos cannot turn an unlimited bug farm into free team health.
    if (this.lootRng() < chance && this.armorDropsLeft > 0) {
      this.armorDropsLeft--; this.drop('armor', x, y);
    }
  }

  private updatePickups() {
    this.state.pickups = this.state.pickups.filter(drop => {
      if (this.state.t >= (this.dropExpiry.get(drop.id) ?? 0)) { this.dropExpiry.delete(drop.id); return false; }
      const player = this.state.players.filter(p => p.alive && distance(p, drop) <= 14 &&
        (drop.kind === 'heart' ? p.hp < p.kit.maxHp : drop.kind === 'armor' ? p.armor < p.kit.maxArmor : p.energy < p.kit.maxEnergy))
        .sort((a, b) => distance(a, drop) - distance(b, drop))[0];
      if (!player) return true;
      if (drop.kind === 'heart') player.hp = Math.min(player.kit.maxHp, player.hp + 1);
      else if (drop.kind === 'armor') player.armor = Math.min(player.kit.maxArmor, player.armor + 2);
      else player.energy = Math.min(player.kit.maxEnergy, player.energy + 30);
      this.emit({ type: 'pickup', player: player.id, kind: drop.kind, x: drop.x, y: drop.y });
      this.dropExpiry.delete(drop.id); return false;
    });
  }

  private beginReview() {
    this.reviewQueued = false;
    this.motion.cancelTravel();
    this.cleanupMinions();
    this.state.perkOffer = createPerkOffer(this.reviewSeed, this.state.t);
    this.state.boss.casting = null;
    this.state.bullets = []; this.shots.clear();
    this.state.hazards = []; this.hazardData.clear();
    this.pending = []; this.pressure = []; this.charge = null;
    this.pressureCd = Math.max(1, this.pressureCd);
    this.reviewProgress.clear();
  }

  private updateReview(dt: number) {
    const offer = this.state.perkOffer!;
    const choose = (p: PlayerState, id: string) => {
      offer.picked[p.id] = id;
      if (!p.perks.includes(id)) p.perks.push(id);
      this.emit({ type: 'perk', player: p.id, perk: id });
    };
    for (const p of this.state.players) {
      if (offer.picked[p.id]) continue;
      const pad = p.alive ? offer.pads.find(pad => distance(p, pad) <= pad.r) : undefined;
      if (pad) {
        const previous = this.reviewProgress.get(p.id);
        const progress = previous?.pad === pad.id ? previous.t + dt : dt;
        this.reviewProgress.set(p.id, { pad: pad.id, t: progress });
        if (progress >= 1 - 1e-6) choose(p, pad.id);
      } else this.reviewProgress.delete(p.id);
      if (!offer.picked[p.id] && this.state.t >= offer.endsAt) {
        const nearest = [...offer.pads].sort((a, b) => distance(p, a) - distance(p, b))[0];
        choose(p, nearest.id);
      }
    }
    const extended = offer as typeof offer & { progress?: Record<string, { pad: string; t: number }> };
    extended.progress = Object.fromEntries([...this.reviewProgress].map(([id, value]) => [id, { pad: value.pad, t: Math.min(1, value.t) }]));
    if (this.state.t >= offer.endsAt) { this.state.perkOffer = null; this.reviewProgress.clear(); }
  }

  private emit(event: GameEvent) { this.state.events.push(event); }
  private hit(event: Extract<GameEvent, { type: 'hit' }>, source: string, direction: [number, number], crit = false) {
    const impact = clamp(event.amount / (source === 'boss' ? 6 : 25) + (crit ? 0.2 : 0), 0.1, 1);
    const feedback: HitFeedback = { source, direction, crit, impact, hitStop: impact >= 0.6 ? 50 : crit ? 30 : 0 };
    // Structural extension remains wire-compatible until the coordinator adds optional shared fields.
    this.emit({ ...event, ...feedback });
  }
  private finish(victory: boolean) {
    if (this.over) return;
    if (victory) {
      if (!this.ending) {
        this.ending = { t: 0, at: this.state.t };
        this.motion.cancelTravel(); this.motion.pose('death', 2);
        this.state.bullets = []; this.shots.clear(); this.state.hazards = []; this.hazardData.clear(); this.state.minions = [];
        this.state.boss.casting = null; this.state.perkOffer = null; this.pending = []; this.pressure = []; this.charge = null;
      }
      return;
    }
    this.ending = null;
    this.state.status = victory ? 'victory' : 'defeat';
    this.emit({ type: victory ? 'victory' : 'defeat' });
  }
  snapshot(): BattleState {
    const copy = structuredClone(this.state);
    // Parasites eat the visible shell, not the combat budget. Render health bars with
    // displayHp when present; hp remains authoritative so attacks/break timing stay fair.
    for (const limb of copy.boss.limbs) {
      const kit = copy.boss.kit.limbs.find(l => l.id === limb.id);
      if (kit?.parasites?.length) Object.assign(limb, { displayHp: limb.hp * (1 - Math.min(0.1, Math.max(0, copy.t - 2) / 600)) });
    }
    this.state.events = [];
    return copy;
  }
  autopsy(): BattleAutopsy {
    const s = this.state;
    return {
      mode: 'battle', victory: s.status === 'victory' || !!this.ending, duration: Math.max(0, (this.ending?.at ?? s.t) - 2),
      boss: { repo: s.boss.kit.repo, heart: s.boss.kit.heart,
        ...structuredClone((s.boss.kit as SocialBossKit).social ?? {}),
        limbs: s.boss.kit.limbs.map(l => ({ component: l.component, broken: s.boss.limbs.find(other => other.id === l.id)!.broken, damageTaken: this.limbDamage.get(l.id) ?? 0,
          ...(l.fragile === undefined ? {} : { fragile: l.fragile }), ...(l.maintainers === undefined ? {} : { maintainers: l.maintainers }),
          ...(l.issues ? { issues: structuredClone(l.issues) } : {}), ...(l.parasites ? { parasites: structuredClone(l.parasites) } : {}),
        })) },
      players: s.players.map(p => ({ id: p.id, name: p.name, repo: p.kit.repo, stats: { ...p.stats } })),
      mvp: [...s.players].sort((a, b) => b.stats.damage - a.stats.damage)[0]?.id ?? null,
    };
  }
}

type MatchPlayer = { id: string; name: string; kit: PlayerKit };
export function createMatch(players: MatchPlayer[], boss: BossKit, options?: { mode?: 'battle' }): BattleMatch;
export function createMatch(players: MatchPlayer[], boss: BossKit | null, options: { mode: 'edu' | 'pvp' }): ClassroomMatch;
export function createMatch(players: MatchPlayer[], boss: BossKit | null, options?: { mode?: GameMode }): Match;
export function createMatch(players: MatchPlayer[], boss: BossKit | null, options: { mode?: GameMode } = {}): Match {
  if (options.mode === 'edu') return new ClassroomMatch(players);
  if (options.mode === 'pvp') return new ClassroomMatch(players, true);
  if (!boss) throw new Error('Battle mode needs a boss');
  return new ArenaMatch(players, boss);
}
