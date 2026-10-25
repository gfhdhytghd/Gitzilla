import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMotionPermissionSession, getMotionPermissionState, requestMotionPermission, subscribeMotionPermission, MOTION_PERMISSION_EVENT } from './permission';
import { saveMotionProfile } from './profiles';
let target: EventTarget & Record<string, any>;
let doc: EventTarget & { hidden: boolean };
let clock = 0;
let sessions: ReturnType<typeof createMotionPermissionSession>[];
function emit(type: string, values: Record<string, unknown> = {}) {
  const event = new Event(type); for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
}
function page(request?: () => Promise<string>, mobile = true) {
  target = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: mobile }), setTimeout, clearTimeout, setInterval, clearInterval,
    DeviceMotionEvent: request ? { requestPermission: request } : {}, DeviceOrientationEvent: {} });
  vi.stubGlobal('window', target);
}
function session() { const s = createMotionPermissionSession(); sessions.push(s); return s; }
beforeEach(() => {
  vi.useFakeTimers(); clock = 0; vi.spyOn(performance, 'now').mockImplementation(() => clock);
  doc = Object.assign(new EventTarget(), { hidden: false }); vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', { maxTouchPoints: 0 });
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } });
  sessions = [];
});
afterEach(() => { sessions.forEach(s => s.dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('saved controlsChosen and motion preference never grant native permission on a new page', async () => {
  const request = vi.fn(async () => 'granted'); page(request);
  localStorage.setItem('kaiju.controlsChosen', '1'); saveMotionProfile('seated');
  expect(getMotionPermissionState()).toMatchObject({ profile: 'seated', required: true, needsPermission: true, ready: false, permission: 'prompt' });
  expect(request).not.toHaveBeenCalled();
  await requestMotionPermission(); emit('deviceorientation', { beta: 45, gamma: 0 });
  expect(getMotionPermissionState().ready).toBe(true);
  page(request); // browser reload = new Window identity, same saved preferences
  expect(getMotionPermissionState()).toMatchObject({ profile: 'seated', needsPermission: true, ready: false, permission: 'prompt' });
  emit('deviceorientation', { beta: 45, gamma: 0 }); expect(getMotionPermissionState().ready).toBe(false);
  expect(request).toHaveBeenCalledTimes(1);
  await requestMotionPermission(); emit('deviceorientation', { beta: 45, gamma: 0 });
  expect(request).toHaveBeenCalledTimes(2); expect(getMotionPermissionState().ready).toBe(true);
});
it('calls both native APIs before publishing requesting state, with no await or subscriber activation consumption first', async () => {
  const calls: string[] = [];
  page(() => { calls.push('motion'); return Promise.resolve('granted'); });
  target.DeviceOrientationEvent = { requestPermission: () => { calls.push('orientation'); return Promise.resolve('granted'); } };
  const s = session();
  s.subscribe(state => { if (state.permission === 'requesting') calls.push('notify'); });
  const request = s.request(); expect(calls).toEqual(['motion', 'orientation', 'notify']);
  expect(s.getState().ready).toBe(false); expect(await request).toBe(true); expect(s.getState().ready).toBe(false);
  emit('devicemotion', { acceleration: { x: null, y: null, z: null } }); expect(s.getState().ready).toBe(false);
  emit('devicemotion', { acceleration: { x: 0, y: 0, z: 0 } }); expect(s.getState().ready).toBe(true);
});
it('notifies subscribers and window events on real state changes, without spamming sensor frames', async () => {
  page(async () => 'granted');
  const listener = vi.fn(); const event = vi.fn(); target.addEventListener(MOTION_PERMISSION_EVENT, event);
  const unsub = subscribeMotionPermission(listener); expect(listener).toHaveBeenCalledTimes(1);
  await requestMotionPermission(); emit('deviceorientationabsolute', { beta: 45, gamma: 0 });
  expect(listener.mock.calls.at(-1)?.[0].ready).toBe(true);
  const count = listener.mock.calls.length;
  for (let i = 0; i < 100; i++) emit('deviceorientation', { beta: 45, gamma: i });
  expect(listener).toHaveBeenCalledTimes(count); expect((event.mock.calls.at(-1)?.[0] as CustomEvent).detail.ready).toBe(true);
  unsub(); saveMotionProfile('tap-only'); expect(listener).toHaveBeenCalledTimes(count);
});
it('Android has no native prompt and remains unready until actual events arrive', async () => {
  page(); const s = session();
  expect(s.getState()).toMatchObject({ permission: 'not-required', needsPermission: false, ready: false });
  expect(await s.request()).toBe(true); expect(s.getState().ready).toBe(false);
  emit('devicemotion', { rotationRate: { alpha: 0, beta: 0, gamma: 0 } }); expect(s.getState().ready).toBe(true);
});
it('sensor loss and return produce off/on events and gate readiness again', () => {
  page(); const s = session(); const listener = vi.fn(); s.subscribe(listener);
  emit('deviceorientation', { beta: 45, gamma: 0 }); expect(s.getState().ready).toBe(true);
  clock = 2200; vi.advanceTimersByTime(2200);
  expect(s.getState()).toMatchObject({ ready: false, sensorStatus: 'off' });
  emit('deviceorientation', { beta: 45, gamma: 0 }); expect(s.getState().ready).toBe(true);
  expect(listener.mock.calls.map(([snapshot]) => snapshot.ready)).toEqual([false, true, false, true]);
});
it('desktop and explicit tap-only profiles bypass the gate, without native requests', async () => {
  const request = vi.fn(async () => 'granted'); page(request, false);
  expect(session().getState()).toMatchObject({ required: false, ready: true }); expect(request).not.toHaveBeenCalled();
  page(request); saveMotionProfile('tap-only'); const s = session();
  expect(s.getState()).toMatchObject({ required: false, ready: true, sensorStatus: 'off' });
  expect(await s.request()).toBe(false); expect(request).not.toHaveBeenCalled();
  saveMotionProfile('standard'); expect(s.getState()).toMatchObject({ required: true, ready: false, needsPermission: true });
});
it('pending native permission ignores readings, and denied native results can be retried', async () => {
  let resolve!: (value: string) => void;
  const request = vi.fn(() => new Promise<string>(r => { resolve = r; })); page(request); const s = session();
  const first = s.request(); emit('deviceorientation', { beta: 45, gamma: 0 }); expect(s.getState().ready).toBe(false);
  resolve('denied'); expect(await first).toBe(false); expect(s.getState()).toMatchObject({ permission: 'denied', needsPermission: true, ready: false });
  const second = s.request(); expect(request).toHaveBeenCalledTimes(2); resolve('granted'); await second;
  expect(s.getState().ready).toBe(false); emit('deviceorientation', { beta: 45, gamma: 0 }); expect(s.getState().ready).toBe(true);
});
it('hiding and resuming a page require fresh delivery before ready returns', () => {
  page(); const s = session(); emit('deviceorientation', { beta: 45, gamma: 0 });
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); expect(s.getState().ready).toBe(false);
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); expect(s.getState().ready).toBe(false);
  emit('deviceorientation', { beta: 45, gamma: 0 }); expect(s.getState().ready).toBe(true);
});

it('desktop-UA iPad with touch and a fine pointer still requires a native grant plus fresh readings',async()=>{
 page(async()=> 'granted',false);
 vi.stubGlobal('navigator',{platform:'MacIntel',userAgent:'Macintosh Safari',maxTouchPoints:5});
 const s=session();expect(s.getState()).toMatchObject({mobile:true,required:true,needsPermission:true,ready:false});
 await s.request();expect(s.getState().ready).toBe(false);
 emit('deviceorientation',{beta:0,gamma:-15});expect(s.getState().ready).toBe(true);
});
