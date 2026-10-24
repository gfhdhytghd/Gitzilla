import type { ArenaTheme, GameEvent, WeaponKind } from '../../shared/types';
import { eventsToSfx } from './events';
import { isArenaTheme, renderMusic, renderSfx } from './synth';
import type { MusicTheme, SfxName } from './synth';

export interface KaijuAudio {
  unlock(): Promise<void>;
  onEvents(events: GameEvent[], selfId: string): void;
  onFire(weapon: WeaponKind): void;
  onDash(): void;
  music(theme: ArenaTheme | 'lobby' | 'victory' | 'defeat', phase?: 1 | 2 | 3, options?: { intro?: boolean }): void;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  /** Optional UI helpers beyond the requested interface. */
  onUi(): void;
  onBossIntro(): void;
  dispose(): void;
}

interface Voice { source: AudioBufferSourceNode; gain: GainNode; priority: number; end: number }
interface MusicVoice { source: AudioBufferSourceNode; gain: GainNode; drive?: WaveShaperNode }
const MAX_SFX_VOICES = 12;

/** Safe to create before a gesture: no context, autoplay, timers, or DOM listeners yet. */
export function createAudio(): KaijuAudio {
  let context: AudioContext | undefined;
  let sfxBus: GainNode | undefined;
  let musicBus: GainNode | undefined;
  let master: GainNode | undefined;
  let compressor: DynamicsCompressorNode | undefined;
  let limiter: WaveShaperNode | undefined;
  let volume = 0.6;
  let muted = false;
  let disposed = false;
  let desired: { theme: MusicTheme; phase: 1 | 2 | 3 } | null = null;
  let currentMusic: MusicVoice | null = null;
  let pendingIntro = false;
  const musicVoices = new Set<MusicVoice>();
  const voices = new Set<Voice>();
  const lastPlayed = new Map<string, number>();
  const sfxBuffers = new Map<SfxName, AudioBuffer>();
  const musicBuffers = new Map<string, AudioBuffer>();

  const ready = () => !disposed && !muted && context?.state === 'running';
  const toBuffer = (pcm: Float32Array): AudioBuffer => {
    const buffer = context!.createBuffer(1, pcm.length, context!.sampleRate);
    buffer.getChannelData(0).set(pcm);
    return buffer;
  };
  const outputLevel = () => {
    if (!context || !master) return;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, 0.015);
  };
  const stopVoice = (voice: Voice) => {
    voices.delete(voice);
    if (!context) return;
    voice.gain.gain.cancelScheduledValues(context.currentTime);
    voice.gain.gain.setTargetAtTime(0, context.currentTime, 0.002);
    voice.source.stop(context.currentTime + 0.012);
  };
  const play = (name: SfxName, gain = 0.45, pitch = 0, priority = 1, cooldown = 0.055, group = name as string) => {
    if (!ready() || !context || !sfxBus) return;
    const now = context.currentTime;
    if (now - (lastPlayed.get(group) ?? -Infinity) < cooldown) return;
    for (const voice of voices) if (voice.end <= now) voices.delete(voice);
    if (voices.size >= MAX_SFX_VOICES) {
      const victim = [...voices].sort((a, b) => a.priority - b.priority || a.end - b.end)[0];
      if (victim.priority > priority) return;
      stopVoice(victim);
    }
    let buffer = sfxBuffers.get(name);
    if (!buffer) { buffer = toBuffer(renderSfx(name, context.sampleRate)); sfxBuffers.set(name, buffer); }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const rate = 2 ** (pitch / 12);
    source.playbackRate.value = rate;
    const level = context.createGain();
    level.gain.value = Math.min(1, Math.max(0, gain));
    source.connect(level).connect(sfxBus);
    const voice: Voice = { source, gain: level, priority, end: context.currentTime + buffer.duration / rate };
    voices.add(voice);
    source.onended = () => { voices.delete(voice); source.disconnect(); level.disconnect(); };
    // Synthesis above can take a few milliseconds, so schedule against the fresh audio clock.
    source.start();
    source.stop(voice.end + 0.005);
    lastPlayed.set(group, context.currentTime);
  };
  const fadeMusic = () => {
    if (!context || !currentMusic) return;
    const old = currentMusic;
    currentMusic = null;
    old.gain.gain.cancelScheduledValues(context.currentTime);
    old.gain.gain.setTargetAtTime(0, context.currentTime, 0.025);
    old.source.stop(context.currentTime + 0.15);
  };
  const startMusic = () => {
    if (!ready() || !context || !musicBus || !desired) return;
    const { theme, phase } = desired;
    const key = `${theme}:${phase}`;
    let buffer = musicBuffers.get(key);
    if (!buffer) {
      buffer = toBuffer(renderMusic(theme, phase, context.sampleRate));
      // A phone only needs its current encounter's tracks; bound the demo's theme-switch cache.
      if (musicBuffers.size >= 6) musicBuffers.delete(musicBuffers.keys().next().value!);
      musicBuffers.set(key, buffer);
    }
    fadeMusic();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(1, context.currentTime + 0.08);
    let drive: WaveShaperNode | undefined;
    if (isArenaTheme(theme) && phase === 3) {
      drive = context.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / (curve.length - 1) * 2 - 1) * 2.6) * 0.7;
      drive.curve = curve;
      drive.oversample = '2x';
      source.connect(drive).connect(gain);
    } else source.connect(gain);
    gain.connect(musicBus);
    const voice = { source, gain, drive };
    currentMusic = voice;
    musicVoices.add(voice);
    source.onended = () => {
      musicVoices.delete(voice);
      source.disconnect(); gain.disconnect(); drive?.disconnect();
    };
    source.start();
    if (pendingIntro) { pendingIntro = false; play('intro', 0.6, 0, 5, 2.5); }
  };

  const api: KaijuAudio = {
    async unlock() {
      if (disposed || typeof window === 'undefined') return;
      if (!context) {
        const Context = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) return;
        context = new Context({ latencyHint: 'interactive' });
        master = context.createGain();
        master.gain.value = muted ? 0 : volume;
        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 14;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.12;
        sfxBus = context.createGain(); sfxBus.gain.value = 0.8;
        musicBus = context.createGain(); musicBus.gain.value = 0.32;
        sfxBus.connect(compressor); musicBus.connect(compressor);
        // Compressor handles the mix; a final bounded curve catches transient overshoot.
        limiter = context.createWaveShaper();
        limiter.curve = new Float32Array([-0.92, 0, 0.92]);
        compressor.connect(limiter).connect(master).connect(context.destination);
        // One silent sample primes older iOS audio output within the user gesture.
        const prime = context.createBufferSource();
        prime.buffer = context.createBuffer(1, 1, context.sampleRate);
        prime.connect(master);
        prime.onended = () => prime.disconnect();
        prime.start();
      }
      // Call resume before the first await to preserve click/tap activation.
      await context.resume();
      if (!disposed && !currentMusic) startMusic();
    },
    onEvents(events, selfId) {
      if (disposed) return;
      for (const event of events) {
        if (event.type === 'phase' && desired && isArenaTheme(desired.theme)) api.music(desired.theme, event.phase);
        if (event.type === 'victory' || event.type === 'defeat') api.music(event.type);
      }
      const cues = eventsToSfx(events, selfId).sort((a, b) => b.priority - a.priority);
      for (const cue of cues) {
        const name: SfxName = cue.sound === 'skill' && typeof cue.variant === 'string' ? `skill:${cue.variant}` : cue.sound;
        const cooldown = cue.sound === 'hit' || cue.sound === 'hurt' ? 0.045
          : cue.sound === 'combo' ? 0.12 : cue.priority >= 4 ? 0.35 : 0.09;
        play(name, cue.gain, cue.pitch, cue.priority, cooldown, `${name}:${cue.self ? 'self' : 'other'}`);
      }
    },
    onFire(weapon) {
      const cooldown: Record<WeaponKind, number> = { blaster: 0.1, smg: 0.055, shotgun: 0.16, cannon: 0.25, staff: 0.12, laser: 0.09, blade: 0.1 };
      play(`fire:${weapon}`, 0.4, 1, 1, cooldown[weapon]);
    },
    onDash() { play('dash', 0.5, 2, 2, 0.22); },
    music(theme, phase = 1, options = {}) {
      if (disposed) return;
      if (options.intro === false) pendingIntro = false;
      const activePhase = isArenaTheme(theme) ? phase : 1;
      if (desired?.theme === theme && desired.phase === activePhase) return;
      const previous = desired;
      desired = { theme, phase: activePhase };
      pendingIntro = options.intro !== false && isArenaTheme(theme) && activePhase === 1
        && (!previous || !isArenaTheme(previous.theme) || previous.theme !== theme);
      startMusic();
    },
    setMuted(value) {
      if (disposed || value === muted) return;
      muted = value;
      outputLevel();
      if (muted) { fadeMusic(); for (const voice of [...voices]) stopVoice(voice); }
      else if (!currentMusic) startMusic();
    },
    setVolume(value) { if (!disposed) { volume = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0; outputLevel(); } },
    onUi() { play('ui', 0.32, 0, 1, 0.035); },
    onBossIntro() {
      if (!ready()) { pendingIntro = true; return; }
      play('intro', 0.6, 0, 5, 2.5);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (context && context.state !== 'closed') void context.close().catch(() => {});
      for (const voice of voices) { voice.source.disconnect(); voice.gain.disconnect(); }
      for (const voice of musicVoices) { voice.source.disconnect(); voice.gain.disconnect(); voice.drive?.disconnect(); }
      voices.clear(); musicVoices.clear(); sfxBuffers.clear(); musicBuffers.clear(); lastPlayed.clear();
      sfxBus?.disconnect(); musicBus?.disconnect(); compressor?.disconnect(); limiter?.disconnect(); master?.disconnect();
      currentMusic = null;
    },
  };
  return api;
}
