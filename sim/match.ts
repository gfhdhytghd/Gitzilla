import { ARENA_H, ARENA_W } from '../shared/types.ts';
import type { Autopsy, BossAttack, BossKit, Bullet, GameEvent, Hazard, InputFrame, MatchState, PlayerKit, PlayerState, WeaponKind } from '../shared/types.ts';
import { BossAi } from './bossAi.ts';
import { clamp, distance, unit } from './math.ts';
import { activeBossRegions, bossRegions } from './regions.ts';

export interface Match {
  step(dt: number, inputs: Map<string, InputFrame>): void;
  snapshot(): MatchState;
  autopsy(): Autopsy;
  readonly over: boolean;
}

export const WEAPONS: Record<WeaponKind, { interval: number; damage: number; speed: number; cost: number; life: number; count: number; spread: number; r: number }> = {
  blaster: { interval: 0.3, damage: 8, speed: 230, cost: 2, life: 2, count: 1, spread: 0, r: 3 },
  smg: { interval: 0.11, damage: 3, speed: 250, cost: 0.8, life: 1.8, count: 1, spread: 0.09, r: 2 },
  shotgun: { interval: 0.65, damage: 4, speed: 230, cost: 4, life: 0.8, count: 5, spread: 0.42, r: 2.5 },
  cannon: { interval: 0.85, damage: 23, speed: 175, cost: 5, life: 2.5, count: 1, spread: 0, r: 5 },
  staff: { interval: 0.5, damage: 13, speed: 160, cost: 3, life: 3, count: 1, spread: 0, r: 4 },
  laser: { interval: 0.14, damage: 3.8, speed: 540, cost: 1, life: 0.65, count: 1, spread: 0, r: 2 },
  blade: { interval: 0.38, damage: 11, speed: 285, cost: 1, life: 0.54, count: 1, spread: 0, r: 9 },
};
// A lone hero cannot earn multiplayer combos or be revived; keep solo demos playable.
export const SOLO_DAMAGE_MUL = 1.65;

interface PlayerRuntime {
  shot: number; lastDamage: number; armorTick: number; dash: number; dashDir: [number, number];
  buff: number; history: { t: number; x: number; y: number }[];
}
interface ShotRuntime { damage: number; life: number }
interface HazardRuntime { damage: number; telegraph: number; victims: Set<string>; attackId: string }

class ArenaMatch implements Match {
  private state: MatchState;
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

  constructor(players: { id: string; name: string; kit: PlayerKit }[], kit: BossKit) {
    this.ai = new BossAi(kit.seed, players.length);
    this.state = {
      t: 0, status: 'countdown', bullets: [], hazards: [], minions: [], events: [],
      players: players.map((p, i) => ({
        ...p, kit: structuredClone(p.kit), x: 64 + i % 2 * 24, y: 70 + Math.floor(i / 2) * 47,
        vx: 0, vy: 0, facing: [1, 0], hp: p.kit.maxHp, armor: p.kit.maxArmor, energy: p.kit.maxEnergy,
        alive: true, downedFor: 0, reviveProgress: 0, skillCd: 0, dashCd: 0, invuln: 0, buffs: [],
        stats: { damage: 0, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false },
      })),
      boss: { x: 335, y: 144, hp: kit.maxHp, maxHp: kit.maxHp, phase: 1, regions: [],
        limbs: kit.limbs.map(l => ({ id: l.id, hp: l.maxHp, maxHp: l.maxHp, broken: false })),
        casting: null, targetPlayer: null, enraged: false, kit: structuredClone(kit) },
    };
    this.state.boss.regions = bossRegions(this.state.boss);
    for (const p of this.state.players) this.players.set(p.id, { shot: 0, lastDamage: -10, armorTick: 0, dash: 0, dashDir: [1, 0], buff: 0, history: [] });
  }

  get over() { return this.state.status === 'victory' || this.state.status === 'defeat'; }

