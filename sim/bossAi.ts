import type { BossAttack, BossState, PlayerState } from '../shared/types.ts';
import { distance, random } from './math.ts';
import { ATTACK_COST, BATTLE_DIFFICULTY, bossCastPeriod, squadBudget } from './balance.ts';
import { attackFlavorPicker } from './flavor.ts';
import type { BossCode } from './code.ts';

export interface AiDecision { started?: BossAttack; fired?: BossAttack; target?: [number, number] }

/** Stateful, deterministic utility selector. Only the match resolves damage. */
export class BossAi {
  private cooldowns = new Map<string, number>();
  private think = 0;
  private recovery = 2;
  private rng: () => number;
  private credit = new Map<string, number>();
  private heartAwake = false;
  constructor(private seed: number, private playerCount = 4) { this.rng = random(seed); this.recovery /= BATTLE_DIFFICULTY.attackFrequency; }

  step(dt: number, boss: BossState, players: PlayerState[], allowStart = true): AiDecision {
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
        // Price the entire cast cycle, including its fixed wind-up, in threat units.
        // Otherwise cheap telegraphed styles silently lose budget to their wind-up.
        const period = bossCastPeriod(boss, this.playerCount, attack);
        this.recovery = Math.max(0.2, period - attack.telegraph);
        return { fired: attack, target: cast.target ?? undefined };
      }
      return {};
    }
    if (!allowStart || this.think > 0 || this.recovery > 0 || !players.length) return {};
    this.think = 0.2;
    const target = [...players].sort((a, b) => this.threat(b, players) - this.threat(a, players))[0];
    boss.targetPlayer = target.id;
    if (boss.phase === 3 || boss.limbs.every(l => l.broken)) {
      if (!this.heartAwake) {
        this.heartAwake = true;
        this.credit.clear();
        this.rng = random(this.seed ^ 0x48454152);
      }
      const pickFlavor = attackFlavorPicker(boss.kit.seed, boss.kit.attacks);
      for (const kind of ['ring', 'spiral', 'laser', 'slam'] as const) {
        if (boss.kit.attacks.some(a => a.id === `heart-${kind}`)) continue;
        const symbol = (boss.kit.code as Partial<BossCode> | undefined)?.attackSymbols?.[`heart-${kind}`];
        const flavor = pickFlavor(kind);
        boss.kit.attacks.push({ id: `heart-${kind}`, source: 'heart', kind, name: symbol ? `${symbol} ${flavor}` : `FATAL: Heartbeat ${flavor}`,
          damage: squadBudget(this.playerCount).hitDamage, cooldown: 7 * squadBudget(this.playerCount).recoveryScale, telegraph: 0.95,
          params: { count: kind === 'spiral' ? 32 : 19, speed: 59, radius: 36, threatShare: 0.25, threatCost: ATTACK_COST[kind] } });
      }
    }
    const choices = boss.kit.attacks.filter(a => {
      const limb = boss.kit.limbs.find(l => l.component === a.source);
      return (!limb || !boss.limbs.find(l => l.id === limb.id)?.broken) && (this.cooldowns.get(a.id) ?? 0) <= 0;
    });
    if (!choices.length) return {};
    const clustered = players.filter(p => distance(p, target) < 55).length;
    const totalShare = choices.reduce((sum, a) => sum + (a.params.threatShare ?? 1), 0);
    for (const a of choices) this.credit.set(a.id, (this.credit.get(a.id) ?? 0) + (a.params.threatShare ?? 1) / totalShare);
    const scored = choices.map(a => ({ a, score: (this.credit.get(a.id) ?? 0) + this.rng() * 0.12 +
      ((a.kind === 'slam' || a.kind === 'cascade') ? Math.min(3, clustered) * 0.025 : 0) +
      (a.kind === 'fan' && target.invuln <= 0 ? 0.04 : 0) }));
    scored.sort((a, b) => b.score - a.score);
    const attack = scored[0].a;
    this.credit.set(attack.id, (this.credit.get(attack.id) ?? 0) - 1);
    boss.casting = { attackId: attack.id, t: 0, total: Math.max(0.6, attack.telegraph), target: [target.x, target.y] };
    return { started: attack, target: [target.x, target.y] };
  }

  private threat(p: PlayerState, players: PlayerState[]) {
    const maxDamage = Math.max(1, ...players.map(other => other.stats.damage));
    return p.stats.damage / maxDamage + (1 - p.hp / p.kit.maxHp) * 0.9 + (p.invuln <= 0 ? 0.25 : 0) + (p.buffs.includes('fork') ? -2 : 0);
  }
}
