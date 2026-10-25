/** Explicit plumbing fixture, not the stage artwork/gallery or gameplay. */
import { XRDevice, metaQuest3 } from 'iwer';
import { BoxGeometry, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, WebGLRenderer } from 'three';
import { createCameraRig, getXRPlacement } from '../client/render/stage25d/projection';
import { createInstancePool, createTextureCache } from '../client/render/stage25d/pool';
import { enterXR, exitXR, xrSupported } from '../client/render/stage25d/xr';
import { createSurfacePlacement, exportSpatialUSDZ, detectSpatialSupport, chooseSpatialMode } from '../client/render/stage25d/spatial';
import type { SurfacePlacement } from '../client/render/stage25d/spatial';
import type { XRHandle, XRScale } from '../client/render/stage25d/types';
import { installIWERReferenceSpaceCompatibility } from './iwer-compat';

const localOnly = new URLSearchParams(location.search).has('local-only');
const ar = new URLSearchParams(location.search).has('ar');
const noHitTest = new URLSearchParams(location.search).has('no-hit-test');
const device = new XRDevice({ ...metaQuest3, supportedFeatures: metaQuest3.supportedFeatures.filter(f => (!localOnly || f !== 'local-floor') && (!noHitTest || f !== 'hit-test')), internalNominalFrameRate: 90 }, { stereoEnabled: true });
device.installRuntime({ forceInstall: true, polyfillLayers: false });
installIWERReferenceSpaceCompatibility();
/** Synthetic table environment plugged into IWER's public SEM interface. Actual
 * XRSession hit-test/anchor APIs remain IWER, not stubbed frame results. */
class TableEnvironment {
  version = 'tools-synthetic-table'; environmentCanvas = document.createElement('canvas');
  planesVisible = false; boundingBoxesVisible = false; meshesVisible = false;
  trackedPlanes = new Set<never>(); trackedMeshes = new Set<never>();
  render() {} loadEnvironment() {} loadDefaultEnvironment() {} deleteAll() {}
  computeDepthBuffer() { return null; }
  computeHitTestResults(ray: ArrayLike<number>) {
    const t = (0.75 - ray[13]) / -ray[9];
    if (Math.abs(ray[9]) < 1e-6 || t < 0 || t > 5) return [];
    const x = ray[12] - ray[8] * t, z = ray[14] - ray[10] * t;
    if (Math.abs(x) > 2 || Math.abs(z) > 3) return [];
    return [new Float32Array(new Matrix4().makeTranslation(x, 0.75, z).elements)];
  }
}
if (ar) {
  device.installSEM(TableEnvironment);
  device.quaternion.set(-Math.sin(Math.PI / 9), 0, 0, Math.cos(Math.PI / 9));
  device.controllers.right!.quaternion.set(-Math.sin(Math.PI / 9), 0, 0, Math.cos(Math.PI / 9));
}
const renderer = new WebGLRenderer({ antialias: false }); renderer.setSize(960, 640);
document.body.append(renderer.domElement);
const scene = new Scene(), root = new Group(); scene.add(root);
const rig = createCameraRig({ width: 960, height: 640, worldWidth: 480, worldHeight: 288 });
const cache = createTextureCache(4), canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#235b63'; ctx.fillRect(0, 0, 64, 64);
ctx.fillStyle = '#81d8a0'; ctx.fillRect(4, 4, 16, 16);
const texture = cache.get('floor', 'unchanged', canvas), textureVersion = texture.version;
const floor = new Mesh(new PlaneGeometry(480, 288), new MeshBasicMaterial({ map: texture, side: DoubleSide }));
floor.rotation.x = -Math.PI / 2; floor.position.set(240, 0, 144); root.add(floor);
const bullets = createInstancePool(new BoxGeometry(3, 3, 3), new MeshBasicMaterial(), 256);
const shadows = createInstancePool(new PlaneGeometry(5, 5), new MeshBasicMaterial({ color: 0x111111, side: DoubleSide }), 256);
root.add(bullets.mesh, shadows.mesh);
let handle: XRHandle | undefined;
let surface: SurfacePlacement | undefined;
let previousTime = 0;
const state = { supported: false, frames: 0, screenFrames: 0, times: [] as number[], renderTimes: [] as number[], views: 0, selects: 0,
  transientSelects: 0, visibility: [] as string[], ended: 0, reference: '', error: '', presenting: false, textureStable: true,
  viewerHeight: null as number | null,
  mode: '', surfaceStatus: '', surfaceSource: '', anchored: false, surfaceY: 0, handFrames: 0, handJointPoses: 0, modelSupported: false, usdzBytes: 0, usdzType: '', usdzHeader: [] as number[],
  rootScale: 0,
  scale: 'table' as XRScale, placement: getXRPlacement({ worldWidth: 480, worldHeight: 288 }),
  poolBuffersStable: true, synthetic: 'IWER2.5.0 + tools-only minimal geometry; not production artwork or physical Vision Pro' };
