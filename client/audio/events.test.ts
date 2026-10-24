import { describe, expect, it } from 'vitest';
import type { GameEvent, SkillKind } from '../../shared/types';
import { eventToSfx, eventsToSfx } from './events';
import type { AudioHit } from './events';
import { MUSIC_PROFILES, musicBpm, renderMusic, renderSfx } from './synth';
import type { SfxName } from './synth';

const hit: AudioHit = { type: 'hit', target: 'boss', amount: 12, x: 200, y: 120 };

describe('pure event -> SFX mapping', () => {
  it('uses a crushed hit for normal damage, and ignores zero damage', () => {
    expect(eventToSfx(hit, 'me').map(cue => cue.sound)).toEqual(['hit']);
    expect(eventToSfx({ ...hit, amount: 0 }, 'me')).toEqual([]);
  });
  it('uses explicit optional crit metadata, without guessing from large damage', () => {
    expect(eventToSfx({ ...hit, crit: true } as AudioHit, 'me')[0].sound).toBe('crit');
    expect(eventToSfx({ ...hit, amount: 999 }, 'me')[0].sound).toBe('hit');
  });
  it('adds a rising combo cue and preserves an accompanying crit', () => {
    const two = eventToSfx({ ...hit, combo: 2 }, 'me');
    const four = eventToSfx({ ...hit, crit: true, combo: 4 } as AudioHit, 'me');
    expect(two.map(cue => cue.sound)).toEqual(['hit', 'combo']);
    expect(four.map(cue => cue.sound)).toEqual(['crit', 'combo']);
    expect(four[1].pitch).toBeGreaterThan(two[1].pitch);
    expect(eventToSfx({ ...hit, combo: 1 }, 'me')).toHaveLength(1);
  });
  it('emphasizes attacks sourced from self and self damage, without treating remote hits as self', () => {
    const remote = eventToSfx({ ...hit, source: 'friend' } as AudioHit, 'me')[0];
    const own = eventToSfx({ ...hit, source: 'me' } as AudioHit, 'me')[0];
    expect(own.gain).toBeGreaterThan(remote.gain);
    expect(own.pitch).toBeGreaterThan(remote.pitch);
    expect(own.self).toBe(true);
    expect(remote.self).toBe(false);
    const hurt = eventToSfx({ ...hit, target: 'me', combo: 4 }, 'me');
    expect(hurt).toHaveLength(1);
    expect(hurt[0]).toMatchObject({ sound: 'hurt', self: true });
  });
  it('makes warnings targeted at self more prominent and retains broadcast warnings', () => {
    const event: GameEvent = { type: 'telegraph', attackId: 'laser', name: 'FATAL', targetPlayer: 'me' };
    const own = eventToSfx(event, 'me')[0];
    const other = eventToSfx({ ...event, targetPlayer: null }, 'me')[0];
    expect(own).toMatchObject({ sound: 'telegraph', self: true });
    expect(own.gain).toBeGreaterThan(other.gain);
    expect(other.self).toBe(false);
  });
  it.each([
    [{ type: 'limbBroken', limb: 'router', by: 'me' }, 'limbBroken'],
    [{ type: 'downed', player: 'me' }, 'downed'],
    [{ type: 'revived', player: 'friend', by: 'me' }, 'revived'],
  ] as const)('recognizes personal participation in %s', (event, sound) => {
    expect(eventToSfx(event, 'me')[0]).toMatchObject({ sound, self: true });
    expect(eventToSfx(event, 'stranger')[0].self).toBe(false);
  });
  it.each(['firewall', 'fork', 'hotfix', 'overclock', 'rollback'] as SkillKind[])('retains the %s skill voice', skill => {
    expect(eventToSfx({ type: 'skill', player: 'me', skill }, 'me')[0])
      .toMatchObject({ sound: 'skill', variant: skill, self: true });
  });
  it('maps all phases and the end states with priority over incidental hits', () => {
    const normal = eventToSfx(hit, 'me')[0];
    for (const phase of [1, 2, 3] as const) {
      expect(eventToSfx({ type: 'phase', phase }, 'me')[0])
        .toMatchObject({ sound: 'phase', variant: phase, priority: 5 });
    }
    for (const type of ['victory', 'defeat'] as const) {
      const cue = eventToSfx({ type }, 'me')[0];
      expect(cue.sound).toBe(type);
      expect(cue.priority).toBeGreaterThan(normal.priority);
    }
  });
  it.each(['energy', 'heart', 'armor'] as const)('maps %s pickups to a distinct blip and emphasizes self', kind => {
    const event: GameEvent = { type: 'pickup', player: 'me', kind, x: 80, y: 90 };
    const own = eventToSfx(event, 'me')[0];
    const remote = eventToSfx(event, 'friend')[0];
    expect(own).toMatchObject({ sound: `pickup:${kind}`, self: true });
    expect(own.gain).toBeGreaterThan(remote.gain);
    expect(own.pitch).toBeGreaterThan(remote.pitch);
    expect(remote.self).toBe(false);
  });
  it('maps broken cover to a lower-priority shatter without inventing a responsible player', () => {
    expect(eventToSfx({ type: 'obstacleBroken', id: 7, label: 'router.ts', x: 80, y: 90 }, 'me')[0])
      .toMatchObject({ sound: 'obstacleBroken', self: false, priority: 1 });
  });
  it('maps perks to a merge-approved jingle with personal emphasis', () => {
    const event: GameEvent = { type: 'perk', player: 'me', perk: 'overclock' };
    const own = eventToSfx(event, 'me')[0];
    const other = eventToSfx(event, 'friend')[0];
    expect(own).toMatchObject({ sound: 'perk', self: true, priority: 4 });
    expect(own.gain).toBeGreaterThan(other.gain);
    expect(own.pitch).toBeGreaterThan(other.pitch);
  });
  it('does not mutate snapshots and gives spectators no personal emphasis', () => {
    const event = Object.freeze({ type: 'revived', player: '', by: '' } as const);
    expect(eventToSfx(event, '')[0].self).toBe(false);
    const events = [hit, { type: 'victory' } as const];
    const before = JSON.stringify(events);
    expect(eventsToSfx(events, 'me').map(cue => cue.sound)).toEqual(['hit', 'victory']);
    expect(JSON.stringify(events)).toBe(before);
    expect(eventsToSfx([], 'me')).toEqual([]);
  });
});

