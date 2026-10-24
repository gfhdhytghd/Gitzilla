import type { PerkOffer, PlayerState } from '../shared/types.ts';
import { random } from './math.ts';

export const PERKS = [
  { id: 'force', name: '--force', desc: '+25% weapon damage' },
  { id: 'no-verify', name: '--no-verify', desc: 'Dash cooldown -40%' },
  { id: 'pair-programming', name: 'pair-programming', desc: 'Revive twice as fast within a 40px aura' },
  { id: 'lint-fix', name: 'lint --fix', desc: 'Armor starts in 2s; regenerates 50% faster' },
  { id: 'cache-hit', name: 'cache hit', desc: 'Weapon energy cost -30%' },
  { id: 'hotfix-plus', name: 'hotfix++', desc: 'Skill cooldown -30%' },
  { id: 'tail-call', name: 'tail call', desc: '+12% movement speed' },
  { id: 'safe-mode', name: 'safe mode', desc: 'Incoming damage -20%' },
] as const;

export const hasPerk = (p: PlayerState, perk: string) => p.perks.includes(perk);

export function createPerkOffer(seed: number, now: number): PerkOffer {
  const rng = random(seed ^ 0x50524b53);
  const shuffled = [...PERKS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { endsAt: now + 5, picked: {}, pads: shuffled.slice(0, 3).map((perk, i) => ({ ...perk, x: 100 + i * 140, y: 144, r: 18 })) };
}
