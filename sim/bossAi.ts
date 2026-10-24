import type { BossAttack, BossState, PlayerState } from '../shared/types.ts';
import { distance, random } from './math.ts';

export interface AiDecision { started?: BossAttack; fired?: BossAttack; target?: [number, number] }

/** Stateful, deterministic utility selector. Only the match resolves damage. */
export class BossAi {
  private cooldowns = new Map<string, number>();
  private think = 0;
  private recovery = 2;
  private rng: () => number;
  constructor(seed: number, private playerCount = 4) { this.rng = random(seed); }

  step(dt: number, boss: BossState, players: PlayerState[]): AiDecision {
    this.recovery -= dt;
    this.think -= dt;
    for (const [id, t] of this.cooldowns) this.cooldowns.set(id, t - dt);
    if (boss.casting) {
      boss.casting.t += dt;
      if (boss.casting.t >= boss.casting.total) {
        const cast = boss.casting;
        const attack = boss.kit.attacks.find(a => a.id === cast.attackId)!;
        boss.casting = null;
        this.cooldowns.set(attack.id, attack.cooldown * (boss.enraged ? 0.76 : 1));
        this.recovery = boss.phase === 3 ? 0.85 : boss.enraged ? 1.2 : 1.7;
        return { fired: attack, target: cast.target ?? undefined };
      }
      return {};
    }
    if (this.think > 0 || this.recovery > 0 || !players.length) return {};
    this.think = 0.2;
    const target = [...players].sort((a, b) => this.threat(b, players) - this.threat(a, players))[0];
    boss.targetPlayer = target.id;
    if (boss.phase === 3 || boss.limbs.every(l => l.broken)) {
      for (const kind of ['ring', 'spiral', 'laser', 'slam'] as const) {
        if (boss.kit.attacks.some(a => a.id === `heart-${kind}`)) continue;
        boss.kit.attacks.push({ id: `heart-${kind}`, source: 'heart', kind, name: `FATAL: Heartbeat ${kind.toUpperCase()}`,
          damage: this.playerCount === 1 ? 2 : 5, cooldown: 7, telegraph: 0.95,
          params: { count: kind === 'spiral' ? 32 : 19, speed: 59, radius: 36 } });
      }
    }
    const choices = boss.kit.attacks.filter(a => {
      const limb = boss.kit.limbs.find(l => l.component === a.source);
      return (!limb || !boss.limbs.find(l => l.id === limb.id)?.broken) && (this.cooldowns.get(a.id) ?? 0) <= 0;
    });
    if (!choices.length) return {};
    const clustered = players.filter(p => distance(p, target) < 55).length;
    const scored = choices.map(a => ({ a, score: this.rng() * 2 +
      ((a.kind === 'slam' || a.kind === 'cascade') ? clustered * 0.45 : 0) +
      (a.kind === 'charge' ? Math.min(2, distance(boss, target) / 120) : 0) +
      (a.kind === 'fan' && target.invuln <= 0 ? 0.5 : 0) + (boss.phase === 3 && a.kind === 'spiral' ? 1 : 0) }));
    scored.sort((a, b) => b.score - a.score);
    const attack = scored[0].a;
    boss.casting = { attackId: attack.id, t: 0, total: Math.max(0.6, attack.telegraph), target: [target.x, target.y] };
    return { started: attack, target: [target.x, target.y] };
  }

  private threat(p: PlayerState, players: PlayerState[]) {
    const maxDamage = Math.max(1, ...players.map(other => other.stats.damage));
    return p.stats.damage / maxDamage + (1 - p.hp / p.kit.maxHp) * 0.9 + (p.invuln <= 0 ? 0.25 : 0) + (p.buffs.includes('fork') ? -2 : 0);
  }
}
