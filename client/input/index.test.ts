import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInput, createInputDebugPanel, vibrate, requestMotionPermission, getMotionPermissionState } from './index';
import type { InputController } from './index';
import type { MotionProfile } from '../../shared/types';

// Small browser fixture: no jsdom dependency and no actual sensor/device claims.
class ElementFixture extends EventTarget {
  className = '';
  textContent = '';
  type = '';
  style: Record<string, string> = { touchAction: 'pan-x' };
  children: ElementFixture[] = [];
  parent: ElementFixture | null = null;
  attributes = new Map<string, string>();
  removed = false;
  append(...elements: ElementFixture[]) {
    for (const el of elements) { el.parent = this; this.children.push(el); }
  }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 300 }; }
  closest(selectors: string): ElementFixture | null {
    if (selectors.split(',').some(s => {
      const selector = s.trim();
      return selector.startsWith('.') ? this.className.split(' ').includes(selector.slice(1))
        : selector === this.attributes.get('tag') || selector === '[contenteditable="true"]' && this.attributes.get('contenteditable') === 'true';
    })) return this;
    return this.parent?.closest(selectors) ?? null;
  }
  remove() {
    this.removed = true;
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
  }
}

function emit(target: EventTarget, type: string, fields: Record<string, unknown> = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
  return event;
}

let win: EventTarget & Record<string, any>;
let doc: EventTarget & Record<string, any>;
let canvas: ElementFixture;
let time: number;
let controller: InputController | undefined;

function start(motionProfile?: MotionProfile) {
  controller = createInput({ canvas: canvas as unknown as HTMLCanvasElement,
    motionProfile,
    toArena: (x, y) => [x / 2, y / 2], getSelf: () => ({ x: 10, y: 20 }) });
  return controller;
}
function mobile(requestPermission?: () => Promise<string>) {
  win.matchMedia = () => ({ matches: true });
  win.DeviceMotionEvent = requestPermission ? { requestPermission } : {};
}
function advance(ms: number) { time += ms; vi.advanceTimersByTime(ms); }
function motion(x = 0, y = 0, z = 0) { emit(win, 'devicemotion', { acceleration: { x, y, z } }); }
function pointer(target: EventTarget, type: string, id: number, fields: Record<string, unknown> = {}) {
  return emit(target, type, { pointerType: 'touch', pointerId: id, clientX: 0, clientY: 0, ...fields });
}

