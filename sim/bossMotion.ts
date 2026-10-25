import type { BossAttack, BossPose, BossState, PlayerState } from '../shared/types.ts';
import { ARENA_H, ARENA_W } from '../shared/types.ts';
import { bossAnchors } from '../shared/kaiju-anatomy.ts';
import { clamp, distance, unit } from './math.ts';
import { bossCastPeriod } from './balance.ts';

/** Authoritative animation/locomotion. Movement never creates an unbudgeted damage source. */
export class BossMotion {
  private clock = 0;
  private held = 0;
  private head = -1;
  private travel = 0;
  private burrowDelay = 0;
  private burrowAt = -20;
  private hopAt = -20;
  private flightCycle = -1;
  private flightNotice = false;
  private destination: { x: number; y: number; targetPlayer: string } | null = null;
  private emergePoint: { x: number; y: number; targetPlayer: string } | null = null;
  constructor(private boss: BossState, private playerCount: number) {}

  get blocked() { return this.boss.kit.archetype === 'abyssal' && this.boss.airborne; }
  /** Consume once so the match can draw a harmless, visible emergence warning. */
  takeEmergePoint() { const point = this.emergePoint; this.emergePoint = null; return point; }
  takeFlightNotice() { const notice = this.flightNotice; this.flightNotice = false; return notice; }
  cancelTravel() { this.destination = this.emergePoint = null; this.travel = this.burrowDelay = 0; this.boss.airborne = false; }
  removePlayer(id: string) { if (this.destination?.targetPlayer === id) this.cancelTravel(); }
  pose(name: BossPose, total: number, head?: number) {
    this.boss.pose = { name, t: 0, total, dir: [...this.boss.pose.dir], ...(head === undefined ? {} : { head }) };
    this.held = total;
  }
  castStarted(a: BossAttack) {
    if (this.boss.kit.archetype === 'hydra' && a.kind === 'laser') {
      const anchors = bossAnchors(this.boss.kit);
      const available = anchors.mouths.map((_, i) => i).filter(i => {
        const limb = anchors.limbs.find(l => l.slot === `head-${i}`);
        return !limb || !this.boss.limbs.find(l => l.id === limb.id)?.broken;
      });
      this.head = available.find(i => i > this.head) ?? available[0] ?? 0;
    }
    this.pose('windup', a.telegraph, this.boss.kit.archetype === 'hydra' ? Math.max(0, this.head) : undefined);
  }
  castFired(a: BossAttack, players: PlayerState[]) {
    const arch = this.boss.kit.archetype;
    this.pose(a.kind === 'charge' && arch === 'hydra' ? 'dive' : a.kind === 'charge' && arch === 'abyssal' ? 'emerge' : 'attack', 0.25, arch === 'hydra' ? Math.max(0, this.head) : undefined);
    if (a.kind === 'charge' && arch === 'hydra') { this.boss.airborne = false; this.travel = 0; }
    const b = this.boss;
    const period = bossCastPeriod(b, this.playerCount, a);
    if (arch === 'abyssal' && period - a.telegraph > 1.05 && this.clock - this.burrowAt >= 8 && players.length) {
      const target = players[this.boss.phase % players.length];
      this.destination = { x: target.x + 125, y: target.y + Math.sin(this.clock) * 45, targetPlayer: target.id };
      this.constrain(this.destination);
      this.emergePoint = { ...this.destination };
      this.burrowDelay = 0.25; this.travel = 0.55; this.burrowAt = this.clock;
    }
    if (arch === 'mecha' && period - a.telegraph > 0.8 && this.clock - this.hopAt >= 8 && players.length) {
      const target = players[this.boss.phase % players.length];
      this.destination = { x: target.x + 125, y: target.y + Math.sin(this.clock) * 55, targetPlayer: target.id };
      this.constrain(this.destination);
      const gap = distance(this.boss, this.destination);
      if (gap > 60) { const dir = unit(this.destination.x - b.x, this.destination.y - b.y); this.destination.x = b.x + dir[0] * 60; this.destination.y = b.y + dir[1] * 60; }
      this.burrowDelay = 0.25; this.travel = 0.45; this.hopAt = this.clock;
    }
  }
  step(dt: number, players: PlayerState[], paused: boolean, charging: boolean) {
    const b = this.boss;
    b.pose.t = Math.min(b.pose.total, b.pose.t + dt); this.held = Math.max(0, this.held - dt);
    if (b.pose.name === 'death') return;
    if (paused) {
      b.airborne = false; this.travel = 0; this.destination = null;
      if (this.held <= 0 && (b.pose.name !== 'idle' || b.pose.t >= b.pose.total)) { this.pose('idle', 1.2); this.held = 0; }
      return;
    }
    this.clock += dt;
    const target = players.find(p => p.id === b.targetPlayer) ?? players[0];
    if (target && !b.casting) b.pose.dir = unit(target.x - b.x, target.y - b.y);
    this.burrowDelay = Math.max(0, this.burrowDelay - dt);
    if (this.destination && this.burrowDelay <= 0 && this.travel > 0) {
      const arch = b.kit.archetype; b.airborne = true;
      if (arch === 'abyssal') {
        if (b.pose.name !== 'burrow') this.pose('burrow', this.travel);
      } else {
        if (b.pose.name !== 'fly') this.pose('fly', this.travel);
        const f = Math.min(1, dt / Math.max(dt, this.travel)); b.x += (this.destination.x - b.x) * f; b.y += (this.destination.y - b.y) * f;
      }
      this.travel -= dt;
      if (this.travel <= 0) {
        b.x = this.destination.x; b.y = this.destination.y; this.destination = null; b.airborne = false;
        this.pose(arch === 'abyssal' ? 'emerge' : 'recover', 0.35);
      }
      this.constrain(b); return;
    }
    if (b.kit.archetype === 'hydra') {
      const canFly = bossAnchors(b.kit).limbs.some(a => (a.tag === 'head' || a.tag === 'wing') && !b.limbs.find(l => l.id === a.id)?.broken);
      const cycle = Math.floor(this.clock / 14);
      if (canFly && this.clock % 14 >= 4.15 && this.clock % 14 < 5 && cycle !== this.flightCycle) {
        this.flightCycle = cycle; this.flightNotice = true;
        if (!b.casting && this.held <= 0) this.pose('windup', 0.85);
      }
      b.airborne = canFly && this.clock % 14 > 5 && this.clock % 14 < 8.5 && b.pose.name !== 'dive';
    } else b.airborne = false;
    if (charging) return;
    let goal = { x: b.x, y: b.y }, speed = b.kit.speed;
    if (b.kit.archetype === 'kaiju' && players.length) {
      const center = { x: players.reduce((s, p) => s + p.x, 0) / players.length, y: players.reduce((s, p) => s + p.y, 0) / players.length };
      if (distance(center, b) > 128) goal = center;
    } else if (b.kit.archetype === 'hydra') {
      goal = { x: 300 + Math.cos(this.clock * 0.17) * 38, y: (b.airborne ? 125 : 150) + Math.sin(this.clock * 0.27) * 25 }; speed *= 1.25;
    } else if (b.kit.archetype === 'abyssal') {
      goal = { x: 300 + Math.cos(this.clock * 0.16) * 35, y: 146 + Math.sin(this.clock * 0.28) * 38 };
    }
    const moving = distance(b, goal) > 2 && !b.casting && (this.held <= 0 || ['idle', 'walk', 'fly'].includes(b.pose.name));
    if (moving) { const dir = unit(goal.x - b.x, goal.y - b.y); b.x += dir[0] * speed * dt; b.y += dir[1] * speed * dt; }
    this.constrain(b);
    if (b.casting) {
      if (b.pose.name !== 'windup') this.pose('windup', b.casting.total, b.kit.archetype === 'hydra' ? Math.max(0, this.head) : undefined);
      b.pose.t = b.casting.t;
    } else if (this.held <= 0) {
      if (b.pose.name === 'attack' || b.pose.name === 'dive') this.pose('recover', 0.3);
      else {
        const name = b.airborne ? 'fly' : moving ? 'walk' : 'idle';
        if (b.pose.name !== name || b.pose.t >= b.pose.total) this.pose(name, name === 'walk' ? 0.8 : 1.2);
        this.held = 0;
      }
    }
  }
  constrain(point: { x: number; y: number }) {
    const a = bossAnchors(this.boss.kit);
    const left = Math.min(a.chest.dx - 19, ...a.limbs.map(l => l.dx - 13), ...a.mouths.map(m => m.dx));
    const right = Math.max(a.chest.dx + 19, ...a.limbs.map(l => l.dx + 13));
    const top = Math.min(a.chest.dy - 19, ...a.limbs.map(l => l.dy - 13), ...a.mouths.map(m => m.dy));
    const bottom = Math.max(a.chest.dy + 19, ...a.limbs.map(l => l.dy + 13));
    point.x = clamp(point.x, Math.max(70, 14 - left), Math.min(370, ARENA_W - 14 - right));
    point.y = clamp(point.y, Math.max(70, 14 - top), Math.min(222, ARENA_H - 14 - bottom));
  }
}