  step(dt: number, inputs: Map<string, InputFrame>) {
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
    if (s.status === 'countdown') {
      if (s.t < 2) return;
      s.status = 'fighting';
    }
    for (const p of s.players) this.updatePlayer(p, dt, inputs.get(p.id));
    this.revive(dt);
    const living = s.players.filter(p => p.alive);
    if (!living.length) { this.finish(false); return; }
    const targets = living.map(p => {
      const decoy = this.decoys.get(p.id);
      if (decoy && decoy.until > s.t) return { ...p, x: decoy.x, y: decoy.y, hp: 1, buffs: [], stats: { ...p.stats, damage: p.stats.damage * 3 + 1000 } };
      return p;
    });
    const decision = this.ai.step(dt, s.boss, targets);
    if (decision.started) this.telegraph(decision.started, decision.target!);
    if (decision.fired) this.attack(decision.fired, decision.target!);
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
    this.updateHazards(dt);
    this.updateMinions(dt);
    if (s.boss.hp <= 0) this.finish(true);
    else if (!s.players.some(p => p.alive)) this.finish(false);
    else if (s.t >= 360) this.finish(false);
  }

  private updatePlayer(p: PlayerState, dt: number, input?: InputFrame) {
    const r = this.players.get(p.id)!;
    p.skillCd = Math.max(0, p.skillCd - dt); p.dashCd = Math.max(0, p.dashCd - dt); p.invuln = Math.max(0, p.invuln - dt);
    r.shot -= dt; r.dash -= dt; r.buff -= dt;
    if (r.buff <= 0) p.buffs = p.buffs.filter(b => b === 'firewall');
    if (!p.alive) { p.downedFor += dt; p.vx = p.vy = 0; return; }
    r.history.push({ t: this.state.t, x: p.x, y: p.y });
    while (r.history.length && r.history[0].t < this.state.t - 2.1) r.history.shift();
    p.energy = Math.min(p.kit.maxEnergy, p.energy + dt * 10);
    if (this.state.t - r.lastDamage >= 3 && p.armor < p.kit.maxArmor) {
      r.armorTick += dt;
      if (r.armorTick >= 1.5) { p.armor = Math.min(p.kit.maxArmor, p.armor + 1); r.armorTick = 0; }
    }
    let [mx, my] = input?.move ?? [0, 0];
    const magnitude = Math.hypot(mx, my);
    if (magnitude > 1) { mx /= magnitude; my /= magnitude; }
    const aim = input?.aim ? unit(...input.aim) : this.autoAim(p);
    p.facing = aim;
    if (input?.dash && p.dashCd <= 0) {
      r.dashDir = magnitude > 0.1 ? unit(mx, my) : aim;
      r.dash = 0.19; p.invuln = 0.24; p.dashCd = 1.7;
    }
    const speed = p.kit.speed * (p.buffs.includes('overclock') ? 1.3 : 1);
    p.vx = r.dash > 0 ? r.dashDir[0] * 310 : mx * speed;
    p.vy = r.dash > 0 ? r.dashDir[1] * 310 : my * speed;
    p.x = clamp(p.x + p.vx * dt, 23, ARENA_W - 23); p.y = clamp(p.y + p.vy * dt, 23, ARENA_H - 23);
    if (input?.skill && p.skillCd <= 0) this.skill(p);
    if (input?.fire && r.shot <= 0) this.fire(p);
  }

  private autoAim(p: PlayerState): [number, number] {
    const regions = activeBossRegions(this.state.boss);
    const targets = [...regions, ...this.state.minions].sort((a, b) => distance(p, a) - distance(p, b));
    const target = targets[0] ?? this.state.boss;
    return unit(target.x - p.x, target.y - p.y);
  }

  private fire(p: PlayerState) {
    const w = WEAPONS[p.kit.weapon];
    if (p.energy < w.cost) return;
    p.energy -= w.cost;
    this.players.get(p.id)!.shot += w.interval / (p.buffs.includes('overclock') ? 1.55 : 1);
    const angle = Math.atan2(p.facing[1], p.facing[0]);
    for (let i = 0; i < w.count; i++) {
      const a = angle + (w.count === 1 ? 0 : (i / (w.count - 1) - 0.5) * w.spread);
      this.bullet(p.id, p.kit.weapon, p.x + Math.cos(a) * 9, p.y + Math.sin(a) * 9, Math.cos(a) * w.speed, Math.sin(a) * w.speed, w.r,
        w.damage * p.kit.damageMul * (this.state.players.length === 1 ? SOLO_DAMAGE_MUL : 1), w.life);
    }
  }