const matrixArray = bullets.mesh.instanceMatrix.array, colorArray = bullets.mesh.instanceColor!.array;
function placement(mode: XRScale) {
  state.scale = mode; state.placement = getXRPlacement({ worldWidth: 480, worldHeight: 288, mode });
  if (surface?.status === 'placed') {
    surface.setTableWidth(mode === 'table' ? 1.2 : 480 * 1.7 / 28);
    root.matrixAutoUpdate = false; root.matrix.copy(surface.matrix);
  } else { root.scale.setScalar(state.placement.scale); root.position.copy(state.placement.position); }
}
function render(time: number, frame?: XRFrame) {
  const before = performance.now();
  bullets.begin(); shadows.begin();
  for (let i = 0; i < 128; i++) {
    const x = 20 + (i * 13 + time * 0.02) % 440, y = 20 + i * 7 % 248;
    bullets.add(x, 14, y, 1, 1, 1, 0, 0, 0, 0x81ffbd);
    shadows.add(x, 0.1, y, 1, 1, 1, -Math.PI / 2);
  }
  bullets.end(); shadows.end();
  cache.get('floor', 'unchanged', canvas);
  state.textureStable &&= texture.version === textureVersion;
  state.poolBuffersStable &&= matrixArray === bullets.mesh.instanceMatrix.array && colorArray === bullets.mesh.instanceColor!.array;
  renderer.render(scene, rig.camera);
  state.rootScale = Math.hypot(root.matrix.elements[0], root.matrix.elements[1], root.matrix.elements[2]);
  if (frame) {
    surface?.update(frame);
    if (surface) {
      state.surfaceStatus = surface.status; state.surfaceSource = surface.source; state.anchored = surface.anchored; state.surfaceY = surface.surface.elements[13];
      if (surface.status === 'placed') { root.matrixAutoUpdate = false; root.matrix.copy(surface.matrix); }
    }
    if (handle && state.viewerHeight === null) state.viewerHeight = frame.getViewerPose(handle.referenceSpace)?.transform.position.y ?? null;
    state.frames++; if (previousTime) state.times.push(time - previousTime); previousTime = time;
    state.views = renderer.xr.getCamera().cameras.length;
    state.renderTimes.push(performance.now() - before);
  } else state.screenFrames++;
}
renderer.setAnimationLoop(render);
const api = {
  state,
  async start() {
    handle = await enterXR(renderer, { onFrame: render, screenLoop: render,
      mode: ar ? 'immersive-ar' : 'immersive-vr',
      onSelect(info) { state.selects++; if (info.transient) state.transientSelects++; surface?.select(info); },
      onHand(source, frame, space) {
        state.handFrames++;
        const wrist = source.hand?.get('wrist');
        if (wrist && frame.getJointPose?.(wrist, space)) state.handJointPoses++;
      },
      onVisibilityChange(s) { state.visibility.push(s); previousTime = 0; },
      onEnd() { state.ended++; state.presenting = false; root.matrixAutoUpdate = true; root.scale.setScalar(1); root.position.set(0, 0, 0); },
    });
    state.mode = handle.mode; state.reference = handle.referenceSpaceType; state.presenting = renderer.xr.isPresenting; placement('table');
    surface = await createSurfacePlacement(handle, { worldWidth: 480, worldHeight: 288 });
  },
  stop: () => exitXR(handle),
  setScale: placement,
  select: () => device.remote.dispatch('select', { device: 'controller-right', duration: 0.1 }),
  hands() { device.primaryInputMode = 'hand'; },
  controllers() { device.primaryInputMode = 'controller'; },
  async exportUSDZ() {
    const blob = await exportSpatialUSDZ(root, { metersPerPixel: 1.2 / 480, includeDecorations: true });
    state.usdzBytes = blob.size; state.usdzType = blob.type; state.usdzHeader = Array.from(new Uint8Array(await blob.slice(0, 4).arrayBuffer()));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  },
  /** Extra explicit event injection covers visionOS's targetRayMode branch; IWER
   * controller select above remains a separate runtime-generated check. */
  transientSelect() {
    const session = handle!.session;
    session.requestAnimationFrame((_time, frame) => {
      const source = session.inputSources[0];
      const event = Object.assign(new Event('select'), { frame, inputSource: { targetRayMode: 'transient-pointer', targetRaySpace: source.targetRaySpace } });
      session.dispatchEvent(event);
    });
  },
  hide() { device.updateVisibilityState('hidden'); },
  show() { device.updateVisibilityState('visible'); },
  async destroy() { surface?.dispose(); await exitXR(handle); renderer.setAnimationLoop(null); bullets.dispose(true); shadows.dispose(true); cache.dispose(); floor.geometry.dispose(); (floor.material as MeshBasicMaterial).dispose(); renderer.dispose(); device.uninstallRuntime(); },
};
Object.assign(window, { __xrCheck: api });
document.getElementById('enter')!.onclick = () => { void api.start().catch(error => { state.error = String(error); }); };
const support = await detectSpatialSupport(); state.modelSupported = support.model;
state.supported = ar ? chooseSpatialMode(support) === 'immersive-ar' : await xrSupported();
