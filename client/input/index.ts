import type { InputFrame } from '../../shared/types';
import { createGestureState, normalize, recognizeGesture, removeGravity, screenTilt, tiltMove } from './gestures';
import type { Acceleration } from './gestures';
import { debugState, recordGesture } from './debug';
import { createTouchControls } from './touch';
import type { TouchControls } from './touch';

export { createInputDebugPanel } from './debug';

export interface InputOptions {
  canvas: HTMLCanvasElement;
  toArena: (clientX: number, clientY: number) => [number, number];
  getSelf: () => { x: number; y: number } | null;
}
export interface InputController {
  readonly mode: InputFrame['source'];
  readonly needsPermission: boolean;
  requestPermission(): Promise<boolean>;
  calibrate(): void;
  sample(): InputFrame;
  dispose(): void;
}
type PermissionSensor = { requestPermission?: () => Promise<string> };
type SensorWindow = Window & {
  DeviceMotionEvent?: PermissionSensor;
  DeviceOrientationEvent?: PermissionSensor;
  orientation?: number;
};

export function vibrate(pattern: number | number[]): boolean {
  try { return typeof navigator !== 'undefined' && !!navigator.vibrate?.(pattern); }
  catch { return false; }
}

export function createInput(opts: InputOptions): InputController {
  const sensors = window as SensorWindow;
  const mobile = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  let mode: InputFrame['source'] = mobile && sensors.DeviceMotionEvent ? 'motion' : 'keyboard';
  let needsPermission = mode === 'motion' && typeof sensors.DeviceMotionEvent?.requestPermission === 'function';
  let permissionGranted = mode === 'motion' && !needsPermission;
  let disposed = false;
  let seq = 0;
  let dash = false;
  let skill = false;
  let mouseFire = false;
  let mouseSkill = false;
  let mousePosition: [number, number] = [0, 0];
  let mouseAt = -Infinity;
  let gestures = createGestureState();
  let gravity: Acceleration | null = null;
  let rawTilt: [number, number] = [0, 0];
  let hasOrientation = false;
  let neutral: [number, number] | null = null;
  let smoothedMove: [number, number] = [0, 0];
  let lastSample = performance.now();
  let sawMotion = false;
  let sensorTimer: number | undefined;
  let pendingPermission: Promise<boolean> | null = null;
  let touch: TouchControls | null = null;
  const keys = new Set<string>();
  const heldTouches = new Set<number>();
  const cleanup: (() => void)[] = [];
  const originalTouchAction = opts.canvas.style.touchAction;
  opts.canvas.style.touchAction = 'none';
  const on = (target: EventTarget, name: string, listener: EventListener, options?: AddEventListenerOptions) => {
    target.addEventListener(name, listener, options);
    cleanup.push(() => target.removeEventListener(name, listener, options));
  };
  const angle = () => window.screen?.orientation?.angle ?? sensors.orientation ?? 0;
  const editable = (target: EventTarget | null) =>
    !!(target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
  const fallback = () => {
    if (disposed) return;
    mode = 'touch';
    needsPermission = false;
    heldTouches.clear();
    dash = skill = false;
    touch ??= createTouchControls();
    debugState.mode = mode;
    recordGesture('touch fallback');
  };
  const watchForMotion = () => {
    window.clearTimeout(sensorTimer);
    sensorTimer = window.setTimeout(() => {
      if (!sawMotion) {
        debugState.permission = 'no sensor events (HTTPS may be required)';
        fallback();
      }
    }, 1000);
  };
  const reset = () => {
    keys.clear();
    mouseFire = false;
    mouseSkill = false;
    mouseAt = -Infinity;
    heldTouches.clear();
    dash = skill = false;
    gestures = createGestureState();
    smoothedMove = [0, 0];
    touch?.clear();
  };
  const dashKeys = new Set(['Space', 'KeyK', 'ShiftLeft', 'ShiftRight']);
  const skillKeys = new Set(['KeyE', 'KeyL']);
  const gameKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
    'KeyJ', ...dashKeys, ...skillKeys]);
  on(window, 'keydown', (event => {
    const e = event as KeyboardEvent;
    if (editable(e.target) || !gameKeys.has(e.code)) return;
    e.preventDefault();
    if (!keys.has(e.code) && !e.repeat) {
      if (dashKeys.has(e.code)) dash = true;
      if (skillKeys.has(e.code)) skill = true;
    }
    keys.add(e.code);
  }));
  on(window, 'keyup', (event => { keys.delete((event as KeyboardEvent).code); }));
  on(opts.canvas, 'mousemove', (event => {
    const e = event as MouseEvent;
    mousePosition = [e.clientX, e.clientY];
    mouseAt = performance.now();
  }));
  on(opts.canvas, 'mousedown', (event => {
    const e = event as MouseEvent;
    if (e.button === 0) mouseFire = true;
    if (e.button === 2 && !mouseSkill) { skill = true; mouseSkill = true; }
    // A click also establishes aim even if there was no preceding mousemove.
    mousePosition = [e.clientX, e.clientY];
    mouseAt = performance.now();
    e.preventDefault();
  }));
  on(window, 'mouseup', (event => {
    const e = event as MouseEvent;
    if (e.button === 0) mouseFire = false;
    if (e.button === 2) mouseSkill = false;
  }));
  on(window, 'pointerup', (event => {
    const e = event as PointerEvent;
    if (e.pointerType === 'mouse' && e.button === 0) mouseFire = false;
    heldTouches.delete(e.pointerId);
  }));
  on(window, 'pointercancel', (event => {
    mouseFire = false;
    heldTouches.delete((event as PointerEvent).pointerId);
  }));
  on(opts.canvas, 'contextmenu', e => e.preventDefault());
  on(window, 'blur', reset);
  on(document, 'visibilitychange', () => { if (document.hidden) reset(); });
  on(window, 'pointerdown', (event => {
    const e = event as PointerEvent;
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (needsPermission) void controller.requestPermission();
    if (mode === 'motion' && !editable(e.target)) heldTouches.add(e.pointerId);
  }), { capture: true });
  on(window, 'deviceorientation', (event => {
    const e = event as DeviceOrientationEvent;
    if (mode !== 'motion' || !permissionGranted || e.beta === null || e.gamma === null) return;
    debugState.beta = e.beta;
    debugState.gamma = e.gamma;
    debugState.angle = angle();
    rawTilt = screenTilt(e.beta, e.gamma, angle());
    hasOrientation = true;
    neutral ??= [...rawTilt];
  }));
  const resetOrientation = () => { neutral = null; hasOrientation = false; smoothedMove = [0, 0]; };
  on(window, 'orientationchange', resetOrientation);
  if (window.screen?.orientation) {
    on(window.screen.orientation, 'change', resetOrientation);
  }
  on(window, 'devicemotion', (event => {
    const e = event as DeviceMotionEvent;
    if (mode !== 'motion' || !permissionGranted) return;
    const clean = e.acceleration;
    const raw = clean?.x != null && clean.y != null && clean.z != null ? clean : e.accelerationIncludingGravity;
    // Null-valued events occur on unsupported desktop sensors; don't suppress fallback for them.
    if (raw?.x == null || raw.y == null || raw.z == null) return;
    sawMotion = true;
    window.clearTimeout(sensorTimer);
    let acceleration = { x: raw.x, y: raw.y, z: raw.z };
    if (raw !== clean) {
      const result = removeGravity(acceleration, gravity);
      gravity = result.gravity;
      acceleration = result.acceleration;
    }
    debugState.acceleration = acceleration;
    // A sideways swing follows the screen's horizontal axis in either landscape orientation.
    const [x, y] = screenTilt(acceleration.y, acceleration.x, angle());
    const previousFire = gestures.lastFire;
    const result = recognizeGesture(gestures, { x, y, z: acceleration.z }, performance.now());
    gestures = result.state;
    if (result.dash) { dash = true; recordGesture('SWING → dash'); }
    if (result.skill) { skill = true; recordGesture('SHAKE → skill'); }
    if (gestures.lastFire !== previousFire) recordGesture('THRUST → fire');
  }));

  const controller: InputController = {
    get mode() { return mode; },
    get needsPermission() { return needsPermission; },
    requestPermission() {
      if (disposed || mode !== 'motion') return Promise.resolve(false);
      if (pendingPermission) return pendingPermission;
      if (permissionGranted) return Promise.resolve(true);
      // Invoke both requests before awaiting so iOS retains the original tap activation.
      try {
        const requests = [sensors.DeviceMotionEvent, sensors.DeviceOrientationEvent]
          .filter((sensor): sensor is PermissionSensor => !!sensor?.requestPermission)
          .map(sensor => sensor.requestPermission!());
        pendingPermission = Promise.all(requests).then(results => {
          if (disposed) return false;
          needsPermission = false;
          permissionGranted = results.every(result => result === 'granted');
          debugState.permission = permissionGranted ? 'granted' : 'denied';
          if (permissionGranted) watchForMotion();
          else fallback();
          return permissionGranted;
        }).catch(() => {
          debugState.permission = 'denied';
          fallback();
          return false;
        });
      } catch {
        debugState.permission = 'denied';
        fallback();
        pendingPermission = Promise.resolve(false);
      }
      return pendingPermission;
    },
    calibrate() {
      neutral = hasOrientation ? [...rawTilt] : null;
      smoothedMove = [0, 0];
      gravity = null;
      gestures = createGestureState();
      recordGesture('calibrated');
    },
    sample() {
      const now = performance.now();
      let move: [number, number] = [0, 0];
      let aim: [number, number] | null = null;
      let fire = false;
      if (!disposed && mode === 'keyboard') {
        const down = (...codes: string[]) => codes.some(code => keys.has(code)) ? 1 : 0;
        move = normalize(down('KeyD', 'ArrowRight') - down('KeyA', 'ArrowLeft'), down('KeyS', 'ArrowDown') - down('KeyW', 'ArrowUp'));
        fire = mouseFire || keys.has('KeyJ');
        const self = opts.getSelf();
        if (self && now - mouseAt <= 2000) {
          const [x, y] = opts.toArena(...mousePosition);
          const dx = x - self.x;
          const dy = y - self.y;
          const length = Math.hypot(dx, dy);
          if (length > 0) aim = [dx / length, dy / length];
        }
      } else if (!disposed && mode === 'motion') {
        const target = tiltMove(rawTilt, neutral ?? rawTilt);
        const blend = 1 - Math.exp(-Math.max(0, Math.min(now - lastSample, 100)) / 65);
        smoothedMove = [smoothedMove[0] + (target[0] - smoothedMove[0]) * blend,
          smoothedMove[1] + (target[1] - smoothedMove[1]) * blend];
        move = smoothedMove;
        fire = now < gestures.fireUntil || heldTouches.size > 0;
      } else if (!disposed && touch) {
        move = [...touch.move];
        fire = touch.fire;
        dash ||= touch.dash;
        skill ||= touch.skill;
        touch.dash = touch.skill = false;
      }
      lastSample = now;
      debugState.move = move;
      const frame: InputFrame = { seq: ++seq, move, aim, fire, dash: !disposed && dash, skill: !disposed && skill, source: mode };
      dash = skill = false;
      return frame;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      window.clearTimeout(sensorTimer);
      cleanup.forEach(fn => fn());
      touch?.dispose();
      opts.canvas.style.touchAction = originalTouchAction;
    },
  };
  debugState.mode = mode;
  debugState.permission = needsPermission ? 'tap to enable' : mode === 'motion' ? 'not required' : 'not applicable';
  if (permissionGranted) watchForMotion();
  return controller;
}
