import type { GameEvent, Pickup, SkillKind } from '../../shared/types';

export type EventSound = 'hit' | 'hurt' | 'crit' | 'combo' | 'telegraph' | 'limbBroken'
  | 'downed' | 'revived' | 'skill' | 'phase' | 'victory' | 'defeat'
  | `pickup:${Pickup['kind']}` | 'obstacleBroken' | 'perk' | 'lesson' | 'quizCorrect' | 'quizWrong';
export interface SoundCue {
  sound: EventSound;
  self: boolean;
  gain: number;
  pitch: number; // semitone offset
  priority: number;
  variant?: SkillKind | 1 | 2 | 3;
}

// Sim already emits these optional fields structurally while shared contracts catch up.
export type AudioHit = Extract<GameEvent, { type: 'hit' }> & { source?: string; crit?: boolean };

/** Pure mapping: no browser, randomness, time, or audio nodes. */
export function eventToSfx(event: GameEvent, selfId: string): SoundCue[] {
  const cue = (sound: EventSound, self = false, priority = 2, gain = 0.5, pitch = 0): SoundCue =>
    ({ sound, self, priority, gain: gain * (self ? 1.35 : 1), pitch: pitch + (self ? 3 : 0) });
  switch (event.type) {
    case 'hit': {
      if (event.amount <= 0) return [];
      const hit = event as AudioHit;
      const self = !!selfId && (hit.source === selfId || hit.target === selfId);
      const damagedSelf = !!selfId && hit.target === selfId;
      const sound = damagedSelf ? 'hurt' : hit.crit ? 'crit' : 'hit';
      const result = [cue(sound, self, damagedSelf ? 3 : hit.crit ? 2 : 0, damagedSelf ? 0.55 : hit.crit ? 0.48 : 0.3)];
      if (!damagedSelf && (hit.combo ?? 0) >= 2) {
        result.push(cue('combo', self, 2, 0.38, Math.min(12, ((hit.combo ?? 2) - 2) * 2)));
      }
      return result;
    }
    case 'telegraph': return [cue('telegraph', !!selfId && event.targetPlayer === selfId, 4, 0.5)];
    case 'limbBroken': return [cue('limbBroken', !!selfId && event.by === selfId, 4, 0.65)];
    case 'downed': return [cue('downed', !!selfId && event.player === selfId, 4, 0.6)];
    case 'revived': return [cue('revived', !!selfId && (event.player === selfId || event.by === selfId), 4, 0.55)];
    case 'skill': return [{ ...cue('skill', !!selfId && event.player === selfId, 3, 0.48), variant: event.skill }];
    case 'phase': return [{ ...cue('phase', false, 5, 0.65, (event.phase - 1) * 3), variant: event.phase }];
    case 'pickup': return [cue(`pickup:${event.kind}`, !!selfId && event.player === selfId, 2, 0.4)];
    case 'obstacleBroken': return [cue('obstacleBroken', false, 1, 0.4)];
    case 'perk': return [cue(event.correct === true ? 'quizCorrect' : event.correct === false ? 'quizWrong' : 'perk',
      !!selfId && event.player === selfId, event.correct === false ? 3 : 4, event.correct === false ? 0.35 : 0.55)];
    case 'lesson': return [cue('lesson', false, 1, 0.22)];
    case 'victory': return [cue('victory', false, 5, 0.7)];
    case 'defeat': return [cue('defeat', false, 5, 0.65)];
  }
}

export function eventsToSfx(events: GameEvent[], selfId: string): SoundCue[] {
  return events.flatMap(event => eventToSfx(event, selfId));
}
