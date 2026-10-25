import { afterEach, expect, it, vi } from 'vitest';
import { enterXR, exitXR, xrSupported, XRRetryError } from './xr';
import type { XRRenderer } from './types';

class Session extends EventTarget {
  inputSources: unknown[] = [];
  visibilityState = 'visible';
  floor = true;
  requestReferenceSpace = vi.fn(async (type: string) => { if (type === 'local-floor' && !this.floor) throw new Error('No floor'); return { type, getOffsetReferenceSpace: (offset: unknown) => ({ type, offset }) }; });
  end = vi.fn(async () => { this.dispatchEvent(new Event('end')); });
}
function setup(floor = true) {
  const session = new Session(); session.floor = floor;
  const requestSession = vi.fn(async (_mode: XRSessionMode, _options?: XRSessionInit) => session);
  vi.stubGlobal('navigator', { xr: { isSessionSupported: vi.fn(async () => true), requestSession } });
  vi.stubGlobal('XRRigidTransform', class { constructor(public position: unknown) {} });
  const renderer = { xr: { enabled: false, setReferenceSpaceType: vi.fn(), setReferenceSpace: vi.fn(), setSession: vi.fn(async () => {}) }, setAnimationLoop: vi.fn() };
  return { session, requestSession, renderer, r: renderer as unknown as XRRenderer };
}
afterEach(async () => { await exitXR(); vi.unstubAllGlobals(); });

it('feature-detects unavailable/rejecting XR without throwing', async () => {
  vi.stubGlobal('navigator', {}); expect(await xrSupported()).toBe(false);
  vi.stubGlobal('navigator', { xr: { isSessionSupported: async () => { throw new Error('denied'); } } });
  expect(await xrSupported()).toBe(false);
});

it('requests synchronously, configures local-floor, dispatches transient UI select, pauses hidden frames and restores screen loop', async () => {
  const { session, requestSession, renderer, r } = setup();
  const onFrame = vi.fn(), onSelect = vi.fn(), onEnd = vi.fn(), screenLoop = vi.fn(), onVisibilityChange = vi.fn();
  const pending = enterXR(r, { onFrame, onSelect, onEnd, screenLoop, onVisibilityChange });
  expect(requestSession).toHaveBeenCalledTimes(1); // before any awaited continuation
  await expect(enterXR(r)).rejects.toThrow('already');
  const handle = await pending;
  expect(handle.referenceSpaceType).toBe('local-floor'); expect(renderer.xr.enabled).toBe(true);
  const loop = renderer.setAnimationLoop.mock.calls.at(-1)![0] as Function;
  loop(10, {}); expect(onFrame).toHaveBeenCalledTimes(1);
  const event = Object.assign(new Event('select'), { frame: { getPose: () => ({ transform: 'ray' }) }, inputSource: { targetRayMode: 'transient-pointer', targetRaySpace: {} } });
  session.dispatchEvent(event); expect(onSelect.mock.calls[0][0].transient).toBe(true);
  expect(onSelect.mock.calls[0][0].pose).toEqual({ transform: 'ray' });
  session.visibilityState = 'hidden'; session.dispatchEvent(new Event('visibilitychange')); loop(20, {}); session.dispatchEvent(event);
  expect(onVisibilityChange).toHaveBeenCalledWith('hidden'); expect(onFrame).toHaveBeenCalledTimes(1); expect(onSelect).toHaveBeenCalledTimes(1);
  session.visibilityState = 'visible'; loop(30, {}); expect(onFrame).toHaveBeenCalledTimes(2);
  await Promise.all([handle.exit(), exitXR(handle)]); expect(session.end).toHaveBeenCalledTimes(1);
  expect(renderer.xr.enabled).toBe(false); expect(renderer.setAnimationLoop).toHaveBeenLastCalledWith(screenLoop);
  expect(onEnd).toHaveBeenCalledTimes(1); session.dispatchEvent(event); expect(onSelect).toHaveBeenCalledTimes(1);
});

it('falls back to local and cleans up native-initiated end', async () => {
  const { r, renderer, session } = setup(false), onEnd = vi.fn();
  const handle = await enterXR(r, { onEnd }); expect(handle.referenceSpaceType).toBe('local');
  expect((handle.referenceSpace as any).offset.position.y).toBe(-1.6);
  expect(renderer.xr.setReferenceSpaceType).toHaveBeenCalledWith('local');
  session.dispatchEvent(new Event('end')); expect(onEnd).toHaveBeenCalledTimes(1);
  await handle.exit(); expect(session.end).not.toHaveBeenCalled();
});

it('cleans a failed renderer setup and permits a fresh retry', async () => {
  const { r, renderer, session } = setup();
  renderer.xr.setSession.mockRejectedValueOnce(new Error('GL unavailable'));
  await expect(enterXR(r)).rejects.toThrow('GL unavailable'); expect(session.end).toHaveBeenCalledTimes(1);
  expect(renderer.xr.enabled).toBe(false);
  await enterXR(r); await exitXR();
});

it('requests optional AR sensing and safely falls back only after unsupported AR', async () => {
  const { requestSession, r } = setup();
  requestSession.mockRejectedValueOnce(new DOMException('unsupported', 'NotSupportedError'));
  const handle = await enterXR(r, { mode: 'immersive-ar' });
  expect(handle.mode).toBe('immersive-vr');
  expect(requestSession.mock.calls[0]).toEqual(['immersive-ar', { optionalFeatures: ['local-floor', 'local', 'hand-tracking', 'hit-test', 'anchors', 'plane-detection'] }]);
  expect(requestSession.mock.calls[1][0]).toBe('immersive-vr');
});

it('does not retry permission denial and signals when fallback needs a new user gesture', async () => {
  const { requestSession, r } = setup();
  requestSession.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
  await expect(enterXR(r, { mode: 'immersive-ar' })).rejects.toMatchObject({ name: 'NotAllowedError' });
  expect(requestSession).toHaveBeenCalledTimes(1);
  requestSession.mockRejectedValueOnce(new DOMException('unsupported', 'NotSupportedError'));
  requestSession.mockRejectedValueOnce(new DOMException('activation expired', 'NotAllowedError'));
  await expect(enterXR(r, { mode: 'immersive-ar' })).rejects.toBeInstanceOf(XRRetryError);
});

it('routes granted hands to pose callbacks without synthesizing select events', async () => {
  const { session, r, renderer } = setup(); const onHand = vi.fn(), onSelect = vi.fn();
  session.inputSources = [{ hand: new Map(), handedness: 'left' }, { targetRayMode: 'transient-pointer' }];
  const handle = await enterXR(r, { onHand, onSelect });
  const loop = renderer.setAnimationLoop.mock.calls.at(-1)![0] as Function;
  const frame = {}; loop(1, frame);
  expect(onHand).toHaveBeenCalledTimes(1);
  expect(onHand).toHaveBeenCalledWith(session.inputSources[0], frame, handle.referenceSpace);
  expect(onSelect).not.toHaveBeenCalled();
});

it('makes AR compositor clear transparent and restores it on session end', async () => {
  const { r } = setup();
  const getClearAlpha = vi.fn(() => 1), setClearAlpha = vi.fn();
  Object.assign(r, { getClearAlpha, setClearAlpha });
  const handle = await enterXR(r, { mode: 'immersive-ar' });
  expect(handle.mode).toBe('immersive-ar'); expect(setClearAlpha).toHaveBeenCalledWith(0);
  await handle.exit(); expect(setClearAlpha).toHaveBeenLastCalledWith(1);
});
