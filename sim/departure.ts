import type { GameEvent, MatchState } from '../shared/types.ts';

/** Drop unsent cues and floor-pad bookkeeping that reference an explicit departure. */
export function forgetPlayer(state: MatchState, id: string): number[] {
  const bullets = state.bullets.filter(b => b.owner === id).map(b => b.id);
  state.bullets = state.bullets.filter(b => b.owner !== id);
  state.events = state.events.filter(event => !referencesPlayer(event, id));
  if (state.perkOffer) {
    delete state.perkOffer.picked[id];
    const offer = state.perkOffer as typeof state.perkOffer & { progress?: Record<string, unknown> };
    if (offer.progress) delete offer.progress[id];
  }
  return bullets;
}
function referencesPlayer(event: GameEvent, id: string): boolean {
  return ('player' in event && event.player === id) || ('by' in event && event.by === id)
    || ('source' in event && event.source === id) || ('target' in event && event.target === id)
    || ('targetPlayer' in event && event.targetPlayer === id) || ('ref' in event && event.ref === id);
}