beforeEach(() => {
  vi.useFakeTimers();
  time = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  const orientation = Object.assign(new EventTarget(), { angle: 0 });
  win = Object.assign(new EventTarget(), {
    matchMedia: () => ({ matches: false }), screen: { orientation },
    setTimeout, clearTimeout, setInterval, clearInterval,
  });
  doc = Object.assign(new EventTarget(), {
    hidden: false, body: new ElementFixture(),
    createElement: (tag: string) => {
      const el = new ElementFixture();
      el.attributes.set('tag', tag);
      return el;
    },
  });
  canvas = new ElementFixture();
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', { maxTouchPoints: 0, vibrate: vi.fn(() => true) });
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); } });
});
afterEach(() => {
  controller?.dispose();
  controller = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('desktop input', () => {
  it('normalizes diagonal movement and consumes keyboard action edges once per press', () => {
    const input = start();
    expect(input.mode).toBe('keyboard');
    expect(input.needsPermission).toBe(false);
    emit(win, 'keydown', { code: 'KeyW' });
    emit(win, 'keydown', { code: 'ArrowRight' });
    emit(win, 'keydown', { code: 'Space' });
    emit(win, 'keydown', { code: 'KeyE' });
    emit(win, 'keydown', { code: 'KeyJ' });
    const first = input.sample();
    expect(first.move[0]).toBeCloseTo(Math.SQRT1_2);
    expect(first.move[1]).toBeCloseTo(-Math.SQRT1_2);
    expect(first).toMatchObject({ seq: 1, dash: true, skill: true, fire: true, aim: null });
    emit(win, 'keydown', { code: 'Space', repeat: true });
    expect(input.sample()).toMatchObject({ seq: 2, dash: false, skill: false, fire: true });
    emit(win, 'keyup', { code: 'Space' });
    emit(win, 'keydown', { code: 'Space' });
    expect(input.sample().dash).toBe(true);
  });
  it('maps all dash/skill aliases and ignores editable elements', () => {
    const input = start();
    for (const code of ['KeyK', 'ShiftLeft', 'ShiftRight']) {
      emit(win, 'keydown', { code });
      expect(input.sample().dash).toBe(true);
      emit(win, 'keyup', { code });
    }
    emit(win, 'keydown', { code: 'KeyL' });
    expect(input.sample().skill).toBe(true);
    const field = doc.createElement('input');
    emit(win, 'keydown', { code: 'KeyJ', target: field });
    expect(input.sample().fire).toBe(false);
  });
  it('aims from self in arena coordinates and returns to auto-aim after 2 seconds', () => {
    const input = start();
    emit(canvas, 'mousemove', { clientX: 80, clientY: 120 });
    expect(input.sample().aim).toEqual([0.6, 0.8]);
    advance(2001);
    expect(input.sample().aim).toBeNull();
    emit(canvas, 'mousemove', { clientX: 20, clientY: 40 });
    expect(input.sample().aim).toBeNull();
  });
  it('supports LMB fire and RMB skill together, with one skill per press', () => {
    const input = start();
    emit(canvas, 'mousedown', { button: 0, clientX: 80, clientY: 120 });
    emit(canvas, 'mousedown', { button: 2, clientX: 80, clientY: 120 });
    expect(input.sample()).toMatchObject({ fire: true, skill: true, aim: [0.6, 0.8] });
    emit(canvas, 'mousedown', { button: 2 });
    expect(input.sample().skill).toBe(false);
    emit(win, 'mouseup', { button: 2 });
    emit(canvas, 'mousedown', { button: 2 });
    expect(input.sample().skill).toBe(true);
    emit(win, 'mouseup', { button: 0 });
    expect(input.sample().fire).toBe(false);
  });
  it('clears held actions on blur, hidden document, and dispose', () => {
    const input = start();
    emit(win, 'keydown', { code: 'KeyJ' });
    emit(win, 'keydown', { code: 'KeyW' });
    emit(win, 'blur');
    expect(input.sample()).toMatchObject({ fire: false, move: [0, 0] });
    emit(win, 'keydown', { code: 'KeyJ' });
    doc.hidden = true;
    emit(doc, 'visibilitychange');
    expect(input.sample().fire).toBe(false);
    expect(canvas.style.touchAction).toBe('none');
    input.dispose();
    expect(canvas.style.touchAction).toBe('pan-x');
    emit(win, 'keydown', { code: 'KeyW' });
    emit(win, 'keydown', { code: 'Space' });
    expect(input.sample()).toMatchObject({ move: [0, 0], dash: false });
  });
  it('keeps fine-pointer computers with a sensor API in keyboard mode', () => {
    win.DeviceMotionEvent = {};
    expect(start().mode).toBe('keyboard');
  });
});

describe('motion-v3 permissions and live sensors', () => {
  const orientation = (beta: number | null, gamma: number | null, type = 'deviceorientation') => emit(win, type, { beta, gamma });
  const neutral = (beta = 0, gamma = 0, type = 'deviceorientation') => {
    for (let i = 0; i < 4; i++) { orientation(beta, gamma, type); advance(100); }
  };
  it('calls BOTH iOS permission requests synchronously on the original first tap', async () => {
    const requestMotion = vi.fn(async () => 'granted');
    const requestOrientation = vi.fn(async () => 'granted');
    mobile(requestMotion);
    win.DeviceOrientationEvent = { requestPermission: requestOrientation };
    const input = start();
    expect(input.needsPermission).toBe(true);
    // iOS refuses permission requests from pointerdown/touchstart without showing a prompt.
    pointer(win, 'pointerdown', 1);
    expect(requestMotion).not.toHaveBeenCalled();
    win.dispatchEvent(Object.assign(new Event('click'), { pointerType: 'touch' }));
    expect(requestMotion).toHaveBeenCalledOnce();
    expect(requestOrientation).toHaveBeenCalledOnce();
    expect(await input.requestPermission()).toBe(true);
    pointer(win, 'pointerup', 1);
    expect(input.sample().fire).toBe(false); // defer until double-tap is ruled out
    advance(300); expect(input.sample().fire).toBe(true);
    neutral();
    advance(601); expect(input.sample().fire).toBe(false);
    expect(input.mode).toBe('motion');
    expect(input.sensorStatus).toBe('on');
  });
  it('touchend requests synchronously, touchstart/down never request, and its follow-up click is deduplicated', async () => {
    const request = vi.fn(async () => 'denied'); mobile(request); const input = start();
    pointer(win, 'pointerdown', 1); emit(win, 'touchstart', { changedTouches: [{}] });
    expect(request).not.toHaveBeenCalled();
    emit(win, 'touchend', { changedTouches: [{}] }); expect(request).toHaveBeenCalledOnce();
    expect(await input.requestPermission()).toBe(false); // settle the shared native attempt
    emit(win, 'click'); expect(request).toHaveBeenCalledOnce();
    expect(input.needsPermission).toBe(true); expect(input.sensorStatus).toBe('off');
    advance(600); emit(win, 'click'); expect(request).toHaveBeenCalledTimes(2);
  });
  it('never reports on until both native grants resolve AND a subsequent valid sensor event arrives', async () => {
    let motionGranted!: (result: string) => void, orientationGranted!: (result: string) => void;
    mobile(() => new Promise(r => { motionGranted = r; }));
    win.DeviceOrientationEvent = { requestPermission: () => new Promise(r => { orientationGranted = r; }) };
    const input = start(); const permission = input.requestPermission();
    motion(15); orientation(45, 0);
    expect(input.sensorStatus).toBe('waiting'); expect(input.sample().fire).toBe(false);
    motionGranted('granted'); await Promise.resolve();
    orientation(45, 0); expect(input.sensorStatus).toBe('waiting');
    orientationGranted('granted'); expect(await permission).toBe(true);
    expect(input.sensorStatus).toBe('waiting'); expect(input.needsPermission).toBe(false);
    orientation(null, null); expect(input.sensorStatus).toBe('waiting');
    orientation(45, 0); expect(input.sensorStatus).toBe('on');
    expect(await input.requestPermission()).toBe(true); expect(input.sensorStatus).toBe('on');
  });
  it.each(['denied', 'reject', 'throw'] as const)('native %s remains retryable on the next activating tap', async failure => {
    let first = true;
    const request = vi.fn(() => {
      if (!first) return Promise.resolve('granted');
      first = false;
      if (failure === 'throw') throw new Error('not activated');
      return failure === 'reject' ? Promise.reject(new Error('not activated')) : Promise.resolve('denied');
    });
    mobile(request); const input = start();
    expect(await input.requestPermission()).toBe(false);
    expect(input.needsPermission).toBe(true); expect(input.sensorStatus).toBe('off');
    motion(30); orientation(45, 0); expect(input.sensorStatus).toBe('off');
    expect(await input.requestPermission()).toBe(true); expect(request).toHaveBeenCalledTimes(2);
    expect(input.sensorStatus).toBe('waiting'); orientation(45, 0); expect(input.sensorStatus).toBe('on');
  });
  it('one granted API and one denied API never enables motion', async () => {
    mobile(async () => 'granted'); win.DeviceOrientationEvent = { requestPermission: async () => 'denied' };
    const input = start(); expect(await input.requestPermission()).toBe(false);
    motion(30); orientation(45, 0); expect(input.sensorStatus).toBe('off'); expect(input.needsPermission).toBe(true);
  });
  it('also requests permission on orientation-only iOS browsers', async () => {
    mobile();
    win.DeviceOrientationEvent = { requestPermission: vi.fn(async () => 'granted') };
    const input = start();
    expect(input.needsPermission).toBe(true);
    expect(await input.requestPermission()).toBe(true);
    neutral(0, 0, 'deviceorientationabsolute');
    expect(input.sensorStatus).toBe('on');
  });
  it('falls back on denial, synchronous throws, rejected promises, or no usable sensors in 1.5s', async () => {
    for (const request of [async () => 'denied', () => { throw new Error('denied'); }, async () => { throw new Error('denied'); }]) {
      mobile(request);
      const input = start();
      expect(await input.requestPermission()).toBe(false);
      expect(input.mode).toBe('touch');
      expect(input.sensorStatus).toBe('off');
      input.dispose();
    }
    mobile(async () => 'granted');
    const input = start();
    await input.requestPermission();
    orientation(null, null);
    emit(win, 'devicemotion', { acceleration: { x: null, y: null, z: null } });
    advance(1499);
    expect(input.sensorStatus).toBe('waiting');
    advance(1);
    expect(input.mode).toBe('touch');
    expect(input.sensorStatus).toBe('off');
  });
  it('listens without constructor feature detection, and recovers from delayed sensors after fallback', () => {
    win.matchMedia = () => ({ matches: true });
    const input = start();
    expect(input.mode).toBe('motion');
    advance(1500);
    expect(input.mode).toBe('touch');
    neutral(0, 0, 'deviceorientationabsolute');
    expect(input.mode).toBe('motion');
    expect(input.sensorStatus).toBe('on');
    orientation(0, 20, 'deviceorientationabsolute'); advance(100);
    expect(input.sample().move[0]).toBeGreaterThan(0.7);
  });
  it('does not request permission until a gesture or mount UI after disposal', async () => {
    let resolve!: (result: string) => void;
    const request = vi.fn(() => new Promise<string>(r => { resolve = r; }));
    mobile(request);
    const input = start(); advance(2000);
    expect(request).not.toHaveBeenCalled();
    const result = input.requestPermission(); input.dispose(); resolve('granted');
    expect(await result).toBe(false);
    advance(2000);
    expect(doc.body.children).toHaveLength(0);
  });
  it('moves relative to horizontal and never makes the held upright pose a zero', () => {
    mobile(); const input = start();
    orientation(45, 0); expect(input.sample().move[1]).toBeCloseTo(1);
    for (let i = 0; i < 8; i++) { advance(30); orientation(0, 0); }
    expect(Math.hypot(...input.sample().move)).toBeLessThan(0.02);
    input.calibrate(); orientation(15, 0); expect(input.sample().move[1]).toBeCloseTo(1);
    win.screen.orientation.angle = 90; emit(win.screen.orientation, 'change');
    orientation(15, 0); expect(input.sample().move[0]).toBeCloseTo(1);
  });
  it('rejects swing-induced steering from rest, then resumes gravity-relative movement', () => {
    mobile(); const input = start(); orientation(0, 0); input.sample(); motion(-15, 0, 0);
    orientation(80, 60); advance(100);
    expect(input.sample()).toMatchObject({ move: [0, 0], fire: true, dash: false, skill: false, aim: null });
    advance(30); orientation(0, 15);
    expect(input.sample().move[0]).toBeGreaterThan(0.8);
    advance(500); expect(input.sample().fire).toBe(false);
  });
  it('keeps moving while repeated swings attack and rejects their steering noise', () => {
    mobile(); const input = start(); orientation(0, 15);
    expect(input.sample().move[0]).toBeCloseTo(1);
    for (let i = 0; i < 6; i++) {
      motion(i % 2 ? 15 : -15, 0, 0);
      orientation(80, -60); // swing noise must not reverse or stop the established movement
      expect(input.sample()).toMatchObject({ fire: true, dash: false, skill: false });
      expect(input.sample().move[0]).toBeCloseTo(1);
      expect(input.sample().move[1]).toBeCloseTo(0);
      advance(210);
    }
    orientation(0, -15);
    expect(input.sample().move[0]).toBeLessThan(-0.8);
  });
  it('allows steering changes throughout a tap attack burst', () => {
    mobile(); const input = start(); orientation(0, 15);
    pointer(win, 'pointerdown', 1, { target: canvas }); advance(40);
    pointer(win, 'pointerup', 1, { target: canvas }); advance(320);
    expect(input.sample().fire).toBe(true);
    expect(input.sample().move[0]).toBeGreaterThan(0.8);
    orientation(0, -15);
    expect(input.sample().fire).toBe(true);
    expect(input.sample().move[0]).toBeLessThan(-0.8);
  });
  it('uses gravity-only sensors for tilt and filters gravity out of swing recognition', () => {
    mobile(); const input = start();
    const inclusive = (x: number, y: number, z: number) => emit(win, 'devicemotion', { accelerationIncludingGravity: { x, y, z } });
    for (let i = 0; i < 4; i++) { inclusive(0, 0, 9.81); advance(100); }
    expect(input.sample().fire).toBe(false);
    for (let i = 0; i < 25; i++) { inclusive(-4.15, 0, 8.89); advance(20); input.sample(); }
    expect(input.sample().move[0]).toBeGreaterThan(0.6);
    inclusive(-4.15, 0, 30);
    expect(input.sample().fire).toBe(true);
  });
  it('has no drawn controls; long-press fires skill once without any tap attack', () => {
    mobile(); const input = start(); neutral();
    const overlay = doc.body.children[0];
    expect(overlay.children).toHaveLength(1); // charging feedback only, no button or joystick
    expect(overlay.children[0].attributes.get('data-testid')).toBe('input-charge');
    pointer(win, 'pointerdown', 1, { target: canvas }); advance(549);
    expect(input.sample()).toMatchObject({ fire: false, dash: false, skill: false });
    advance(20);
    expect(input.sample()).toMatchObject({ fire: false, dash: false, skill: true });
    advance(200); expect(input.sample()).toMatchObject({ fire: false, skill: false });
    pointer(win, 'pointerup', 1); advance(400);
    expect(input.sample()).toMatchObject({ fire: false, skill: false });
  });
});

describe('inclusive profile integration', () => {
  it('tapping settings/profile UI cannot prompt for sensors before choosing tap-only', () => {
    const request = vi.fn(async () => 'granted');
    mobile(request);
    const input = start();
    const button = doc.createElement('button');
    pointer(win, 'pointerdown', 1, { target: button });
    expect(request).not.toHaveBeenCalled();
    input.setMotionProfile('tap-only');
    expect(input.needsPermission).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it('persists seated selection across controller lifecycles and uses a small flick', () => {
    mobile();
    let input = start();
    input.setMotionProfile('seated');
    input.dispose();
    input = start();
    expect(input.motionProfile).toBe('seated');
    motion(7, 0, 0);
    expect(input.sample()).toMatchObject({ fire: true, dash: false, skill: false, source: 'motion' });
  });
  it('tap-only uses invisible drag, never requests sensors, and ignores late events', async () => {
    const request = vi.fn(async () => 'granted');
    mobile(request);
    const input = start('tap-only');
    expect(input.mode).toBe('touch');
    expect(input.needsPermission).toBe(false);
    expect(await input.requestPermission()).toBe(false);
    emit(win, 'deviceorientation', { beta: 60, gamma: 40 }); motion(50, 50, 50);
    expect(input.sample()).toMatchObject({ move: [0, 0], fire: false, source: 'touch' });
    expect(doc.body.children[0].attributes.get('data-mode')).toBe('touch');
    pointer(win, 'pointerdown', 7, { target: canvas }); pointer(win, 'pointerup', 7);
    advance(300); expect(input.sample().fire).toBe(true);
    advance(601); expect(input.sample().fire).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it('switches live profiles without leaking sensor attacks and can re-enable permission', async () => {
    const request = vi.fn(async () => 'granted');
    mobile(request);
    const input = start('seated');
    await input.requestPermission(); motion(7, 0, 0);
    expect(input.sample().fire).toBe(true);
    input.setMotionProfile('tap-only'); motion(50, 0, 0);
    expect(input.sample()).toMatchObject({ fire: false, move: [0, 0], source: 'touch' });
    input.setMotionProfile('standard');
    expect(input.mode).toBe('motion');
    for (let i = 0; i < 4; i++) { emit(win, 'deviceorientation', { beta: 45, gamma: 0 }); advance(100); }
    motion(7, 0, 0);
    expect(input.sample().fire).toBe(false);
  });
  it('a pending native permission result cannot override a switch to tap-only', async () => {
    let resolve!: (result: string) => void;
    mobile(() => new Promise<string>(r => { resolve = r; }));
    const input = start();
    const permission = input.requestPermission();
    input.setMotionProfile('tap-only'); resolve('granted');
    expect(await permission).toBe(false);
    motion(50, 0, 0); advance(2000);
    expect(input.mode).toBe('touch');
    expect(input.sensorStatus).toBe('off');
    expect(input.needsPermission).toBe(false);
  });
});

describe('automatic traces and horizontal sensitivity', () => {
  it('uploads the first phone capture without a trace query flag', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 201 })));
    mobile(); const input = start();
    emit(win, 'deviceorientation', { beta: 0, gamma: 7.5 }); input.sample();
    time = 20_000; await vi.advanceTimersByTimeAsync(20_000);
    expect(fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.source).toBe('fight'); expect(body.samples.some((s: any) => s.type === 'orientation')).toBe(true);
    expect(body.samples.some((s: any) => s.type === 'input' && Math.abs(s.move[0] - 0.5) < 0.01)).toBe(true);
  });
  it('uses upright portrait coordinates on phones even if WebKit reports a stale90° screen angle', () => {
    mobile(); win.innerWidth = 390; win.innerHeight = 844; win.screen.orientation.angle = 90;
    const input = start(); emit(win, 'deviceorientation', { beta: 0, gamma: 7.5 });
    expect(input.sample().move[0]).toBeCloseTo(0.5); expect(input.sample().move[1]).toBeCloseTo(0);
  });
  it('defaults to15°, persists fast10°, and ignores a bad legacy stored movement zero', () => {
    mobile(); let input = start(); input.setProfile({ neutral: [45, 0], fullSpeed: 40 });
    emit(win, 'deviceorientation', { beta: 0, gamma: 7.5 });
    expect(input.sample().move[0]).toBeCloseTo(0.5);
    input.setTiltSensitivity('fast'); input.dispose(); input = start();
    expect(input.tiltSensitivity).toBe('fast'); emit(win, 'deviceorientation', { beta: 0, gamma: 7.5 });
    expect(input.sample().move[0]).toBeCloseTo(0.75);
  });
});

describe('page permission handoff', () => {
  it('shares an actual lobby grant and sensor readiness with game controllers on the same page', async () => {
    const request = vi.fn(async () => 'granted'); mobile(request);
    await requestMotionPermission(); emit(win, 'deviceorientation', { beta: 45, gamma: 0 });
    expect(getMotionPermissionState().ready).toBe(true);
    let input = start(); expect(input.needsPermission).toBe(false); expect(input.sensorStatus).toBe('on');
    input.dispose(); input = start();
    expect(input.needsPermission).toBe(false); expect(input.sensorStatus).toBe('on'); expect(request).toHaveBeenCalledOnce();
  });
});

describe('v3 controller integration', () => {
  it('freezes movement while a fast gyro gesture is still accumulating', () => {
    mobile(); const input = start(); input.setProfile({ neutral: [0, 45] });
    emit(win, 'devicemotion', { acceleration: { x: 0, y: 0, z: 0 }, rotationRate: { alpha: 300, beta: 0, gamma: 0 } });
    emit(win, 'deviceorientation', { beta: 80, gamma: 50 }); advance(80);
    expect(input.sample()).toMatchObject({ move: [0, 0], dash: false, skill: false });
  });
  it('persists per-player thresholds/neutral and training exposes bounded recorder APIs', () => {
    mobile(); let input = start();
    input.setProfile({ swingThreshold: 5, twistThreshold: 90, neutral: [0, 45], fullSpeed: 9 });
    input.dispose(); input = start();
    expect(input.profile).toMatchObject({ swingThreshold: 5, twistThreshold: 90, neutral: [0, 45], fullSpeed: 9 });
    motion(5.5); expect(input.sample().fire).toBe(true);
    input.calibration.startStep('neutral');
    for (let i = 0; i < 10; i++) { emit(win, 'deviceorientation', { beta: 45, gamma: 1 }); advance(40); }
    expect(input.calibration.meter()).toMatchObject({ step: 'neutral', ready: true });
    expect(input.calibration.result().neutral).toBeNull();
    // Don't upload the component fixture's training stream to a real server.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
    input.calibration.stop();
  });
  it('processes gyro-only events and reports lost sensors, then recovers late readings', () => {
    mobile(); const input = start();
    const gyro = (alpha: number) => emit(win, 'devicemotion', { rotationRate: { alpha, beta: 0, gamma: 0 }, acceleration: null });
    gyro(0);
    for (let i = 0; i < 12; i++) { advance(30); gyro(800); }
    expect(input.sample()).toMatchObject({ skill: true, dash: false, fire: false });
    expect(input.lastGesture?.via).toBe('spin');
    advance(2200); expect(input.sensorStatus).toBe('off');
    gyro(0); expect(input.sensorStatus).toBe('on'); expect(input.mode).toBe('motion');
  });
});

describe('touch fallback and helpers', () => {
  it('provides invisible full-screen drag and cancels gesture actions on movement', () => {
    mobile(); const input = start(); advance(1500);
    expect(input.mode).toBe('touch');
    pointer(win, 'pointerdown', 1, { clientX: 100, clientY: 100, target: canvas });
    pointer(win, 'pointermove', 1, { clientX: 144, clientY: 100 });
    expect(input.sample().move).toEqual([1, 0]);
    advance(800); expect(input.sample()).toMatchObject({ skill: false, dash: false, fire: false });
    pointer(win, 'pointerup', 1); advance(400);
    expect(input.sample()).toMatchObject({ fire: false, move: [0, 0] });
    input.dispose(); expect(doc.body.children).toHaveLength(0);
  });
  it('double-taps dash once without fire, excludes settings, and clears pending taps on blur', () => {
    mobile(); const input = start(); advance(1500);
    const button = doc.createElement('button');
    pointer(win, 'pointerdown', 2, { target: button }); pointer(win, 'pointerup', 2); advance(400);
    expect(input.sample().fire).toBe(false);
    for (let id = 3; id <= 4; id++) {
      pointer(win, 'pointerdown', id, { target: canvas }); advance(50); pointer(win, 'pointerup', id); advance(70);
    }
    expect(input.sample()).toMatchObject({ dash: true, fire: false, skill: false });
    expect(input.sample().dash).toBe(false);
    advance(400); expect(input.sample().fire).toBe(false);
    pointer(win, 'pointerdown', 5, { target: canvas }); pointer(win, 'pointerup', 5);
    emit(win, 'blur'); advance(400); expect(input.sample().fire).toBe(false);
  });
  it('exports a removable live debug panel and best-effort vibration', () => {
    start();
    const panel = createInputDebugPanel();
    expect(panel.textContent).toContain('INPUT keyboard');
    panel.dispose();
    expect((panel as unknown as ElementFixture).removed).toBe(true);
    expect(vibrate([20, 30, 20])).toBe(true);
    expect(navigator.vibrate).toHaveBeenCalledWith([20, 30, 20]);
    vi.stubGlobal('navigator', {});
    expect(vibrate(20)).toBe(false);
  });
});
