import type { MotionProfile } from '../../shared/types';
import { loadMotionProfile } from './profiles';

export const MOTION_PERMISSION_EVENT = 'kaiju:motion-permission';
export const MOTION_PROFILE_EVENT = 'kaiju:motion-profile';
export interface MotionPermissionState {
  mobile: boolean;
  profile: MotionProfile;
  required: boolean;
  permission: 'prompt' | 'requesting' | 'granted' | 'denied' | 'not-required';
  needsPermission: boolean;
  sensorStatus: 'on' | 'waiting' | 'off';
  ready: boolean;
}
type SensorAPI = { requestPermission?: () => Promise<string> };
type SensorWindow = Window & { DeviceMotionEvent?: SensorAPI; DeviceOrientationEvent?: SensorAPI };

/** Page lifetime only. Native grants are NEVER read from or written to localStorage. */
export function createMotionPermissionSession() {
  const target = window as SensorWindow;
  const mobile = !!target.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const requiresNative = [target.DeviceMotionEvent, target.DeviceOrientationEvent].some(api => !!api?.requestPermission);
  let permission: MotionPermissionState['permission'] = requiresNative ? 'prompt' : 'not-required';
  let granted = !requiresNative;
  let sensorStatus: MotionPermissionState['sensorStatus'] = mobile ? 'waiting' : 'off';
  let lastSensorAt = -Infinity;
  let pending: Promise<boolean> | null = null;
  let disposed = false;
  let missingTimer: number | undefined;
  let lastPublished = '';
  const listeners = new Set<(state: MotionPermissionState) => void>();
  const cleanups: (() => void)[] = [];
  const on = (surface: EventTarget, type: string, handler: EventListener) => {
    surface.addEventListener(type, handler); cleanups.push(() => surface.removeEventListener(type, handler));
  };
  const state = (profile = loadMotionProfile()): MotionPermissionState => {
    const required = mobile && profile !== 'tap-only';
    return { mobile, profile, required, permission: required ? permission : 'not-required',
      needsPermission: required && requiresNative && !granted,
      sensorStatus: required ? sensorStatus : 'off', ready: !required || granted && sensorStatus === 'on' };
  };
  const publish = () => {
    const snapshot = state(); const key = JSON.stringify(snapshot);
    if (key === lastPublished) return;
    lastPublished = key;
    for (const listener of [...listeners]) listener({ ...snapshot });
    target.dispatchEvent(new CustomEvent(MOTION_PERMISSION_EVENT, { detail: { ...snapshot } }));
  };
  const waitForReadings = () => {
    target.clearTimeout(missingTimer);
    const since = performance.now();
    missingTimer = target.setTimeout(() => {
      if (!disposed && lastSensorAt < since) { sensorStatus = 'off'; publish(); }
    }, 1500);
  };
  const arrived = () => {
    if (disposed || !mobile || !granted || document.hidden) return;
    lastSensorAt = performance.now(); sensorStatus = 'on'; target.clearTimeout(missingTimer); publish();
  };
  const finite = (v: number | null | undefined) => v != null && Number.isFinite(v);
  const validVector = (v: DeviceMotionEventAcceleration | null) => !!v && finite(v.x) && finite(v.y) && finite(v.z);
  const orientation: EventListener = event => {
    const e = event as DeviceOrientationEvent;
    if (finite(e.beta) && finite(e.gamma)) arrived();
  };
  on(target, 'deviceorientation', orientation); on(target, 'deviceorientationabsolute', orientation);
  on(target, 'devicemotion', event => {
    const e = event as DeviceMotionEvent;
    if (validVector(e.acceleration) || validVector(e.accelerationIncludingGravity)
      || e.rotationRate && [e.rotationRate.alpha, e.rotationRate.beta, e.rotationRate.gamma].some(finite)) arrived();
  });
  on(target, MOTION_PROFILE_EVENT, publish);
  on(document, 'visibilitychange', () => {
    if (document.hidden) { sensorStatus = 'off'; lastSensorAt = -Infinity; publish(); }
    else if (mobile && granted) { sensorStatus = 'waiting'; waitForReadings(); publish(); }
  });
  on(target, 'pageshow', () => {
    if (mobile && granted && sensorStatus !== 'on') { sensorStatus = 'waiting'; waitForReadings(); publish(); }
  });
  const lostTimer = target.setInterval(() => {
    if (!disposed && sensorStatus === 'on' && performance.now() - lastSensorAt > 1800) { sensorStatus = 'off'; publish(); }
  }, 500);
  if (mobile && granted) waitForReadings();

  const api = {
    getState: state,
    subscribe(listener: (snapshot: MotionPermissionState) => void) {
      listeners.add(listener); listener({ ...state() }); return () => { listeners.delete(listener); };
    },
    /** Non-async: both native methods execute synchronously in the caller's onclick. */
    request(profile = loadMotionProfile()): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      if (!mobile || profile === 'tap-only') return Promise.resolve(!mobile);
      if (pending) return pending;
      if (granted && (!requiresNative || sensorStatus === 'on')) {
        if (sensorStatus !== 'on') { sensorStatus = 'waiting'; waitForReadings(); publish(); }
        return Promise.resolve(true);
      }
      granted = false; permission = 'requesting'; sensorStatus = 'waiting'; lastSensorAt = -Infinity;
      try {
        // Invoke native APIs BEFORE notifying subscribers (a subscriber might consume activation).
        const requests = [target.DeviceMotionEvent, target.DeviceOrientationEvent]
          .filter((sensor): sensor is SensorAPI => !!sensor?.requestPermission)
          .map(sensor => sensor.requestPermission!());
        const attempt = Promise.all(requests).then(results => {
          if (disposed) return false;
          granted = requests.length > 0 && results.every(result => result === 'granted');
          permission = granted ? 'granted' : 'denied';
          sensorStatus = granted ? 'waiting' : 'off';
          if (granted) waitForReadings();
          publish(); return granted;
        }).catch(() => {
          if (!disposed) { granted = false; permission = 'denied'; sensorStatus = 'off'; publish(); }
          return false;
        });
        pending = attempt;
        void attempt.then(() => { if (pending === attempt) pending = null; });
        publish(); return attempt;
      } catch {
        granted = false; permission = 'denied'; sensorStatus = 'off'; publish(); return Promise.resolve(false);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; target.clearTimeout(missingTimer); target.clearInterval(lostTimer);
      cleanups.forEach(fn => fn()); listeners.clear(); sensorStatus = 'off';
    },
  };
  return api;
}
export type MotionPermissionSession = ReturnType<typeof createMotionPermissionSession>;
const pages = new WeakMap<Window, MotionPermissionSession>();
export function getMotionPermissionSession(): MotionPermissionSession {
  let session = pages.get(window);
  if (!session) { session = createMotionPermissionSession(); pages.set(window, session); }
  return session;
}
export const getMotionPermissionState = (profile?: MotionProfile): MotionPermissionState => getMotionPermissionSession().getState(profile);
export const requestMotionPermission = (profile?: MotionProfile): Promise<boolean> => getMotionPermissionSession().request(profile);
export const subscribeMotionPermission = (listener: (snapshot: MotionPermissionState) => void): (() => void) => getMotionPermissionSession().subscribe(listener);
