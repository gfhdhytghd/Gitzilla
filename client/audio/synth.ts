import type { ArenaTheme, SkillKind, WeaponKind } from '../../shared/types';
import type { EventSound } from './events';

export type MusicTheme = ArenaTheme | 'lobby' | 'victory' | 'defeat';
export type Wave = 'pulse' | 'triangle' | 'saw' | 'sine' | 'noise' | 'bell' | 'organ';
export type SfxName = EventSound | `fire:${WeaponKind}` | 'dash' | 'ui' | 'intro' | `skill:${SkillKind}`;
interface Patch {
  wave: Wave; from: number; to?: number; at?: number; length: number;
  gain?: number; decay?: number; duty?: number; bits?: number; hold?: number;
}
export interface MusicProfile {
  label: string; bpm: number; root: number; scale: readonly number[]; wave: Wave; duty: number;
}
export const MUSIC_PROFILES: Record<MusicTheme, MusicProfile> = {
  terminal: { label: 'TTY / minor pentatonic / narrow pulse', bpm: 112, root: 45, scale: [0, 3, 5, 7, 10], wave: 'pulse', duty: 0.25 },
  kernel: { label: 'IRQ / Phrygian / grinding saw', bpm: 96, root: 38, scale: [0, 1, 3, 5, 7, 8, 10], wave: 'saw', duty: 0.5 },
  web: { label: 'WSS / Lydian / bright micro-pulse', bpm: 132, root: 57, scale: [0, 2, 4, 6, 7, 9, 11], wave: 'pulse', duty: 0.125 },
  notebook: { label: 'CELL / Dorian / FM bell', bpm: 88, root: 50, scale: [0, 2, 3, 5, 7, 9, 10], wave: 'bell', duty: 0.5 },
  enterprise: { label: 'JVM / major / octave organ', bpm: 104, root: 48, scale: [0, 2, 4, 5, 7, 9, 11], wave: 'organ', duty: 0.5 },
  legacy: { label: 'BIOS / harmonic minor / plucked triangle', bpm: 76, root: 45, scale: [0, 2, 3, 5, 7, 8, 11], wave: 'triangle', duty: 0.5 },
  lobby: { label: 'BOOT / major pentatonic / soft triangle', bpm: 92, root: 60, scale: [0, 2, 4, 7, 9], wave: 'triangle', duty: 0.5 },
  victory: { label: 'BUILD OK / major / fanfare pulse', bpm: 144, root: 60, scale: [0, 2, 4, 5, 7, 9, 11], wave: 'pulse', duty: 0.5 },
  defeat: { label: 'CORE DUMP / diminished / low sine', bpm: 60, root: 45, scale: [0, 2, 3, 5, 6, 8, 9, 11], wave: 'sine', duty: 0.5 },
};
export const isArenaTheme = (theme: MusicTheme): theme is ArenaTheme =>
  theme !== 'lobby' && theme !== 'victory' && theme !== 'defeat';
export const midiHz = (note: number): number => 440 * 2 ** ((note - 69) / 12);
export function musicBpm(theme: MusicTheme, phase: 1 | 2 | 3): number {
  return MUSIC_PROFILES[theme].bpm * (isArenaTheme(theme) ? phase === 3 ? 1.24 : phase === 2 ? 1.12 : 1 : 1);
}

function waveValue(wave: Wave, phase: number, duty: number): number {
  const cycle = phase % 1;
  switch (wave) {
    case 'pulse': return cycle < duty ? 0.7 : -0.7;
    case 'triangle': return 1 - 4 * Math.abs(cycle - 0.5);
    case 'saw': return cycle * 2 - 1;
    case 'bell': return Math.sin(phase * Math.PI * 2 + 1.6 * Math.sin(phase * Math.PI * 4));
    case 'organ': return (Math.sin(phase * Math.PI * 2) + 0.4 * Math.sin(phase * Math.PI * 4) + 0.2 * Math.sin(phase * Math.PI * 8)) / 1.6;
    default: return Math.sin(phase * Math.PI * 2);
  }
}

