import type { XRHandle, XROptions, XRRenderer } from './types';

let active: XRHandle | null = null;
let entering = false;

export async function xrSupported(): Promise<boolean> {
  try { return !!(await globalThis.navigator?.xr?.isSessionSupported('immersive-vr')); }
  catch { return false; }
}

/** Call directly in the Enter button's click/pinch handler. requestSession happens
 * before the first await, preserving transient user activation on Safari. */
export async function enterXR(renderer: XRRenderer, options: XROptions = {}): Promise<XRHandle> {
  if (active || entering) throw new Error('An XR session is already active or starting');
  const xr = globalThis.navigator?.xr;
  if (!xr) throw new Error('WebXR immersive-vr is unavailable');
  entering = true;
  let session: XRSession | undefined;
  const wasEnabled = renderer.xr.enabled;
  try {
    session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'local', 'hand-tracking'] });
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
      renderer.setAnimationLoop(options.screenLoop ?? null);
      options.onEnd?.();
    };
    const handle: XRHandle = {
      session: liveSession, referenceSpace: space, referenceSpaceType: type,
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
      if (!ended && liveSession.visibilityState !== 'hidden') options.onFrame?.(time, frame);
    });
    return handle;
  } catch (error) {
    await session?.end().catch(() => {});
    renderer.xr.enabled = wasEnabled;
    renderer.setAnimationLoop(options.screenLoop ?? null);
    throw error;
  } finally { entering = false; }
}

export async function exitXR(handle: XRHandle | null = active): Promise<void> { await handle?.exit(); }