describe('procedural PCM', () => {
  it('assigns a distinct tempo, scale, and lead timbre to each arena', () => {
    const themes = ['terminal', 'kernel', 'web', 'notebook', 'enterprise', 'legacy'] as const;
    expect(new Set(themes.map(theme => MUSIC_PROFILES[theme].bpm)).size).toBe(6);
    expect(new Set(themes.map(theme => MUSIC_PROFILES[theme].scale.join(','))).size).toBe(6);
    expect(new Set(themes.map(theme => `${MUSIC_PROFILES[theme].wave}:${MUSIC_PROFILES[theme].duty}`)).size).toBe(6);
    for (const theme of themes) {
      expect(musicBpm(theme, 3)).toBeGreaterThan(musicBpm(theme, 2));
      expect(musicBpm(theme, 2)).toBeGreaterThan(musicBpm(theme, 1));
    }
  });
  it('renders deterministic non-silent finite PCM for every SFX and weapon', () => {
    const names: SfxName[] = ['hit', 'hurt', 'crit', 'combo', 'telegraph', 'limbBroken', 'downed', 'revived', 'skill', 'phase',
      'victory', 'defeat', 'dash', 'ui', 'intro', 'skill:firewall', 'skill:fork', 'skill:hotfix', 'skill:overclock', 'skill:rollback',
      'fire:blaster', 'fire:smg', 'fire:shotgun', 'fire:cannon', 'fire:staff', 'fire:laser', 'fire:blade',
      'pickup:energy', 'pickup:heart', 'pickup:armor', 'obstacleBroken', 'perk'];
    for (const name of names) {
      const pcm = renderSfx(name, 12000);
      expect(pcm.length).toBeGreaterThan(100);
      expect(pcm.some(sample => Math.abs(sample) > 0.01)).toBe(true);
      expect(pcm.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 0.751)).toBe(true);
      expect(pcm).toEqual(renderSfx(name, 12000));
    }
  });
  it('adds faster phase arrangements, distinct music and silent loop boundaries', () => {
    const one = renderMusic('terminal', 1, 12000);
    const two = renderMusic('terminal', 2, 12000);
    const three = renderMusic('terminal', 3, 12000);
    expect(one.length).toBeGreaterThan(two.length);
    expect(two.length).toBeGreaterThan(three.length);
    expect(one).not.toEqual(renderMusic('notebook', 1, 12000));
    for (const pcm of [one, two, three]) {
      expect(Math.abs(pcm[0])).toBe(0);
      expect(Math.abs(pcm[pcm.length - 1])).toBe(0);
      expect(pcm.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 0.751)).toBe(true);
    }
    expect(musicBpm('lobby', 3)).toBe(musicBpm('lobby', 1));
  });
});