/** Add one enveloped oscillator/noise voice to a PCM mix. Seeded noise is repeatable. */
function addPatch(mix: Float32Array, rate: number, patch: Patch, seed = 0x42c0ffee): void {
  const first = Math.floor((patch.at ?? 0) * rate);
  const length = Math.floor(patch.length * rate);
  let phase = 0;
  let held = 0;
  let random = seed | 0;
  const hold = patch.hold ?? 1;
  for (let i = 0; i < length && first + i < mix.length; i++) {
    const t = i / rate;
    const progress = i / Math.max(1, length - 1);
    const hz = patch.from * ((patch.to ?? patch.from) / Math.max(1, patch.from)) ** progress;
    phase += hz / rate;
    if (i % hold === 0) {
      random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
      held = patch.wave === 'noise' ? (random >>> 0) / 0xffffffff * 2 - 1 : waveValue(patch.wave, phase, patch.duty ?? 0.5);
      if (patch.bits) held = Math.round(held * 2 ** (patch.bits - 1)) / 2 ** (patch.bits - 1);
    }
    const envelope = Math.min(1, t / 0.002) * Math.min(1, (patch.length - t) / 0.012)
      * Math.exp(-(patch.decay ?? 3) * progress);
    mix[first + i] += held * envelope * (patch.gain ?? 0.5);
  }
}

function finish(mix: Float32Array, drive = 1): Float32Array {
  for (let i = 0; i < mix.length; i++) mix[i] = Math.tanh(mix[i] * drive) * 0.75;
  return mix;
}

function notes(frequencies: number[], wave: Wave, step: number, gain = 0.5, length = step * 1.7): Patch[] {
  return frequencies.map((from, index) => ({ wave, from, at: index * step, length, gain, decay: 3 }));
}

