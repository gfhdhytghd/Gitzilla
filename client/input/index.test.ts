import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInput, createInputDebugPanel, vibrate, requestMotionPermission, getMotionPermissionState } from './index';
import type { InputController } from './index';
import ipadTraces from './fixtures/real-ipad-orientation.json';
import { realTraces } from './real-traces';
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
function flick(x = 0, y = 0, z = 0) { motion(x,y,z); advance(30); motion(0,0,0); }
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
  it('clears held gameplay input while settings are open and resumes cleanly', () => {
    const input = start();
    emit(win, 'keydown', {code:'KeyD'}); emit(win, 'keydown', {code:'KeyJ'});
    expect(input.sample().fire).toBe(true);
    emit(win, 'gitzilla:settings', {detail:{open:true}});
    emit(win, 'keydown', {code:'KeyE'});
    expect(input.sample()).toMatchObject({move:[0,0],fire:false,dash:false,skill:false});
    emit(win, 'gitzilla:settings', {detail:{open:false}});
    expect(input.sample()).toMatchObject({move:[0,0],fire:false,skill:false});
    emit(win, 'keydown', {code:'KeyD'}); expect(input.sample().move).toEqual([1,0]);
  });
  it('applies profile changes from settings without recursive preference events', () => {
    mobile(); const input = start('standard');
    localStorage.setItem('kaiju.motionProfile','tap-only'); emit(win,'kaiju:motion-profile');
    expect(input.motionProfile).toBe('tap-only'); expect(input.mode).toBe('touch');
    localStorage.setItem('kaiju.motionProfile','standard'); emit(win,'kaiju:motion-profile');
    expect(input.motionProfile).toBe('standard'); expect(input.mode).toBe('motion');
  });
  it('applies completed settings training to an already running controller', () => {
    const input = start('standard');
    localStorage.setItem('kaiju.motionCalibration.v3', JSON.stringify({version:3,profile:'standard',thresholds:{swingThreshold:6,twistThreshold:150}}));
    emit(win,'kaiju:gesture-trained');
    expect(input.profile.swingThreshold).toBe(1.2); expect(input.profile.twistThreshold).toBe(180);
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
    expect(input.sample().fire).toBe(true); // motion taps no longer wait for double-tap
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
    mobile(); const input = start(); orientation(0, 0); input.sample(); flick(-15, 0, 0);
    orientation(80, 60); advance(100);
    expect(input.sample()).toMatchObject({ move: [0, 0], fire: true, dash: false, skill: false, aim: null });
    advance(30); orientation(0, 15);
    expect(input.sample().move[0]).toBeGreaterThan(0.8);
    advance(601); expect(input.sample().fire).toBe(false);
  });
  it('keeps moving while repeated swings attack and rejects their steering noise', () => {
    mobile(); const input = start(); orientation(0, 15);
    expect(input.sample().move[0]).toBeCloseTo(1);
    for (let i = 0; i < 6; i++) {
      flick(i % 2 ? 15 : -15, 0, 0);
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
    inclusive(-4.15, 0, 30); advance(30); inclusive(-4.15, 0, 8.89);
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
    flick(7, 0, 0);
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
    await input.requestPermission(); flick(7, 0, 0);
    expect(input.sample().fire).toBe(true);
    input.setMotionProfile('tap-only'); motion(50, 0, 0);
    expect(input.sample()).toMatchObject({ fire: false, move: [0, 0], source: 'touch' });
    input.setMotionProfile('standard');
    expect(input.mode).toBe('motion');
    for (let i = 0; i < 4; i++) { emit(win, 'deviceorientation', { beta: 45, gamma: 0 }); advance(100); }
    flick(1, 0, 0);
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
  it('uses Safari portrait angle over a stale modern90° angle', () => {
    mobile(); vi.stubGlobal('navigator',{maxTouchPoints:5,userAgent:'iPhone',platform:'iPhone'});win.orientation=0; win.innerWidth = 390; win.innerHeight = 844; win.screen.orientation.angle = 90;
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
  it('gyro rotation alone cannot steal steering or dash', () => {
    mobile(); const input = start(); input.setProfile({ neutral: [0, 45] });
    emit(win, 'devicemotion', { acceleration: { x: 0, y: 0, z: 0 }, rotationRate: { alpha: 300, beta: 0, gamma: 0 } });
    emit(win, 'deviceorientation', { beta: 0, gamma: 15 }); advance(80);
    expect(input.sample()).toMatchObject({ dash: false, skill: false });
    expect(input.sample().move[0]).toBeGreaterThan(0.8);
  });
  it('persists per-player thresholds/neutral and training exposes bounded recorder APIs', () => {
    mobile(); let input = start();
    input.setProfile({ swingThreshold: 1.5, twistThreshold: 90, neutral: [0, 45], fullSpeed: 9 });
    input.dispose(); input = start();
    expect(input.profile).toMatchObject({ swingThreshold: 1.5, twistThreshold: 90, neutral: [0, 45], fullSpeed: 9 });
    flick(5.5); expect(input.sample().fire).toBe(true);
    input.calibration.startStep('neutral');
    for (let i = 0; i < 10; i++) { emit(win, 'deviceorientation', { beta: 45, gamma: 1 }); advance(40); }
    expect(input.calibration.meter()).toMatchObject({ step: 'neutral', ready: true });
    expect(input.calibration.result().neutral).toBeNull();
    // Don't upload the component fixture's training stream to a real server.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
    input.calibration.stop();
  });
  it('routes translation circles to exactly one skill without attacks or dashes', () => {
    mobile(); const input = start(); const frames = [];
    for (let at=0;at<=1080;at+=30) {
      if(at) advance(30);
      const a=at/1000*Math.PI*2;
      emit(win,'devicemotion',{acceleration:{x:15*Math.cos(a),y:0,z:15*Math.sin(a)},rotationRate:{alpha:0,beta:0,gamma:0}});
      frames.push(input.sample());
    }
    expect(frames.filter(f=>f.skill)).toHaveLength(1);
    expect(frames.every(f=>!f.fire&&!f.dash)).toBe(true);
    expect(input.lastGesture?.via).toBe('spin');
  });
  it('processes gyro-only events and reports lost sensors, then recovers late readings', () => {
    mobile(); const input = start();
    const gyro = (alpha: number) => emit(win, 'devicemotion', { rotationRate: { alpha, beta: 0, gamma: 0 }, acceleration: null });
    gyro(0);
    for (let i = 0; i < 12; i++) { advance(30); gyro(800); }
    expect(input.sample()).toMatchObject({ skill: false, dash: false, fire: false });
    expect(input.lastGesture?.via).not.toBe('spin');
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

describe('real iOS trace controller regression (also detached pair surface)',()=>{
 it.each(realTraces.map((t,i)=>({trace:t,shouldAttack:[0,3,4,6,7].includes(i)})))('delivers real $trace.file sensor gestures through sample()',async({trace,shouldAttack})=>{
  mobile(async()=> 'granted');const input=start('standard');
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true})));
  await input.requestPermission();
  let attacks=0,dashes=0,skills=0;
  for(const s of trace.samples){
   const [at,kind,...rest]=s;const v=rest as number[];
   advance(Math.max(0,(at as number)-time));
   if(kind==='m')emit(win,'devicemotion',{acceleration:{x:v[0],y:v[1],z:v[2]},rotationRate:{alpha:v[3],beta:v[4],gamma:v[5]},accelerationIncludingGravity:{x:v[6],y:v[7],z:v[8]}});
   else emit(win,'deviceorientation',{beta:v[0],gamma:v[1]});
   const f=input.sample();attacks+=Number(f.fire);dashes+=Number(f.dash);skills+=Number(f.skill);
  }
  expect(attacks>0).toBe(shouldAttack);expect(skills).toBe(0);
  if(trace.file.startsWith('1792921441887'))expect(dashes).toBeGreaterThan(0);
 });
 it.each([[0,50,0,1],[0,-50,0,-1],[50,0,1,1],[-50,0,1,-1]])('exact50° beta%s gamma%s crosses without filter lag', (beta,gamma,axis,sign)=>{
  mobile();const input=start();emit(win,'deviceorientation',{beta:0,gamma:0});input.sample();advance(30);
  emit(win,'deviceorientation',{beta,gamma});const frame=input.sample();
  expect(frame.dash).toBe(true);expect(frame.move[axis]*sign).toBeCloseTo(1);
 });
 it('emits downhill dash once per excursion, re-arms below35° and preserves movement',()=>{
  mobile();const input=start();
  const pose=(beta:number,gamma:number,ms=300)=>{const frames=[];for(let n=0;n<ms;n+=30){advance(30);emit(win,'deviceorientation',{beta,gamma});frames.push(input.sample());}return frames;};
  pose(0,0);const first=pose(0,60);
  expect(first.filter(f=>f.dash)).toHaveLength(1);expect(first.find(f=>f.dash)?.move[0]).toBeGreaterThan(.99);
  expect(pose(0,60,900).some(f=>f.dash)).toBe(false);
  pose(0,30);const next=pose(-60,0);
  expect(next.filter(f=>f.dash)).toHaveLength(1);expect(next.find(f=>f.dash)?.move[1]).toBeLessThan(-.99);
  expect(pose(0,15).at(-1)?.move[0]).toBeGreaterThan(.9);
 });
});

describe('iPad screen-relative orientation regression',()=>{
 it.each(ipadTraces)('replays $file with Safari landscape angle instead of portrait viewport',async(trace)=>{
  win.matchMedia=()=>({matches:false});win.orientation=90;win.screen.orientation.angle=0;
  win.innerWidth=500;win.innerHeight=900;
  vi.stubGlobal('navigator',{platform:'MacIntel',userAgent:'Macintosh Safari',maxTouchPoints:5});
  const input=start('standard');vi.stubGlobal('fetch',vi.fn(async()=>({ok:true})));
  let nonzero=0;
  for(const [at,beta,gamma] of trace.samples){
   advance(Math.max(0,at-time));emit(win,'deviceorientation',{beta,gamma});
   const frame=input.sample();expect(frame.source).toBe('motion');
   if(Math.hypot(...frame.move)>.1)nonzero++;
  }
  expect(nonzero).toBeGreaterThan(500);
  // A recorded leftward sensor tilt represents the screen's bottom at90°.
  const down=trace.samples.find(([,b,g])=>g<-10&&Math.abs(b)<3)!;
  expect(down).toBeDefined();
  for(let n=0;n<15;n++){advance(30);emit(win,'deviceorientation',{beta:down[1],gamma:down[2]});input.sample();}
  const frame=input.sample();expect(frame.move[1]).toBeGreaterThan(.6);expect(Math.abs(frame.move[0])).toBeLessThan(.3);
 });
 it.each([0,90,180,270])('rotates the actual controller at%s° for both movement and50° dash',angle=>{
  win.matchMedia=()=>({matches:false});win.orientation=angle;win.screen.orientation.angle=0;
  win.innerWidth=500;win.innerHeight=900;
  vi.stubGlobal('navigator',{platform:'MacIntel',userAgent:'Macintosh Safari',maxTouchPoints:5});
  const input=start();
  const poses:[[number,number],[number,number],[number,number],[number,number]]=[[15,0],[0,-15],[-15,0],[0,15]];
  const [b,g]=poses[angle/90];emit(win,'deviceorientation',{beta:0,gamma:0});input.sample();
  for(let n=0;n<10;n++){advance(30);emit(win,'deviceorientation',{beta:b,gamma:g});input.sample();}
  expect(input.sample().move[1]).toBeGreaterThan(.99);
  advance(30);emit(win,'deviceorientation',{beta:b*50/15,gamma:g*50/15});const f=input.sample();
  expect(f.dash).toBe(true);expect(f.move[1]).toBeCloseTo(1);expect(f.move[0]).toBeCloseTo(0);
 });
});

const swipeCases=['iPhone','iPad'].flatMap(device=>[0,90,180,270].flatMap(angle=>
 [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]].map(([x,y])=>({device,angle,x,y}))));
describe('motion swipe direction and disambiguation',()=>{
 const enable=(device='iPad',angle=0)=>{
  win.orientation=angle;win.screen.orientation.angle=0;win.innerWidth=500;win.innerHeight=900;
  vi.stubGlobal('navigator',{platform:device==='iPad'?'MacIntel':'iPhone',userAgent:device==='iPad'?'Macintosh Safari':'iPhone',maxTouchPoints:5});
  const input=start();emit(win,'deviceorientation',{beta:0,gamma:0});input.sample();return input;
 };
 const swipe=(x=1,y=0,id=1)=>{
  pointer(win,'pointerdown',id,{target:canvas,clientX:100,clientY:100});advance(70);
  pointer(win,'pointermove',id,{clientX:100+x*35,clientY:100+y*35});advance(70);
  pointer(win,'pointerup',id,{clientX:100+x*70,clientY:100+y*70});
 };
 it.each(swipeCases)('$device@$angle° swipe($x,$y) follows screen coordinates once',({device,angle,x,y})=>{
  const input=enable(device,angle);swipe(x,y);
  const f=input.sample();expect(f).toMatchObject({dash:true,fire:false,skill:false});
  expect(f.move[0]).toBeCloseTo(x/Math.hypot(x,y));expect(f.move[1]).toBeCloseTo(y/Math.hypot(x,y));
  expect(input.lastGesture?.via).toBe('swipe');expect(input.sample().dash).toBe(false);
  advance(800);expect(input.sample().fire).toBe(false);
 });
 it('double-tap in motion is attacks only, and long-press remains skill only',()=>{
  const input=enable();
  for(const id of [1,2]){pointer(win,'pointerdown',id,{target:canvas});advance(60);pointer(win,'pointerup',id);expect(input.sample()).toMatchObject({fire:true,dash:false,skill:false});advance(60);}
  advance(650);pointer(win,'pointerdown',3,{target:canvas});advance(560);expect(input.sample()).toMatchObject({skill:true,dash:false,fire:false});
  pointer(win,'pointerup',3);advance(400);expect(input.sample()).toMatchObject({fire:false,skill:false,dash:false});
 });
 it('cancels two-finger swipes and recovers after every finger lifts',()=>{
  const input=enable();pointer(win,'pointerdown',1,{target:canvas,clientX:100,clientY:100});
  pointer(win,'pointerdown',2,{target:canvas,clientX:120,clientY:100});advance(100);
  pointer(win,'pointermove',1,{clientX:180,clientY:100});pointer(win,'pointerup',1,{clientX:180,clientY:100});pointer(win,'pointerup',2,{clientX:120,clientY:100});
  advance(700);expect(input.sample()).toMatchObject({dash:false,fire:false,skill:false});swipe(0,1,3);expect(input.sample().dash).toBe(true);
 });
 it('shares650ms between tilt and swipe; rejected swipe does not extend cooldown',()=>{
  const input=enable();emit(win,'deviceorientation',{beta:0,gamma:50});expect(input.sample().dash).toBe(true);
  emit(win,'deviceorientation',{beta:0,gamma:0});swipe();expect(input.sample().dash).toBe(false);
  advance(520);swipe(0,1,2);expect(input.sample().dash).toBe(true);
  emit(win,'deviceorientation',{beta:50,gamma:0});expect(input.sample().dash).toBe(false);
  emit(win,'deviceorientation',{beta:0,gamma:0});advance(660);emit(win,'deviceorientation',{beta:50,gamma:0});expect(input.sample().dash).toBe(true);
 });
 it.each(['tap-only','seated'] as const)('%s drag fallback keeps fast drags as movement and double-tap as dash',profile=>{
  mobile();const input=start(profile);advance(1600);expect(input.mode).toBe('touch');
  pointer(win,'pointerdown',1,{target:canvas,clientX:100,clientY:100});advance(70);pointer(win,'pointermove',1,{clientX:180,clientY:100});expect(input.sample().move[0]).toBe(1);
  pointer(win,'pointerup',1,{clientX:180,clientY:100});expect(input.sample()).toMatchObject({dash:false,fire:false});
  for(const id of [2,3]){advance(70);pointer(win,'pointerdown',id,{target:canvas});advance(60);pointer(win,'pointerup',id);}
  expect(input.sample()).toMatchObject({dash:true,fire:false});
 });
 it('counts swipe training without altering tilt or force thresholds',()=>{
  const input=enable();vi.stubGlobal('fetch',vi.fn(async()=>({ok:true})));const before=input.profile;
  input.calibration.startStep('dash');
  for(const id of [1,2,3]){swipe(1,0,id);input.sample();advance(700);}
  expect(input.calibration.meter()).toMatchObject({step:'dash',count:3,ready:true});
  expect(input.calibration.result()).toMatchObject({swingThreshold:before.swingThreshold,spinAngle:before.spinAngle,spinMagnitude:before.spinMagnitude,fullSpeed:before.fullSpeed,twistThreshold:before.twistThreshold});
 });
});
