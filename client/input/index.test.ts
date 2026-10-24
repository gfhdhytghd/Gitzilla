import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInput, createInputDebugPanel, vibrate } from './index';
import type { InputController } from './index';

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

function start() {
  controller = createInput({ canvas: canvas as unknown as HTMLCanvasElement,
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

describe('motion-v2 permissions and live sensors', () => {
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
    pointer(win, 'pointerdown', 1);
    expect(requestMotion).toHaveBeenCalledOnce();
    expect(requestOrientation).toHaveBeenCalledOnce();
    expect(await input.requestPermission()).toBe(true);
    pointer(win, 'pointerup', 1);
    expect(input.sample().fire).toBe(true); // even a zero-duration tap survives until a sample
    neutral();
    expect(input.sample().fire).toBe(false);
    advance(1500);
    expect(input.mode).toBe('motion');
    expect(input.sensorStatus).toBe('on');
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
  it('averages 300ms of neutral samples, and recalibrates on explicit request or screen rotation', () => {
    mobile(); const input = start();
    win.screen.orientation.angle = 90;
    orientation(10, 0); advance(100); orientation(12, 0); advance(100); orientation(8, 0); advance(100);
    expect(input.sample().move).toEqual([0, 0]);
    orientation(30, 0); advance(100);
    expect(input.sample().move[0]).toBeGreaterThan(0.7);
    input.calibrate(); neutral(30, 0);
    expect(input.sample().move).toEqual([0, 0]);
    win.screen.orientation.angle = 270; emit(win.screen.orientation, 'change'); neutral();
    orientation(20, 0); advance(100);
    expect(input.sample().move[0]).toBeLessThan(-0.7);
  });
  it('freezes tilt movement for 250ms after swings, and swings never dash or skill', () => {
    mobile(); const input = start(); neutral();
    input.sample(); motion(-15, 0, 0);
    orientation(0, 70); advance(100);
    expect(input.sample()).toMatchObject({ move: [0, 0], fire: true, dash: false, skill: false, aim: null });
    orientation(0, 20); advance(100);
    expect(input.sample().move).toEqual([0, 0]);
    advance(60); orientation(0, 20); advance(100);
    expect(input.sample().move[0]).toBeGreaterThan(0.7);
    advance(350); expect(input.sample().fire).toBe(false);
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
  it('shows action buttons in motion mode, excludes them from attack, and keeps tap/hold attack latched', () => {
    mobile(); const input = start(); neutral();
    const [zone, dashButton, skillButton] = doc.body.children[0].children as ElementFixture[];
    expect(zone.style.display).toBe('none');
    pointer(dashButton, 'pointerdown', 10); pointer(win, 'pointerdown', 10, { target: dashButton });
    pointer(skillButton, 'pointerdown', 11); pointer(win, 'pointerdown', 11, { target: skillButton });
    expect(input.sample()).toMatchObject({ dash: true, skill: true, fire: false });
    expect(input.sample()).toMatchObject({ dash: false, skill: false });
    pointer(win, 'pointerdown', 1, { target: canvas }); pointer(win, 'pointerup', 1);
    expect(input.sample().fire).toBe(true);
    advance(401); expect(input.sample().fire).toBe(false);
    pointer(win, 'pointerdown', 2, { target: canvas }); advance(1000);
    expect(input.sample().fire).toBe(true);
    pointer(win, 'pointerup', 2); expect(input.sample().fire).toBe(false);
  });
});

describe('touch fallback and helpers', () => {
  it('provides joystick movement, one-shot buttons, and multi-touch hold-to-fire', () => {
    mobile();
    const input = start();
    advance(1500);
    expect(input.mode).toBe('touch');
    const overlay = doc.body.children[0] as ElementFixture;
    const [zone, dashButton, skillButton] = overlay.children;
    pointer(zone, 'pointerdown', 1, { clientX: 100, clientY: 100 });
    pointer(win, 'pointermove', 1, { clientX: 144, clientY: 100 });
    expect(input.sample().move).toEqual([1, 0]);
    pointer(dashButton, 'pointerdown', 2);
    pointer(skillButton, 'pointerdown', 3);
    expect(input.sample()).toMatchObject({ dash: true, skill: true, fire: false });
    expect(input.sample()).toMatchObject({ dash: false, skill: false });
    pointer(win, 'pointerdown', 4, { target: canvas });
    pointer(win, 'pointerdown', 5, { target: canvas });
    pointer(win, 'pointerup', 4);
    expect(input.sample().fire).toBe(true);
    pointer(win, 'pointercancel', 5);
    pointer(win, 'pointerup', 1);
    advance(401);
    expect(input.sample()).toMatchObject({ fire: false, move: [0, 0] });
    input.dispose();
    expect(doc.body.children).toHaveLength(0);
  });
  it('fires on the fallback joystick too, excludes buttons, and clears held state on blur', () => {
    mobile();
    const input = start();
    advance(1500);
    const [zone, dashButton] = doc.body.children[0].children as ElementFixture[];
    pointer(win, 'pointerdown', 2, { target: dashButton });
    expect(input.sample().fire).toBe(false);
    pointer(win, 'pointerdown', 1, { target: zone });
    expect(input.sample().fire).toBe(true);
    pointer(win, 'pointerdown', 3, { target: canvas });
    expect(input.sample().fire).toBe(true);
    emit(win, 'blur');
    expect(input.sample().fire).toBe(false);
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