function sfxPatches(name: SfxName): Patch[] {
  switch (name) {
    case 'hit': return [{ wave: 'noise', from: 1, length: 0.065, gain: 0.55, bits: 4, hold: 8 }, { wave: 'pulse', from: 230, to: 65, length: 0.08, bits: 4, hold: 6, gain: 0.4 }];
    case 'hurt': return [{ wave: 'saw', from: 170, to: 45, length: 0.25, bits: 4, hold: 10, gain: 0.7 }, { wave: 'noise', from: 1, length: 0.13, gain: 0.3, hold: 9 }];
    case 'crit': return [...notes([1318, 1760, 2093], 'pulse', 0.035, 0.45, 0.12), { wave: 'noise', from: 1, length: 0.09, gain: 0.5, bits: 4, hold: 5 }];
    case 'combo': return notes([659, 830, 988, 1318], 'bell', 0.045, 0.55, 0.18);
    case 'telegraph': return [0, 0.15, 0.3].map((at, index) => ({ wave: 'pulse', from: index === 1 ? 622 : 880, at, length: 0.105, gain: 0.55, decay: 0.8 }));
    case 'limbBroken': return [{ wave: 'noise', from: 1, length: 0.65, gain: 0.85, bits: 4, hold: 12, decay: 5 }, { wave: 'saw', from: 110, to: 28, length: 0.6, gain: 0.65 }, ...notes([1568, 1175, 784, 392], 'pulse', 0.06, 0.22)];
    case 'downed': return [...notes([392, 330, 261, 185], 'triangle', 0.13, 0.7, 0.32), { wave: 'pulse', from: 65, to: 35, length: 0.7, gain: 0.25 }];
    case 'revived': return notes([261, 330, 392, 523, 659], 'bell', 0.1, 0.65, 0.4);
    case 'skill':
    case 'skill:firewall': return [...notes([220, 330, 440, 660], 'organ', 0.055, 0.6, 0.3), { wave: 'noise', from: 1, length: 0.22, gain: 0.15, hold: 6 }];
    case 'skill:fork': return notes([440, 554, 440, 659, 554, 880], 'pulse', 0.05, 0.45, 0.13);
    case 'skill:hotfix': return notes([330, 440, 554, 659], 'bell', 0.09, 0.65, 0.4);
    case 'skill:overclock': return [{ wave: 'saw', from: 110, to: 1760, length: 0.42, gain: 0.65, bits: 5 }, ...notes([880, 1175, 1568], 'pulse', 0.06, 0.25)];
    case 'skill:rollback': return [{ wave: 'bell', from: 1760, to: 110, length: 0.5, gain: 0.75, hold: 3 }, ...notes([659, 440, 330], 'triangle', 0.08, 0.25)];
    case 'phase': return [{ wave: 'saw', from: 55, to: 440, length: 0.6, gain: 0.6, bits: 4, hold: 8 }, ...notes([1760, 880, 1760, 1320, 440], 'pulse', 0.07, 0.35, 0.09)];
    case 'victory': return [...notes([523, 659, 784, 1046, 784, 1046], 'pulse', 0.14, 0.45, 0.35), ...notes([261, 330, 392], 'triangle', 0.28, 0.5, 0.65)];
    case 'defeat': return [...notes([440, 415, 330, 220, 110], 'triangle', 0.2, 0.7, 0.5), { wave: 'noise', from: 1, at: 0.65, length: 0.6, gain: 0.2, bits: 3, hold: 16 }];
    case 'dash': return [{ wave: 'noise', from: 1, length: 0.16, gain: 0.45, hold: 3 }, { wave: 'triangle', from: 880, to: 110, length: 0.12, gain: 0.65 }];
    case 'ui': return [{ wave: 'noise', from: 1, length: 0.025, gain: 0.5, decay: 8, hold: 2 }, { wave: 'pulse', from: 1900, to: 700, length: 0.018, gain: 0.28 }];
    case 'intro': return [
      { wave: 'sine', from: 350, length: 0.25, gain: 0.3, decay: 0.2 },
      { wave: 'sine', from: 440, length: 0.25, gain: 0.3, decay: 0.2 },
      { wave: 'pulse', from: 2100, to: 1300, at: 0.28, length: 0.23, gain: 0.32, decay: 1 },
      ...Array.from({ length: 16 }, (_, i): Patch => ({ wave: 'pulse', from: i % 3 ? 1200 : 2200, at: 0.55 + i * 0.045, length: 0.038, gain: 0.23, decay: 0.3, bits: 5 })),
      { wave: 'noise', from: 1, at: 0.9, length: 0.5, gain: 0.35, bits: 3, hold: 6 },
      { wave: 'saw', from: 110, to: 32, at: 1.3, length: 0.55, gain: 0.6 },
    ];
    case 'fire:blaster': return [{ wave: 'pulse', from: 950, to: 145, length: 0.105, gain: 0.7, duty: 0.25, bits: 6 }];
    case 'fire:smg': return [{ wave: 'pulse', from: 520, to: 170, length: 0.055, gain: 0.5 }, { wave: 'noise', from: 1, length: 0.04, gain: 0.35, bits: 4 }];
    case 'fire:shotgun': return [{ wave: 'noise', from: 1, length: 0.2, gain: 0.9, bits: 4, hold: 5, decay: 6 }, { wave: 'pulse', from: 120, to: 35, length: 0.16, gain: 0.5 }];
    case 'fire:cannon': return [{ wave: 'sine', from: 100, to: 28, length: 0.5, gain: 1 }, { wave: 'noise', from: 1, length: 0.35, gain: 0.65, bits: 4, hold: 16 }];
    case 'fire:staff': return [{ wave: 'bell', from: 440, to: 880, length: 0.25, gain: 0.7 }, { wave: 'sine', from: 659, to: 1318, at: 0.025, length: 0.22, gain: 0.2 }];
    case 'fire:laser': return [{ wave: 'saw', from: 1800, to: 240, length: 0.15, gain: 0.6, bits: 6, hold: 2 }];
    case 'fire:blade': return [{ wave: 'triangle', from: 2400, to: 300, length: 0.13, gain: 0.55 }, { wave: 'noise', from: 1, length: 0.17, gain: 0.55, decay: 6 }];
  }
}

