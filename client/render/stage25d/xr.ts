import type { ImmersiveMode, XRHandle, XROptions, XRRenderer } from './types';

let active: XRHandle | null = null;
let entering = false;

export async function xrSupported(mode: ImmersiveMode = 'immersive-vr'): Promise<boolean> {
  try { return !!(await globalThis.navigator?.xr?.isSessionSupported(mode)); }
  catch { return false; }
}

/** A failed AR probe may consume Safari's user activation. UI can offer a fresh
 * VR click rather than claiming AR worked or silently retrying permission denial. */
export class XRRetryError extends Error {
  readonly retryMode = 'immersive-vr';
  constructor(cause: unknown) { super('AR is unavailable here. Tap again to enter VR.', { cause }); this.name = 'XRRetryError'; }
}

/** Call directly in the Enter button's click/pinch handler. requestSession happens
 * before the first await, preserving transient user activation on Safari. */
export async function enterXR(renderer: XRRenderer, options: XROptions = {}): Promise<XRHandle> {
  if (active || entering) throw new Error('An XR session is already active or starting');
  const xr = globalThis.navigator?.xr;
  if (!xr) throw new Error('WebXR immersive-vr is unavailable');
  entering = true;
  let session: XRSession | undefined;
  let mode = options.mode ?? 'immersive-vr';
  const wasEnabled = renderer.xr.enabled;
  const clearAlpha = renderer.getClearAlpha?.();
  try {
    const features = ['local-floor', 'local'];
    if (options.handTracking !== false) features.push('hand-tracking');
    if (mode === 'immersive-ar') features.push('hit-test', 'anchors', 'plane-detection');
    try { session = await xr.requestSession(mode, { optionalFeatures: features }); }
    catch (error) {
      if (mode !== 'immersive-ar' || options.fallbackToVR === false || (error as Error)?.name !== 'NotSupportedError') throw error;
      // Never auto-fallback a denied permission or a cancelled session.
      mode = 'immersive-vr';
      try { session = await xr.requestSession(mode, { optionalFeatures: features.filter(f => !['hit-test', 'anchors', 'plane-detection'].includes(f)) }); }
      catch (cause) {
        if ((cause as Error)?.name === 'NotAllowedError') throw new XRRetryError(cause);
        throw cause;
      }
    }
    let type: 'local-floor' | 'local' = 'local-floor';
    let space: XRReferenceSpace;
    try { space = await session.requestReferenceSpace('local-floor'); }
    catch {
      type = 'local'; space = await session.requestReferenceSpace('local');
      // local has its origin at the eyes, not the floor. Keep table placement
      // below eye level by providing an explicitly estimated floor reference.
      space = space.getOffsetReferenceSpace(new XRRigidTransform({ y: -(options.fallbackViewerHeight ?? 1.6) }));
    }
    renderer.xr.enabled = true;
    if (mode === 'immersive-ar') renderer.setClearAlpha?.(0);
    renderer.xr.setReferenceSpaceType(type);
    await renderer.xr.setSession(session);
    renderer.xr.setReferenceSpace(space);
    const liveSession = session;
    let ended = false;
    let ending: Promise<void> | undefined;
    const select = (event: XRInputSourceEvent) => {
      if (liveSession.visibilityState === 'hidden') return;
      let pose: XRPose | undefined;
      try { pose = event.frame.getPose(event.inputSource.targetRaySpace, space) ?? undefined; } catch { /* tracking lost */ }
      options.onSelect?.({ event, inputSource: event.inputSource, transient: event.inputSource.targetRayMode === 'transient-pointer', pose });
    };
    const visibility = () => options.onVisibilityChange?.(liveSession.visibilityState);
    const end = () => {
      if (ended) return;
      ended = true;
      liveSession.removeEventListener('select', select);
      liveSession.removeEventListener('visibilitychange', visibility);
      liveSession.removeEventListener('end', end);
      if (active === handle) active = null;
      renderer.xr.enabled = wasEnabled;
      if (clearAlpha !== undefined) renderer.setClearAlpha?.(clearAlpha);
      renderer.setAnimationLoop(options.screenLoop ?? null);
      options.onEnd?.();
    };
    const handle: XRHandle = {
      mode, session: liveSession, referenceSpace: space, referenceSpaceType: type,
      exit() {
        if (ended) return Promise.resolve();
        return ending ??= liveSession.end().catch(error => { ending = undefined; throw error; });
      },
    };
    liveSession.addEventListener('select', select);
    liveSession.addEventListener('visibilitychange', visibility);
    // three's end listener was installed first, so renderer cleanup precedes ours.
    liveSession.addEventListener('end', end);
    active = handle;
    renderer.setAnimationLoop((time, frame) => {
      if (ended || liveSession.visibilityState === 'hidden') return;
      if (frame && options.onHand) for (const source of liveSession.inputSources) {
        if (source.hand) options.onHand(source, frame, space);
      }
      options.onFrame?.(time, frame);
    });
    return handle;
  } catch (error) {
    await session?.end().catch(() => {});
    renderer.xr.enabled = wasEnabled;
    if (clearAlpha !== undefined) renderer.setClearAlpha?.(clearAlpha);
    renderer.setAnimationLoop(options.screenLoop ?? null);
    throw error;
  } finally { entering = false; }
}

export async function exitXR(handle: XRHandle | null = active): Promise<void> { await handle?.exit(); }
