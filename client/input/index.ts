import type { InputFrame, MotionProfile } from '../../shared/types';
import { createGestureState, gravityMove, normalize, orientationGravity, recognizeGesture, removeGravity, screenTilt } from './gestures';
import type { Acceleration, RotationRate } from './gestures';
import { loadThresholds, sanitizeThresholds, saveThresholds, type GestureThresholds } from './thresholds';
import { createCalibrationRecorder, type CalibrationRecorder, type GestureNotice } from './calibration';
import { createSensorTrace, startAutomaticTrace, type SensorTrace } from './trace';
import { createInputDebugPanel, debugState, recordGesture } from './debug';
import { createTouchControls } from './touch';
import type { TouchControls } from './touch';
import { isMotionProfile, loadMotionProfile, MOTION_SETTINGS, saveMotionProfile } from './profiles';
import { getMotionPermissionSession } from './permission';
import { loadTiltSensitivity, saveTiltSensitivity, TILT_FULL_SPEED, type TiltSensitivity } from './sensitivity';
import { installTrainingTrace } from './training-trace';

export type { GestureThresholds } from './thresholds';
export type { CalibrationRecorder, CalibrationStep, CalibrationMeter, GestureNotice } from './calibration';
export { loadThresholds, defaultThresholds } from './thresholds';
export { getMotionPermissionState, requestMotionPermission, subscribeMotionPermission, MOTION_PERMISSION_EVENT } from './permission';
export type { MotionPermissionState } from './permission';
export { loadTiltSensitivity, saveTiltSensitivity, TILT_SENSITIVITIES, TILT_FULL_SPEED } from './sensitivity';
export type { TiltSensitivity } from './sensitivity';
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
  readonly tiltSensitivity: TiltSensitivity;
  setTiltSensitivity(value: TiltSensitivity): void;
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
  const permissionSession = getMotionPermissionSession();
  const initialPermission = permissionSession.getState(motionProfile);
  let thresholds = loadThresholds(motionProfile);
  const trace = createSensorTrace('fight');
  let tiltSensitivity = loadTiltSensitivity();
  let moveGravity: Acceleration | null = null;
  let lastGravityAt = -Infinity;
  let lastGesture: GestureNotice | null = null;
  const requiresPermission = [sensors.DeviceMotionEvent, sensors.DeviceOrientationEvent]
    .some(sensor => typeof sensor?.requestPermission === 'function');
  // Listen first: API presence doesn't prove delivery, and some browsers hide constructors.
  let mode: InputFrame['source'] = mobile ? motionProfile === 'tap-only' ? 'touch' : 'motion' : 'keyboard';
  let sensorStatus: InputController['sensorStatus'] = initialPermission.sensorStatus;
  let needsPermission = initialPermission.needsPermission;
  let permissionGranted = initialPermission.permission === 'granted' || initialPermission.permission === 'not-required';
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
  let lastOrientationAt = -Infinity;
  let gravitySign = 0;
  let steeringHoldUntil = 0;
  let lastAutomaticRequest = -Infinity;
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
  const angle = () => {
    // Phones are portrait-only. Some WebKit versions expose a stale landscape
    // screen angle even while the phone viewport is upright.
    if (mobile && window.innerWidth > 0 && window.innerWidth < 600 && window.innerHeight > window.innerWidth) return 0;
    return window.screen?.orientation?.angle ?? sensors.orientation ?? 0;
  };
  const editable = (target: EventTarget | null) =>
    !!(target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
  const fallback = () => {
    if (disposed) return;
    mode = 'touch';
    sensorStatus = 'off';
    needsPermission = !!mobile && motionProfile !== 'tap-only' && requiresPermission && !permissionGranted;
    dash = skill = false;
    touch ??= createTouchControls({ onAction: (kind, via) => notify(kind, via, performance.now()) });
    touch.setJoystick(true);
    debugState.mode = mode;
    recordGesture('touch fallback');
  };
  const markSensor = () => {
    if (permissionSession.getState(motionProfile).sensorStatus !== 'on') return false;
    sensorStatus = 'on';
    if (mode !== 'motion') {
      mode = 'motion';
      touch?.setJoystick(false);
      recordGesture('late sensors recovered → motion');
    }
    debugState.mode = mode;
    return true;
  };
  const resetCalibration = () => { moveGravity = null; lastGravityAt = -Infinity; };
  const calibration = createCalibrationRecorder(() => thresholds, {
    start(step) {
      trace.start(); reset(); gestures = createGestureState();
      if (step === 'neutral') resetCalibration();
    }, finish() { void trace.upload(); },
  });
  const notify = (kind: GestureNotice['kind'], via: string, at: number) => {
    lastGesture = { kind, via, at };
    if (via === 'swing' || via === 'twist' || via === 'spin') steeringHoldUntil = at + 120;
    calibration.observe({ at, gesture: lastGesture });
    trace.add({ type: 'gesture', at, kind, via });
    recordGesture(`${via} → ${kind}`); opts.onGesture?.(lastGesture);
  };
  const acceptGravity = (vector: Acceleration, now: number) => {
    if (now < steeringHoldUntil) return;
    const magnitude = Math.hypot(vector.x, vector.y, vector.z);
    if (magnitude < 0.01) return;
    const next = { x: vector.x / magnitude, y: vector.y / magnitude, z: vector.z / magnitude };
    const dt = Math.min(100, Math.max(0, now - lastGravityAt));
    //45ms gravity smoothing, with immediate response when downhill reverses.
    const alpha = !moveGravity || moveGravity.x * next.x + moveGravity.y * next.y < 0 ? 1 : 1 - Math.exp(-dt / 45);
    moveGravity = moveGravity ? { x: moveGravity.x + (next.x - moveGravity.x) * alpha,
      y: moveGravity.y + (next.y - moveGravity.y) * alpha, z: moveGravity.z + (next.z - moveGravity.z) * alpha } : next;
    lastGravityAt = now;
  };
  let settingsOpen = document.body?.classList?.contains('settings-open') ?? false;
  const reset = () => {
    keys.clear();
    mouseFire = false;
    mouseSkill = false;
    mouseAt = -Infinity;
    dash = skill = false;
    gestures = createGestureState();
    steeringHoldUntil = 0;
    touch?.clear();
  };
  const dashKeys = new Set(['Space', 'KeyK', 'ShiftLeft', 'ShiftRight']);
  const skillKeys = new Set(['KeyE', 'KeyL']);
  const gameKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
    'KeyJ', ...dashKeys, ...skillKeys]);
  on(window, 'keydown', (event => {
    const e = event as KeyboardEvent;
    if (settingsOpen || editable(e.target) || !gameKeys.has(e.code)) return;
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
  // Touch pointerdown/start does not grant transient activation (WebKit's activation API).
  // Ask on touchend/click; native results and subsequent valid sensor events are separate gates.
  const askFromGesture = (event: Event) => {
    if (event.type === 'touchend' && !(event as TouchEvent).changedTouches?.length) return;
    const target = event.target as Element | null;
    // Choosing tap-only or opening settings must not accidentally request sensors.
    // Buttons (including the enable pill) have their own synchronous onclick requests.
    if (settingsOpen || target?.closest?.('button, input, textarea, select, a, [data-motion-profile], [data-input-ignore]')) return;
    const now = performance.now();
    // One touch produces touchend followed by click. A denied end must not immediately
    // prompt again on that same tap, while a later tap must remain retryable.
    if (needsPermission && now - lastAutomaticRequest >= 500) {
      lastAutomaticRequest = now;
      void controller.requestPermission();
    }
  };
  on(window, 'touchend', askFromGesture, { capture: true });
  on(window, 'click', askFromGesture, { capture: true });
  const onOrientation: EventListener = event => {
    const e = event as DeviceOrientationEvent;
    if (!mobile || motionProfile === 'tap-only' || !permissionGranted || !Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;
    if (e.beta == null || e.gamma == null) return;
    if (!markSensor()) return;
    debugState.beta = e.beta;
    debugState.gamma = e.gamma;
    debugState.angle = angle();
    lastOrientationAt = performance.now();
    const tilt = screenTilt(e.beta, e.gamma, angle());
    trace.add({ type: 'orientation', at: lastOrientationAt, alpha: e.alpha, beta: e.beta, gamma: e.gamma, absolute: e.absolute, angle: angle() });
    calibration.observe({ at: lastOrientationAt, tilt });
    acceptGravity(orientationGravity(e.beta, e.gamma), lastOrientationAt);
  };
  on(window, 'deviceorientation', onOrientation);
  on(window, 'deviceorientationabsolute', onOrientation);
  const resetOrientation = () => { resetCalibration(); steeringHoldUntil = 0; };
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
    if (!markSensor()) return;
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
      twistThreshold: step === 'twist' ? 80 : thresholds.twistThreshold,
      spinAngle: step === 'spin' ? 280 : thresholds.spinAngle, spinMagnitude: step === 'spin' ? 2 : thresholds.spinMagnitude } : thresholds;
    const result = recognizeGesture(gestures, acceleration, now, motionProfile, gyro, trainingThresholds);
    gestures = result.state;
    // Reject transient steering samples during a gesture, but keep moving in
    // the last clean tilt direction. Attacks must never zero movement.
    if (result.pendingSwing || result.circleActive || (gyro && Math.hypot(gyro.alpha, gyro.beta, gyro.gamma) >= 80)) {
      steeringHoldUntil = now + 120;
    }
    debugState.spinDegrees = result.spinDegrees;
    debugState.spinMagnitude = result.spinMagnitude;
    debugState.spinGyroDegrees = result.spinGyroDegrees;
    calibration.observe({ at: now, acceleration, rotationRate: gyro, spinDegrees: result.spinDegrees,
      spinMagnitude: result.spinMagnitude, spinGyroDegrees: result.spinGyroDegrees, swingPeak: result.swingPeak });
    if (result.skill) { skill = true; notify('skill', 'spin', now); }
    else if (result.dash) { dash = true; notify('dash', 'twist', now); }
    else if (result.fired) notify('attack', 'swing', now);
    if (valid(includingGravity) && now - lastOrientationAt > 250) {
      // Safari and Android can use opposite gravity polarity. A face-up initial
      // reading establishes only polarity; no resting tilt is subtracted.
      if (!gravitySign && Math.abs(includingGravity.z) > 0.5) gravitySign = Math.sign(includingGravity.z);
      const sign = gravitySign || (/iPhone|iPad|iPod/.test(navigator.userAgent) ? -1 : 1);
      const magnitude = Math.hypot(includingGravity.x, includingGravity.y, includingGravity.z);
      if (magnitude >= 6 && magnitude <= 14) acceptGravity({ x: sign * includingGravity.x, y: sign * includingGravity.y, z: sign * includingGravity.z }, now);
    }
  }));

  const applyPermissionState = () => {
    const state = permissionSession.getState(motionProfile);
    needsPermission = state.needsPermission;
    permissionGranted = state.permission === 'granted' || state.permission === 'not-required';
    sensorStatus = state.sensorStatus;
    if (mobile) {
      if (motionProfile === 'tap-only') { mode = 'touch'; touch?.setJoystick(true); }
      else if (state.sensorStatus === 'off') {
        if (mode !== 'touch') fallback();
      } else {
        mode = 'motion'; touch?.setJoystick(false);
      }
    }
    debugState.mode = mode; debugState.sensors = sensorStatus;
    debugState.permission = state.permission === 'prompt' ? 'tap to enable' : state.permission;
  };

  const controller: InputController = {
    get mode() { return mode; },
    get needsPermission() { return needsPermission; },
    get sensorStatus() { return sensorStatus; },
    get motionProfile() { return motionProfile; },
    get tiltSensitivity() { return tiltSensitivity; },
    setTiltSensitivity(value) { saveTiltSensitivity(value); tiltSensitivity = loadTiltSensitivity(); },
    get profile(): GestureThresholds { return { ...thresholds, neutral: thresholds.neutral ? [...thresholds.neutral] : null }; },
    calibration, trace,
    get lastGesture() { return lastGesture; },
    setProfile(values) {
      thresholds = sanitizeThresholds(values, thresholds); saveThresholds(thresholds, motionProfile);
      reset(); resetCalibration(); moveGravity = null;
    },
    setMotionProfile(profile) {
      if (disposed || !isMotionProfile(profile)) return;
      if (profile === motionProfile) return;
      motionProfile = profile;
      saveMotionProfile(profile);
      thresholds = loadThresholds(profile);
      permissionVersion++;
      reset(); resetCalibration(); moveGravity = null;
      gravity = null; gravitySign = 0; lastOrientationAt = -Infinity;
        if (mobile) {
        mode = profile === 'tap-only' ? 'touch' : 'motion';
        sensorStatus = profile === 'tap-only' ? 'off' : 'waiting';
        needsPermission = profile !== 'tap-only' && requiresPermission && !permissionGranted;
        touch?.setJoystick(profile === 'tap-only');
      }
      debugState.mode = mode; debugState.sensors = sensorStatus; debugState.profile = profile;
      applyPermissionState();
      recordGesture(`profile → ${profile}; recalibrating`);
    },
    requestPermission() {
      if (disposed || !mobile || motionProfile === 'tap-only') return Promise.resolve(false);
      const version = permissionVersion;
      // Shared lobby/game session calls BOTH native methods before returning.
      const requested = permissionSession.request(motionProfile);
      return requested.then(granted => {
        if (disposed || version !== permissionVersion) return false;
        applyPermissionState(); return granted;
      });
    },
    calibrate() {
      resetCalibration();
      gravity = null;
      gravitySign = 0;
      gestures = createGestureState();
      steeringHoldUntil = 0;
      moveGravity = null; lastGravityAt = -Infinity;
      recordGesture('gravity filter refreshed (horizontal remains zero)');
    },
    sample() {
      const now = performance.now();
      if (settingsOpen) { reset(); return { seq: ++seq, move: [0, 0], aim: null, fire: false, dash: false, skill: false, source: mode }; }
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
        move = !moveGravity ? [0, 0] : gravityMove(moveGravity, angle(), 1, TILT_FULL_SPEED[tiltSensitivity]);
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
      debugState.move = move;
      debugState.sensors = sensorStatus;
      debugState.calibrating = false;
      const frame: InputFrame = { seq: ++seq, move, aim, fire, dash: !disposed && dash, skill: !disposed && skill, source: mode };
      dash = skill = false;
      trace.add({ type: 'input', at: now, move, source: mode, sensitivity: tiltSensitivity, horizontalFullSpeed: TILT_FULL_SPEED[tiltSensitivity], sensorStatus, permission: permissionSession.getState(motionProfile).permission });
      return frame;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
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
  cleanup.push(permissionSession.subscribe(applyPermissionState));
  if (mobile) startAutomaticTrace(trace, 'fight');
  else if (new URLSearchParams(window.location?.search).get('trace') === '1') trace.start();
  if (trace.active) trace.add({ type: 'gesture', at: performance.now(), kind: 'settings', profile: motionProfile, sensitivity: tiltSensitivity, fullSpeed: TILT_FULL_SPEED[tiltSensitivity], movement: 'horizontal-gravity-linear' });
  on(window, 'gitzilla:settings', e => { settingsOpen = !!(e as CustomEvent).detail?.open; reset(); });
  on(window, 'kaiju:motion-profile', () => { const next = loadMotionProfile(); if (next !== motionProfile) controller.setMotionProfile(next); });
  on(window, 'kaiju:gesture-trained', () => { controller.setProfile(loadThresholds(motionProfile)); });
  on(window, 'kaiju:tilt-sensitivity', () => { tiltSensitivity = loadTiltSensitivity(); });
  const debugPanel = window.location && new URLSearchParams(window.location.search).get('debug') === 'input'
    ? createInputDebugPanel() : null;
  if (debugPanel) document.body.append(debugPanel);
  return controller;
}

// Eager input import also covers the standalone lobby trainer, which never creates input.
installTrainingTrace();
