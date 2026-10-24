import type { InputFrame, MotionProfile } from '../../shared/types';
import { createGestureState, gravityTilt, normalize, recognizeGesture, removeGravity, screenTilt, tiltMove } from './gestures';
import type { Acceleration, RotationRate } from './gestures';
import { loadThresholds, sanitizeThresholds, saveThresholds, type GestureThresholds } from './thresholds';
import { createCalibrationRecorder, type CalibrationRecorder, type GestureNotice } from './calibration';
import { createSensorTrace, type SensorTrace } from './trace';
import { createInputDebugPanel, debugState, recordGesture } from './debug';
import { createTouchControls } from './touch';
import type { TouchControls } from './touch';
import { isMotionProfile, loadMotionProfile, MOTION_SETTINGS, saveMotionProfile } from './profiles';

export type { GestureThresholds } from './thresholds';
export type { CalibrationRecorder, CalibrationStep, CalibrationMeter, GestureNotice } from './calibration';
export { loadThresholds, defaultThresholds } from './thresholds';
export { screenTilt } from './gestures';
export { createInputDebugPanel } from './debug';
export { loadMotionProfile, saveMotionProfile, MOTION_PROFILES, MOTION_PROFILE_LABELS } from './profiles';

export interface InputOptions {
  canvas: HTMLCanvasElement;
  toArena: (clientX: number, clientY: number) => [number, number];
  getSelf: () => { x: number; y: number } | null;
  motionProfile?: MotionProfile;
  onGesture?: (notice: GestureNotice) => void;
}
export interface InputController {
  readonly mode: InputFrame['source'];
  readonly needsPermission: boolean;
  readonly sensorStatus: 'on' | 'waiting' | 'off';
  readonly motionProfile: MotionProfile;
  readonly profile: GestureThresholds;
  readonly calibration: CalibrationRecorder;
  readonly trace: SensorTrace;
  readonly lastGesture: GestureNotice | null;
  setProfile(thresholds: Partial<GestureThresholds>): void;
  setMotionProfile(profile: MotionProfile): void;
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
  let motionProfile = opts.motionProfile ?? loadMotionProfile();
  if (opts.motionProfile) saveMotionProfile(opts.motionProfile);
  let thresholds = loadThresholds(motionProfile);
  const trace = createSensorTrace();
  let lastGesture: GestureNotice | null = null;
  const requiresPermission = [sensors.DeviceMotionEvent, sensors.DeviceOrientationEvent]
    .some(sensor => typeof sensor?.requestPermission === 'function');
  // Listen first: API presence doesn't prove delivery, and some browsers hide constructors.
  let mode: InputFrame['source'] = mobile ? motionProfile === 'tap-only' ? 'touch' : 'motion' : 'keyboard';
  let sensorStatus: InputController['sensorStatus'] = mode === 'motion' ? 'waiting' : 'off';
  let needsPermission = !!mobile && motionProfile !== 'tap-only' && requiresPermission;
  let permissionGranted = !!mobile && !requiresPermission;
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
  let neutral: [number, number] | null = thresholds.neutral ? [...thresholds.neutral] : null;
  let calibrationAt: number | null = null;
  let calibrationSum: [number, number] = [0, 0];
  let calibrationCount = 0;
  let freezeUntil = 0;
  let stableTilt: [number, number] = [0, 0];
  let smoothedMove: [number, number] = [0, 0];
  let lastSample = performance.now();
  let sawSensor = false;
  let lastSensorAt = -Infinity;
  let sensorTimer: number | undefined;
  let pendingPermission: Promise<boolean> | null = null;
  let permissionVersion = 0;
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
    touch ??= createTouchControls({ onAction: (kind, via) => notify(kind, via, performance.now()) });
    touch.setJoystick(true);
    debugState.mode = mode;
    recordGesture('touch fallback');
  };
  const watchForMotion = () => {
    window.clearTimeout(sensorTimer);
    const watchingSince = performance.now();
    sensorTimer = window.setTimeout(() => {
      if (lastSensorAt < watchingSince) {
        recordGesture('no sensors after 1.5s (use HTTPS or localhost)');
        fallback();
      }
    }, 1500);
  };
  const markSensor = () => {
    sawSensor = true;
    lastSensorAt = performance.now();
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
  const calibration = createCalibrationRecorder(() => thresholds, {
    start(step) {
      trace.start(); reset(); gestures = createGestureState();
      if (step === 'neutral') resetCalibration();
    }, finish() { void trace.upload(); },
  });
  const notify = (kind: GestureNotice['kind'], via: string, at: number) => {
    lastGesture = { kind, via, at }; freezeUntil = at + 250;
    smoothedMove = [0, 0]; rawTilt = [...stableTilt];
    calibration.observe({ at, gesture: lastGesture });
    trace.add({ type: 'gesture', at, kind, via });
    recordGesture(`${via} → ${kind}`); opts.onGesture?.(lastGesture);
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
  // iOS only shows the motion permission prompt for requests made inside touchend/click — a request from
  // touchstart/pointerdown is silently refused (no prompt) and the page would wrongly think it's enabled.
  const askFromGesture = (event: Event) => {
    if (event.type === 'touchend' && (event as TouchEvent).changedTouches.length === 0) return;
    const target = event.target as Element | null;
    // Choosing tap-only or opening settings must not accidentally request sensors.
    // The dedicated enable button still requests here, before fullscreen consumes activation.
    if (target?.closest?.('button, input, textarea, select, a, [data-motion-profile]')
      && !target.closest?.('[data-testid="motion-enable"]')) return;
    if (needsPermission) void controller.requestPermission();
  };
  on(window, 'touchend', askFromGesture, { capture: true });
  on(window, 'click', askFromGesture, { capture: true });
  const onOrientation: EventListener = event => {
    const e = event as DeviceOrientationEvent;
    if (!mobile || motionProfile === 'tap-only' || !permissionGranted || !Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;
    if (e.beta == null || e.gamma == null) return;
    markSensor();
    debugState.beta = e.beta;
    debugState.gamma = e.gamma;
    debugState.angle = angle();
    lastOrientationAt = performance.now();
    const tilt = screenTilt(e.beta, e.gamma, angle());
    trace.add({ type: 'orientation', at: lastOrientationAt, alpha: e.alpha, beta: e.beta, gamma: e.gamma, absolute: e.absolute, angle: angle() });
    calibration.observe({ at: lastOrientationAt, tilt });
    acceptTilt(tilt, lastOrientationAt);
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
    if (!mobile || motionProfile === 'tap-only' || !permissionGranted) return;
    const clean = e.acceleration;
    const valid = (a: DeviceMotionEventAcceleration | null | undefined): a is DeviceMotionEventAcceleration & Acceleration =>
      !!a && a.x != null && a.y != null && a.z != null && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);
    const rate = e.rotationRate;
    const gyro: RotationRate | null = rate && [rate.alpha, rate.beta, rate.gamma].some(v => v !== null && Number.isFinite(v))
      ? { alpha: Number.isFinite(rate.alpha) ? rate.alpha! : 0, beta: Number.isFinite(rate.beta) ? rate.beta! : 0, gamma: Number.isFinite(rate.gamma) ? rate.gamma! : 0 } : null;
    const raw = valid(clean) ? clean : e.accelerationIncludingGravity;
    if (!valid(raw) && !gyro) return;
    markSensor();
    const now = performance.now();
    trace.add({ type: 'motion', at: now, acceleration: e.acceleration ? { x: e.acceleration.x, y: e.acceleration.y, z: e.acceleration.z } : null,
      accelerationIncludingGravity: e.accelerationIncludingGravity ? { x: e.accelerationIncludingGravity.x, y: e.accelerationIncludingGravity.y, z: e.accelerationIncludingGravity.z } : null,
      rotationRate: gyro, interval: e.interval });
    let acceleration: Acceleration = valid(raw) ? { x: raw.x, y: raw.y, z: raw.z } : { x: 0, y: 0, z: 0 };
    const includingGravity = e.accelerationIncludingGravity;
    if (valid(includingGravity)) {
      const result = removeGravity({ x: includingGravity.x, y: includingGravity.y, z: includingGravity.z }, gravity);
      gravity = result.gravity;
      if (raw !== clean) acceleration = result.acceleration;
      if (!gravitySign && Math.abs(gravity.z) > 1) gravitySign = Math.sign(gravity.z);
    }
    debugState.acceleration = acceleration;
    debugState.rotationRate = gyro;
    // Training uses permissive sane floors so low-motion users can record their own peaks.
    const step = calibration.meter().step;
    const trainingThresholds = step ? { ...thresholds, swingThreshold: step === 'swing' ? 4 : thresholds.swingThreshold,
      releaseThreshold: step === 'swing' ? 2 : thresholds.releaseThreshold,
      twistThreshold: step === 'twist' ? 80 : thresholds.twistThreshold, spinAngle: step === 'spin' ? 220 : thresholds.spinAngle } : thresholds;
    const result = recognizeGesture(gestures, acceleration, now, motionProfile, gyro, trainingThresholds);
    gestures = result.state;
    // Freeze during the candidate too: waiting for a twist to settle must not let
    // its rotation steer the hero before the eventual dash/spin is classified.
    if (gyro && Math.hypot(gyro.alpha, gyro.beta, gyro.gamma) >= 80) {
      freezeUntil = now + 250; smoothedMove = [0, 0]; rawTilt = [...stableTilt];
    }
    debugState.spinDegrees = result.spinDegrees;
    calibration.observe({ at: now, acceleration, rotationRate: gyro, spinDegrees: result.spinDegrees });
    if (result.skill) { skill = true; notify('skill', 'spin', now); }
    else if (result.dash) { dash = true; notify('dash', 'twist', now); }
    else if (result.fired) notify('attack', 'swing', now);
    if (gravity && gravitySign && now - lastOrientationAt > 500 && Math.hypot(...Object.values(acceleration)) < 5) {
      const tilt = gravityTilt(gravity, angle(), gravitySign);
      calibration.observe({ at: now, tilt }); acceptTilt(tilt, now);
    }
  }));

  const controller: InputController = {
    get mode() { return mode; },
    get needsPermission() { return needsPermission; },
    get sensorStatus() { return sensorStatus; },
    get motionProfile() { return motionProfile; },
    get profile(): GestureThresholds { return { ...thresholds, neutral: thresholds.neutral ? [...thresholds.neutral] : null }; },
    calibration, trace,
    get lastGesture() { return lastGesture; },
    setProfile(values) {
      thresholds = sanitizeThresholds(values, thresholds); saveThresholds(thresholds, motionProfile);
      reset(); resetCalibration(); neutral = thresholds.neutral ? [...thresholds.neutral] : null;
    },
    setMotionProfile(profile) {
      if (disposed || !isMotionProfile(profile)) return;
      saveMotionProfile(profile);
      if (profile === motionProfile) return;
      motionProfile = profile;
      thresholds = loadThresholds(profile);
      permissionVersion++;
      pendingPermission = null;
      reset(); resetCalibration(); neutral = thresholds.neutral ? [...thresholds.neutral] : null;
      gravity = null; gravitySign = 0; lastOrientationAt = -Infinity;
      sawSensor = false;
      window.clearTimeout(sensorTimer);
      if (mobile) {
        mode = profile === 'tap-only' ? 'touch' : 'motion';
        sensorStatus = profile === 'tap-only' ? 'off' : 'waiting';
        needsPermission = profile !== 'tap-only' && requiresPermission && !permissionGranted;
        touch?.setJoystick(profile === 'tap-only');
        if (profile !== 'tap-only' && permissionGranted) watchForMotion();
      }
      debugState.mode = mode; debugState.sensors = sensorStatus; debugState.profile = profile;
      recordGesture(`profile → ${profile}; recalibrating`);
    },
    requestPermission() {
      if (disposed || !mobile || motionProfile === 'tap-only') return Promise.resolve(false);
      mode = 'motion'; sensorStatus = 'waiting';
      if (pendingPermission) return pendingPermission;
      if (permissionGranted) { watchForMotion(); return Promise.resolve(true); }
      const version = permissionVersion;
      // Invoke both requests before awaiting so iOS retains the original tap activation.
      try {
        const requests = [sensors.DeviceMotionEvent, sensors.DeviceOrientationEvent]
          .filter((sensor): sensor is PermissionSensor => !!sensor?.requestPermission)
          .map(sensor => sensor.requestPermission!());
        pendingPermission = Promise.all(requests).then(results => {
          if (disposed || version !== permissionVersion) return false;
          needsPermission = false;
          permissionGranted = results.every(result => result === 'granted');
          if (motionProfile === 'tap-only') return false; // profile may change while a native prompt is open
          debugState.permission = permissionGranted ? 'granted' : 'denied';
          if (permissionGranted) watchForMotion();
          else fallback();
          return permissionGranted;
        }).catch(() => {
          if (disposed || version !== permissionVersion) return false;
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
        const target = neutral ? tiltMove(rawTilt, neutral, motionProfile, thresholds) : [0, 0];
        const blend = 1 - Math.exp(-Math.max(0, Math.min(now - lastSample, 100)) / MOTION_SETTINGS[motionProfile].smoothingMs);
        if (now >= freezeUntil) {
          smoothedMove = [smoothedMove[0] + (target[0] - smoothedMove[0]) * blend,
            smoothedMove[1] + (target[1] - smoothedMove[1]) * blend];
          stableTilt = [...rawTilt];
        }
        move = now < freezeUntil ? [0, 0] : smoothedMove;
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
      trace.dispose();
      cleanup.forEach(fn => fn());
      touch?.dispose();
      debugPanel?.dispose();
      opts.canvas.style.touchAction = originalTouchAction;
    },
  };
  debugState.mode = mode;
  debugState.sensors = sensorStatus;
  debugState.calibrating = false;
  debugState.profile = motionProfile;
  debugState.permission = needsPermission ? 'tap to enable' : mode === 'motion' ? 'not required' : 'not applicable';
  if (mobile) touch = createTouchControls({ joystick: motionProfile === 'tap-only', onAction: (kind, via) => {
    if (kind !== 'attack') gestures.fireUntil = 0;
    notify(kind, via, performance.now());
  } });
  const lostTimer = window.setInterval(() => {
    if (mobile && motionProfile !== 'tap-only' && sawSensor && sensorStatus === 'on' && performance.now() - lastSensorAt > 1800) fallback();
  }, 500);
  cleanup.push(() => window.clearInterval(lostTimer));
  if (new URLSearchParams(window.location?.search).get('trace') === '1') trace.start();
  const debugPanel = window.location && new URLSearchParams(window.location.search).get('debug') === 'input'
    ? createInputDebugPanel() : null;
  if (debugPanel) document.body.append(debugPanel);
  if (permissionGranted && motionProfile !== 'tap-only') watchForMotion();
  return controller;
}