  private skill(p: PlayerState) {
    const r = this.players.get(p.id)!;
    const kind = p.kit.skill;
    p.skillCd = kind === 'hotfix' ? 22 : 13;
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
      const helper = this.state.players.find(a => a.alive && distance(a, p) <= 24);
      p.reviveProgress = helper ? Math.min(1, p.reviveProgress + dt / 2) : Math.max(0, p.reviveProgress - dt / 2);
      if (helper && p.reviveProgress >= 0.99999) {
        p.alive = true; p.hp = Math.ceil(p.kit.maxHp / 2); p.armor = 0; p.invuln = 2; p.downedFor = 0; p.reviveProgress = 0;
        helper.stats.revives++; this.emit({ type: 'revived', player: p.id, by: helper.id });
      }
    }
  }

  private telegraph(a: BossAttack, target: [number, number]) {
    this.emit({ type: 'telegraph', attackId: a.id, name: a.name, targetPlayer: this.state.boss.targetPlayer });
    if (a.kind === 'slam' || a.kind === 'cascade') {
      this.hazard(a.kind, target[0], target[1], a.params.radius ?? 30, 0, a.telegraph + 0.45, a.telegraph, a.damage, a.id);
      if (a.kind === 'cascade') {
        for (const p of this.state.players.filter(p => p.alive && distance(p, { x: target[0], y: target[1] }) > 35).slice(0, 3))
          this.hazard('cascade', p.x, p.y, 23, 0, a.telegraph + 0.75, a.telegraph + 0.3, a.damage, a.id);
      }
    }
    if (a.kind === 'laser' || a.kind === 'charge') {
      const b = this.state.boss;
      this.hazard('laser', b.x, b.y, a.kind === 'charge' ? 18 : 7, Math.atan2(target[1] - b.y, target[0] - b.x), a.telegraph + (a.kind === 'charge' ? 0.1 : 0.75), a.telegraph, a.kind === 'charge' ? 0 : a.damage, a.id);
    }
  }

  private attack(a: BossAttack, target: [number, number]) {
    const b = this.state.boss;
    const angle = Math.atan2(target[1] - b.y, target[0] - b.x);
    const speed = (a.params.speed ?? 50) * (b.phase === 3 ? 1.1 : 1);
    const count = a.params.count ?? 12;
    if (['ring', 'spiral', 'fan'].includes(a.kind)) {
      for (let i = 0; i < count; i++) {
        const theta = a.kind === 'fan' ? angle + (i / Math.max(1, count - 1) - 0.5) * (a.params.spread ?? 1.2) : angle + i * Math.PI * 2 / count;
        if (a.kind === 'spiral') {
          this.pending.push({ t: i * 0.085, angle: angle + i * 0.48, speed, damage: a.damage, x: b.x, y: b.y, kind: a.kind });
        } else {
          this.bullet('boss', a.kind, b.x + Math.cos(theta) * 24, b.y + Math.sin(theta) * 24, Math.cos(theta) * speed, Math.sin(theta) * speed, 3, a.damage, 8);
        }
      }
    } else if (a.kind === 'charge') {
      this.charge = { vx: Math.cos(angle) * 190, vy: Math.sin(angle) * 190, t: Math.min(0.8, Math.hypot(target[0] - b.x, target[1] - b.y) / 190), damage: a.damage };
    } else if (a.kind === 'summon') {
      for (let i = 0; i < Math.min(4, count); i++) {
        const theta = i * Math.PI * 2 / count;
        if (this.state.minions.length < 12) this.state.minions.push({ id: this.id++, x: clamp(b.x + Math.cos(theta) * 55, 24, 456), y: clamp(b.y + Math.sin(theta) * 55, 24, 264), hp: 12, kind: 'bug' });
      }
    }
  }

  private moveBoss(dt: number) {
    const b = this.state.boss;
    if (this.charge) {
      const c = this.charge;
      b.x = clamp(b.x + c.vx * dt, 70, ARENA_W - 70); b.y = clamp(b.y + c.vy * dt, 65, ARENA_H - 65);
      for (const p of this.state.players) if (distance(p, b) < 33) this.hurtPlayer(p, c.damage);
      c.t -= dt; if (c.t <= 0) this.charge = null;
    } else if (!b.casting) {
      // Slow orbit is readable on tilt controls, and returns the boss to a useful part of the arena.
      const tx = 300 + Math.cos(this.state.t * 0.13) * 42, ty = 144 + Math.sin(this.state.t * 0.19) * 38;
      const [x, y] = unit(tx - b.x, ty - b.y);
      if (Math.hypot(tx - b.x, ty - b.y) > 2) { b.x += x * b.kit.speed * dt; b.y += y * b.kit.speed * dt; }
    }
  }

  private bullet(owner: string, kind: string, x: number, y: number, vx: number, vy: number, r: number, damage: number, life: number) {
    const bullet = { id: this.id++, owner, kind, x, y, vx, vy, r };
    this.state.bullets.push(bullet); this.shots.set(bullet.id, { damage, life });
  }

  private updateBullets(dt: number) {
    const next: Bullet[] = [];
    for (const b of this.state.bullets) {
      const meta = this.shots.get(b.id)!;
      meta.life -= dt;
      if (b.kind === 'staff' && b.owner !== 'boss') {
        const target = activeBossRegions(this.state.boss).sort((a, c) => distance(b, a) - distance(b, c))[0];
        const [ux, uy] = unit(target.x - b.x, target.y - b.y);
        b.vx += (ux * 160 - b.vx) * dt * 4; b.vy += (uy * 160 - b.vy) * dt * 4;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      let hit = false;
      if (b.owner === 'boss') {
        const blocked = this.state.hazards.some(h => h.kind === 'firewall' && distance(h, b) <= h.r);
        if (blocked) hit = true;
        else for (const p of this.state.players) if (p.alive && p.invuln <= 0 && distance(p, b) < 6 + b.r) { this.hurtPlayer(p, meta.damage); hit = true; break; }
      } else {
        const player = this.state.players.find(p => p.id === b.owner)!;
        const minion = this.state.minions.find(m => m.hp > 0 && distance(m, b) <= 7 + b.r);
        if (minion) {
          const damage = Math.min(minion.hp, meta.damage); minion.hp -= damage; player.stats.damage += damage;
          this.emit({ type: 'hit', target: String(minion.id), amount: damage, x: minion.x, y: minion.y }); hit = true;
        } else {
          const region = activeBossRegions(this.state.boss).find(region => distance(region, b) < region.r + b.r);
          if (region) { this.hurtBoss(player, region.id, meta.damage, region.x, region.y); hit = true;
            if (b.kind === 'cannon') for (const m of this.state.minions) if (m.hp > 0 && distance(m, b) < 28) {
              const amount = Math.min(m.hp, meta.damage * 0.5); m.hp -= amount; player.stats.damage += amount;
              this.emit({ type: 'hit', target: String(m.id), amount, x: m.x, y: m.y });
            }
          }
        }
      }
      if (!hit && meta.life > 0 && b.x > 12 && b.x < ARENA_W - 12 && b.y > 12 && b.y < ARENA_H - 12) next.push(b);
      else this.shots.delete(b.id);
    }
    this.state.bullets = next;
  }

  private hurtBoss(p: PlayerState, id: string, base: number, x: number, y: number) {
    const b = this.state.boss;
    if (b.hp <= 0) return;
    const limb = b.limbs.find(l => l.id === id);
    const kit = b.kit.limbs.find(l => l.id === id);
    const hits = this.recent.get(id) ?? new Map<string, number>();
    for (const [other, t] of hits) if (this.state.t - t > 0.5) hits.delete(other);
    hits.set(p.id, this.state.t); this.recent.set(id, hits);
    const combo = hits.size;
    p.stats.bestCombo = Math.max(p.stats.bestCombo, combo);
    const damage = base * (1 + Math.min(4, combo - 1) * 0.14) * (id === 'heart' || kit?.weakPoint ? 1.5 : 1);
    const dealt = Math.min(b.hp, damage * (limb ? 0.8 : b.phase === 3 && b.limbs.some(l => !l.broken) ? 0.6 : 1));
    b.hp = Math.max(0, b.hp - dealt); p.stats.damage += dealt;
    if (limb && !limb.broken) {
      const limbHit = Math.min(limb.hp, damage);
      this.limbDamage.set(id, (this.limbDamage.get(id) ?? 0) + limbHit);
      limb.hp = Math.max(0, limb.hp - damage);
      if (limb.hp <= 0) {
        limb.broken = true; p.stats.limbsBroken++;
        this.emit({ type: 'limbBroken', limb: id, by: p.id });
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
    this.emit({ type: 'hit', target: 'boss', ...(limb ? { limb: id } : {}), amount: dealt, x, y, combo });
    const ratio = b.hp / b.maxHp;
    if (ratio <= b.kit.enrageAt && b.phase === 1) { b.phase = 2; b.enraged = true; this.emit({ type: 'phase', phase: 2 }); }
    if (ratio <= 0.15 && b.phase < 3) { b.phase = 3; b.enraged = true; this.emit({ type: 'phase', phase: 3 }); }
    if (b.hp <= 0) p.stats.killingBlow = true;
  }

  private hurtPlayer(p: PlayerState, damage: number) {
    if (!p.alive || p.invuln > 0 || damage <= 0) return;
    if (p.buffs.includes('fork')) damage *= 0.5;
    const armor = Math.min(p.armor, damage); p.armor -= armor; p.hp = Math.max(0, p.hp - (damage - armor));
    p.invuln = 0.65;
    const r = this.players.get(p.id)!; r.lastDamage = this.state.t; r.armorTick = 0;
    this.emit({ type: 'hit', target: p.id, amount: damage, x: p.x, y: p.y });
    if (p.hp <= 0) { p.alive = false; p.downedFor = 0; p.reviveProgress = 0; this.emit({ type: 'downed', player: p.id }); }
  }

  private hazard(kind: Hazard['kind'], x: number, y: number, r: number, angle: number, total: number, telegraph: number, damage: number, attackId: string) {
    const h: Hazard = { id: this.id++, kind, x, y, r, angle, total, t: 0, armed: telegraph <= 0 };
    this.state.hazards.push(h); this.hazardData.set(h.id, { damage, telegraph, victims: new Set(), attackId });
  }

  private updateHazards(dt: number) {
    for (const p of this.state.players) p.buffs = p.buffs.filter(b => b !== 'firewall');
    this.state.hazards = this.state.hazards.filter(h => {
      const meta = this.hazardData.get(h.id)!; h.t += dt; h.armed = h.t >= meta.telegraph;
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
            this.hurtPlayer(p, meta.damage); meta.victims.add(p.id);
          }
        }
      }
      if (h.t >= h.total) { this.hazardData.delete(h.id); return false; }
      return true;
    });
  }

  private updateMinions(dt: number) {
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

  private emit(event: GameEvent) { this.state.events.push(event); }
  private finish(victory: boolean) {
    if (this.over) return;
    this.state.status = victory ? 'victory' : 'defeat';
    this.emit({ type: victory ? 'victory' : 'defeat' });
  }
  snapshot(): MatchState {
    const copy = structuredClone(this.state);
    this.state.events = [];
    return copy;
  }
  autopsy(): Autopsy {
    const s = this.state;
    return {
      victory: s.status === 'victory', duration: Math.max(0, s.t - 2),
      boss: { repo: s.boss.kit.repo, heart: s.boss.kit.heart,
        limbs: s.boss.kit.limbs.map(l => ({ component: l.component, broken: s.boss.limbs.find(other => other.id === l.id)!.broken, damageTaken: this.limbDamage.get(l.id) ?? 0 })) },
      players: s.players.map(p => ({ id: p.id, name: p.name, repo: p.kit.repo, stats: { ...p.stats } })),
      mvp: [...s.players].sort((a, b) => b.stats.damage - a.stats.damage)[0]?.id ?? null,
    };
  }
}

export function createMatch(players: { id: string; name: string; kit: PlayerKit }[], boss: BossKit): Match {
  return new ArenaMatch(players, boss);
}