/** Pure offline synthesis, including sample-and-hold + quantization for crushed impacts. */
export function renderSfx(name: SfxName, sampleRate: number): Float32Array {
  const patches = sfxPatches(name);
  const duration = Math.max(...patches.map(p => (p.at ?? 0) + p.length));
  const pcm = new Float32Array(Math.ceil(duration * sampleRate));
  patches.forEach((patch, index) => addPatch(pcm, sampleRate, patch, 0x12345678 + index * 9323));
  return finish(pcm, 1.4);
}

/** Four bars, 16 steps/bar. Buffers loop sample-accurately; no timer-driven audio. */
export function renderMusic(theme: MusicTheme, phase: 1 | 2 | 3, rate: number): Float32Array {
  const profile = MUSIC_PROFILES[theme];
  const activePhase = isArenaTheme(theme) ? phase : 1;
  const stepTime = 60 / musicBpm(theme, activePhase) / 4;
  const mix = new Float32Array(Math.round(64 * stepTime * rate));
  const melody = [0, 2, 4, 2, 1, 3, 4, 6, 4, 2, 1, 3, 0, 4, 3, 1];
  const chords = [0, 3, 4, 2];
  const degree = (n: number) => profile.root + profile.scale[((n % profile.scale.length) + profile.scale.length) % profile.scale.length]
    + Math.floor(n / profile.scale.length) * 12;
  for (let step = 0; step < 64; step++) {
    const bar = Math.floor(step / 16);
    const chord = chords[bar];
    const at = step * stepTime;
    // Notebook/legacy leave air between lead notes; web/terminal run arpeggios.
    const sparse = theme === 'notebook' || theme === 'legacy' || theme === 'defeat';
    if (!sparse || step % 2 === 0) {
      const hz = midiHz(degree(melody[step % melody.length] + chord));
      addPatch(mix, rate, { wave: profile.wave, from: hz, at, length: stepTime * (sparse ? 1.7 : 0.8), gain: 0.25,
        duty: profile.duty, decay: theme === 'enterprise' ? 1.2 : 3.5 });
    }
    if (step % 4 === 0 || (activePhase >= 2 && step % 4 === 2)) {
      addPatch(mix, rate, { wave: 'triangle', from: midiHz(degree(chord) - 24 + (step % 8 === 4 ? 7 : 0)),
        at, length: stepTime * 2.5, gain: 0.4, decay: 2.5 });
    }
    if (activePhase >= 2) {
      if (step % 8 === 0) addPatch(mix, rate, { wave: 'sine', from: 140, to: 35, at, length: 0.16, gain: 0.6, decay: 5 });
      if (step % 8 === 4) addPatch(mix, rate, { wave: 'noise', from: 1, at, length: 0.12, gain: 0.3, hold: 2, decay: 6 }, step + 8381);
      if (step % 2 === 0) addPatch(mix, rate, { wave: 'noise', from: 1, at, length: 0.035, gain: 0.1, decay: 7 }, step + 7363);
    }
  }
  if (activePhase === 3) {
    const stepSamples = Math.round(stepTime * rate);
    // Every bar's last beat becomes a deliberately chopped/repeated data packet.
    const original = mix.slice();
    for (let i = 0; i < mix.length; i++) {
      const step = Math.floor(i / (stepTime * rate));
      let source = i - i % 4; // sample-and-hold bitcrush under the distortion stage
      if (step % 16 >= 14) {
        const beatStart = Math.floor(step / 16) * 16 * stepSamples + 14 * stepSamples;
        const slice = Math.max(1, Math.floor(stepSamples / 4));
        const offset = i - beatStart;
        source = Math.min(original.length - 1, Math.max(0, beatStart + offset % slice));
        if (Math.floor(offset / slice) % 2) { mix[i] = 0; continue; }
      }
      mix[i] = Math.round(original[source] * 16) / 16;
    }
  }
  finish(mix, activePhase === 3 ? 2.5 : 1.3);
  const fade = Math.min(Math.floor(rate * 0.004), Math.floor(mix.length / 2));
  for (let i = 0; i < fade; i++) {
    mix[i] *= i / fade;
    mix[mix.length - 1 - i] *= i / fade;
  }
  return mix;
}
