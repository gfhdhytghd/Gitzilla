import type { InputFrame } from '../../shared/types';
import { createGestureState, gravityTilt, normalize, recognizeGesture, removeGravity, screenTilt, tiltMove } from './gestures';
import type { Acceleration } from './gestures';
import { createInputDebugPanel, debugState, recordGesture } from './debug';
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
  readonly sensorStatus: 'on' | 'waiting' | 'off';
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
  // Listen first: API presence doesn't prove delivery, and some browsers hide constructors.
  let mode: InputFrame['source'] = mobile ? 'motion' : 'keyboard';
  let sensorStatus: InputController['sensorStatus'] = mobile ? 'waiting' : 'off';
  let needsPermission = !!mobile && [sensors.DeviceMotionEvent, sensors.DeviceOrientationEvent]
    .some(sensor => typeof sensor?.requestPermission === 'function');
  let permissionGranted = !!mobile && !needsPermission;
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
  let lastOrientationAt = -Infinity;
  let gravitySign = 0;
  let neutral: [number, number] | null = null;
  let calibrationAt: number | null = null;
  let calibrationSum: [number, number] = [0, 0];
  let calibrationCount = 0;
  let freezeUntil = 0;
  let stableTilt: [number, number] = [0, 0];
  let smoothedMove: [number, number] = [0, 0];
  let lastSample = performance.now();
  let sawSensor = false;
  let sensorTimer: number | undefined;
  let pendingPermission: Promise<boolean> | null = null;
  let touch: TouchControls | null = null;
  const keys = new Set<string>();
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
    sensorStatus = 'off';
    needsPermission = false;
    dash = skill = false;
    touch ??= createTouchControls();
    touch.setJoystick(true);
    debugState.mode = mode;
    recordGesture('touch fallback');
  };
  const watchForMotion = () => {
    window.clearTimeout(sensorTimer);
    sensorTimer = window.setTimeout(() => {
      if (!sawSensor) {
        recordGesture('no sensors after 1.5s (use HTTPS or localhost)');
        fallback();
      }
    }, 1500);
  };
  const markSensor = () => {
    sawSensor = true;
    sensorStatus = 'on';
    window.clearTimeout(sensorTimer);
    if (mode !== 'motion') {
      mode = 'motion';
      touch?.setJoystick(false);
      recordGesture('late sensors recovered → motion');
    }
    debugState.mode = mode;
  };
  const resetCalibration = () => {
    neutral = null;
    calibrationAt = null;
    calibrationSum = [0, 0];
    calibrationCount = 0;
    smoothedMove = [0, 0];
  };
  const acceptTilt = (tilt: [number, number], now: number) => {
    if (now < freezeUntil) return;
    rawTilt = tilt;
    if (neutral) return;
    calibrationAt ??= now;
    if (now - calibrationAt < 300 || calibrationCount === 0) {
      calibrationSum[0] += tilt[0]; calibrationSum[1] += tilt[1];
      calibrationCount++;
    }
    if (now - calibrationAt >= 300 && calibrationCount) {
      neutral = [calibrationSum[0] / calibrationCount, calibrationSum[1] / calibrationCount];
      recordGesture('neutral calibrated (300ms)');
    }
  };
  const reset = () => {
    keys.clear();
    mouseFire = false;
    mouseSkill = false;
    mouseAt = -Infinity;
    dash = skill = false;
    gestures = createGestureState();
    smoothedMove = [0, 0];
    freezeUntil = 0;
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
  }));
  on(window, 'pointercancel', (event => {
    mouseFire = false;
  }));
  on(opts.canvas, 'contextmenu', e => e.preventDefault());
  on(window, 'blur', reset);
  on(document, 'visibilitychange', () => { if (document.hidden) reset(); });
  on(window, 'pointerdown', (event => {
    const e = event as PointerEvent;
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (needsPermission) void controller.requestPermission();
  }), { capture: true });
  const onOrientation: EventListener = event => {
    const e = event as DeviceOrientationEvent;
    if (!mobile || !permissionGranted || !Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;
    if (e.beta == null || e.gamma == null) return;
    markSensor();
    debugState.beta = e.beta;
    debugState.gamma = e.gamma;
    debugState.angle = angle();
    lastOrientationAt = performance.now();
    acceptTilt(screenTilt(e.beta, e.gamma, angle()), lastOrientationAt);
  };
  on(window, 'deviceorientation', onOrientation);
  on(window, 'deviceorientationabsolute', onOrientation);
  const resetOrientation = () => { resetCalibration(); freezeUntil = 0; };
  on(window, 'orientationchange', resetOrientation);
  if (window.screen?.orientation) {
    on(window.screen.orientation, 'change', resetOrientation);
  }
  on(window, 'devicemotion', (event => {
    const e = event as DeviceMotionEvent;
    if (!mobile || !permissionGranted) return;
    const clean = e.acceleration;
    const valid = (a: DeviceMotionEventAcceleration | null | undefined): a is DeviceMotionEventAcceleration & Acceleration =>
      !!a && a.x != null && a.y != null && a.z != null && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);
    const raw = valid(clean) ? clean : e.accelerationIncludingGravity;
    // Null-valued events occur on unsupported desktop sensors; don't suppress fallback for them.
    if (!valid(raw)) return;
    markSensor();
    const now = performance.now();
    let acceleration = { x: raw.x, y: raw.y, z: raw.z };
    const includingGravity = e.accelerationIncludingGravity;
    if (valid(includingGravity)) {
      const result = removeGravity({ x: includingGravity.x, y: includingGravity.y, z: includingGravity.z }, gravity);
      gravity = result.gravity;
      if (raw !== clean) acceleration = result.acceleration;
      if (!gravitySign && Math.abs(gravity.z) > 1) gravitySign = Math.sign(gravity.z);
    }
    debugState.acceleration = acceleration;
    const result = recognizeGesture(gestures, acceleration, now);
    gestures = result.state;
    if (result.fired) {
      freezeUntil = now + 250;
      rawTilt = [...stableTilt];
      recordGesture('SWING (any direction) → attack');
    }
    if (gravity && gravitySign && now - lastOrientationAt > 500 && Math.hypot(...Object.values(acceleration)) < 5) {
      acceptTilt(gravityTilt(gravity, angle(), gravitySign), now);
    }
  }));

  const controller: InputController = {
    get mode() { return mode; },
    get needsPermission() { return needsPermission; },
    get sensorStatus() { return sensorStatus; },
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
      resetCalibration();
      gravity = null;
      gravitySign = 0;
      gestures = createGestureState();
      freezeUntil = 0;
      recordGesture('recalibrating neutral (300ms)');
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
        if (!neutral && calibrationAt !== null && now - calibrationAt >= 300 && calibrationCount) {
          neutral = [calibrationSum[0] / calibrationCount, calibrationSum[1] / calibrationCount];
        }
        const target = neutral ? tiltMove(rawTilt, neutral) : [0, 0];
        const blend = 1 - Math.exp(-Math.max(0, Math.min(now - lastSample, 100)) / 65);
        if (now >= freezeUntil) {
          smoothedMove = [smoothedMove[0] + (target[0] - smoothedMove[0]) * blend,
            smoothedMove[1] + (target[1] - smoothedMove[1]) * blend];
          stableTilt = [...rawTilt];
        }
        move = smoothedMove;
        fire = now < gestures.fireUntil;
      } else if (!disposed && touch) {
        move = [...touch.move];
      }
      if (!disposed && touch) {
        fire ||= touch.fire;
        dash ||= touch.dash;
        skill ||= touch.skill;
        touch.dash = touch.skill = false;
      }
      lastSample = now;
      debugState.move = move;
      debugState.sensors = sensorStatus;
      debugState.calibrating = calibrationAt !== null && neutral === null;
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
      debugPanel?.dispose();
      opts.canvas.style.touchAction = originalTouchAction;
    },
  };
  debugState.mode = mode;
  debugState.sensors = sensorStatus;
  debugState.calibrating = false;
  debugState.permission = needsPermission ? 'tap to enable' : mode === 'motion' ? 'not required' : 'not applicable';
  if (mobile) touch = createTouchControls({ joystick: false });
  const debugPanel = window.location && new URLSearchParams(window.location.search).get('debug') === 'input'
    ? createInputDebugPanel() : null;
  if (debugPanel) document.body.append(debugPanel);
  if (permissionGranted) watchForMotion();
  return controller;
}
