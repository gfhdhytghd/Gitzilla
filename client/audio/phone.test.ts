import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio, readAudioDebugStatus } from './index';
import type { KaijuAudio } from './index';

const parameter = () => ({ value: 0, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
class NodeFixture {
  gain = parameter(); threshold = parameter(); knee = parameter(); ratio = parameter(); attack = parameter(); release = parameter();
  playbackRate = parameter(); buffer: any; loop = false; onended: (() => void) | null = null;
  start = vi.fn(); stop = vi.fn(); disconnect = vi.fn();
  connect(target: unknown) { return target; }
}
class ContextFixture extends EventTarget {
  static instances: ContextFixture[] = [];
  state = 'suspended'; sampleRate = 8000; currentTime = 0; destination = new NodeFixture();
  sources: NodeFixture[] = [];
  allowResume = true;
  resume = vi.fn((): Promise<void> => {
    calls.push('resume');
    if (!this.allowResume) return Promise.reject(new Error('gesture required'));
    this.transition('running'); return Promise.resolve();
  });
  close = vi.fn(async () => { this.transition('closed'); });
  constructor() { super(); ContextFixture.instances.push(this); }
  transition(state: string) { this.state = state; this.dispatchEvent(new Event('statechange')); }
  createGain() { return new NodeFixture(); }
  createDynamicsCompressor() { return new NodeFixture(); }
  createWaveShaper() { return new NodeFixture(); }
  createBuffer(_channels: number, length: number, rate: number) {
    const pcm = new Float32Array(length);
    return { duration: length / rate, getChannelData: () => pcm };
  }
  createBufferSource() { const node = new NodeFixture(); this.sources.push(node); return node; }
}
class MediaFixture extends EventTarget {
  src = ''; loop = false; preload = ''; paused = true; muted = false; volume = 1;
  style = { cssText: '' }; attributes = new Map<string, string>(); removed = false;
  play = vi.fn((): Promise<void> => { calls.push('media.play'); this.paused = false; return Promise.resolve(); });
  pause = vi.fn(() => { this.paused = true; this.dispatchEvent(new Event('pause')); });
  load = vi.fn();
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  removeAttribute(key: string) { if (key === 'src') this.src = ''; this.attributes.delete(key); }
  remove() { this.removed = true; }
}
let calls: string[];
let doc: EventTarget & { hidden: boolean; body: { append: ReturnType<typeof vi.fn> }; createElement: ReturnType<typeof vi.fn> };
let win: EventTarget & { AudioContext: typeof ContextFixture };
let media: MediaFixture[];
let audio: KaijuAudio | undefined;
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  calls = []; media = []; ContextFixture.instances = [];
  doc = Object.assign(new EventTarget(), { hidden: false, body: { append: vi.fn() }, createElement: vi.fn((tag: string) => {
    expect(tag).toBe('audio'); const node = new MediaFixture(); media.push(node); return node;
  }) });
  win = Object.assign(new EventTarget(), { AudioContext: ContextFixture });
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win); vi.stubGlobal('navigator', {});
});
afterEach(async () => { audio?.dispose(); audio = undefined; await flush(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('phone audio unlock and recovery', () => {
  it('public unlock invokes resume and media.play synchronously, and never awaits media before music', async () => {
    audio = createAudio(); audio.music('lobby');
    const promise = audio.unlock();
    const context = ContextFixture.instances[0];
    // These assertions run before any microtask: adding an await before native resume breaks this test.
    expect(context.resume).toHaveBeenCalledOnce();
    expect(media[0].play).toHaveBeenCalledOnce();
    expect(calls).toEqual(['resume', 'media.play']);
    await promise;
    expect(audio.state).toBe('running'); expect(audio.musicPlaying).toBe(true);
    expect(context.sources.filter(source => source.loop)).toHaveLength(1);
  });
  it('uses audioSession playback when available and restores only its own category on dispose', async () => {
    const session = { type: 'auto' };
    vi.stubGlobal('navigator', { audioSession: session });
    audio = createAudio(); const pending = audio.unlock();
    expect(session.type).toBe('playback');
    expect(ContextFixture.instances[0].resume).toHaveBeenCalledOnce();
    expect(media).toHaveLength(0);
    await pending;
    expect(readAudioDebugStatus().session).toBe('playback');
    audio.dispose(); expect(session.type).toBe('auto');
  });
  it('falls back to a genuinely silent inline WAV loop when the session API is absent or throws', async () => {
    vi.stubGlobal('navigator', { audioSession: { get type() { return 'auto'; }, set type(_value: string) { throw new Error('read-only'); } } });
    audio = createAudio(); await audio.unlock();
    const node = media[0];
    expect(node.loop).toBe(true); expect(node.muted).toBe(false); expect(node.volume).toBe(1);
    expect(node.attributes.has('playsinline')).toBe(true);
    const wav = Buffer.from(node.src.split(',')[1], 'base64');
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.subarray(44).every(sample => sample === 0)).toBe(true);
    expect(readAudioDebugStatus()).toMatchObject({ session: 'media', state: 'running', needsGesture: false });
  });
  it('retries blocked media in a later touch gesture even while WebAudio is already running', async () => {
    const original = doc.createElement;
    doc.createElement = vi.fn((tag: string) => {
      const node = (original.getMockImplementation() as (tag: string) => MediaFixture)(tag);
      node.play.mockRejectedValueOnce(new Error('autoplay denied'));
      return node;
    });
    audio = createAudio(); await audio.unlock(); await flush();
    expect(readAudioDebugStatus().needsGesture).toBe(true);
    doc.dispatchEvent(new Event('touchend')); await flush();
    expect(media[0].play).toHaveBeenCalledTimes(2);
    expect(readAudioDebugStatus().needsGesture).toBe(false);
  });
  it('visibilitychange and pageshow resume an existing context and retain one music loop', async () => {
    audio = createAudio(); audio.music('lobby'); await audio.unlock();
    const context = ContextFixture.instances[0];
    for (const event of ['visibilitychange', 'pageshow']) {
      doc.hidden = true; context.transition('suspended');
      const before = context.resume.mock.calls.length;
      expect(audio.state).toBe('suspended');
      doc.hidden = false;
      (event === 'pageshow' ? win : doc).dispatchEvent(new Event(event)); await flush();
      expect(context.resume.mock.calls.length).toBeGreaterThan(before);
      expect(audio.state).toBe('running'); expect(audio.musicPlaying).toBe(true);
    }
    expect(context.sources.filter(source => source.loop)).toHaveLength(1);
    expect(ContextFixture.instances).toHaveLength(1);
  });
  it('interrupted/suspended states try once automatically, keep gestures armed, and avoid resume loops', async () => {
    audio = createAudio(); await audio.unlock();
    const context = ContextFixture.instances[0]; context.allowResume = false;
    context.transition('interrupted'); await flush();
    expect(audio.state).toBe('interrupted'); expect(readAudioDebugStatus().needsGesture).toBe(true);
    const attempts = context.resume.mock.calls.length;
    for (let i = 0; i < 10; i++) context.transition('interrupted');
    await flush(); expect(context.resume.mock.calls.length).toBe(attempts);
    context.allowResume = true; doc.dispatchEvent(new Event('pointerup')); await flush();
    expect(audio.state).toBe('running');
    const runningAttempts = context.resume.mock.calls.length;
    doc.dispatchEvent(new Event('click')); // engine retry listeners disarm after recovery
    expect(context.resume.mock.calls.length).toBe(runningAttempts);
    context.transition('suspended'); await flush();
    expect(audio.state).toBe('running');
  });
  it('a pending resume promise does not prevent a fresh synchronous resume in the activating tap', async () => {
    audio = createAudio(); await audio.unlock();
    const context = ContextFixture.instances[0];
    context.resume.mockImplementationOnce(() => new Promise(() => {}));
    context.transition('suspended');
    const before = context.resume.mock.calls.length;
    doc.dispatchEvent(new Event('touchend'));
    expect(context.resume.mock.calls.length).toBeGreaterThan(before);
    await flush(); expect(audio.state).toBe('running');
  });
  it('mute pauses silent media, unmute restarts it, and dispose removes recovery listeners and media', async () => {
    audio = createAudio(); await audio.unlock();
    const context = ContextFixture.instances[0];
    audio.setMuted(true); expect(media[0].paused).toBe(true);
    audio.setMuted(false); await flush(); expect(media[0].paused).toBe(false);
    audio.dispose();
    expect(media[0].removed).toBe(true); expect(media[0].src).toBe('');
    expect(context.close).toHaveBeenCalledOnce(); expect(audio.state).toBe('closed');
    const callsBefore = context.resume.mock.calls.length;
    doc.dispatchEvent(new Event('touchend')); doc.dispatchEvent(new Event('visibilitychange')); win.dispatchEvent(new Event('pageshow'));
    expect(context.resume.mock.calls.length).toBe(callsBefore);
  });
});
