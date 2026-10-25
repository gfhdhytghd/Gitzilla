import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { TABLE_HEIGHT_METERS } from './height';
import type { Camera } from 'three';
import type { CameraRig, CameraRigOptions, Point2, ProjectedPoint, StageView, XRPlacement, XRPlacementOptions } from './types';

const point = new Vector3(), ray = new Vector3();
const radians = Math.PI / 180;
const positive = (n: number, name: string) => {
  if (!Number.isFinite(n) || n <= 0) throw new RangeError(`${name} must be positive`);
  return n;
};

/** Height is up; logical world y becomes three's z (south). Reuse out in hot loops. */
export function worldToScreen(camera: Camera, width: number, height: number, x: number, y: number, z = 0,
  out: ProjectedPoint = { x: 0, y: 0, scale: 0 }): ProjectedPoint {
  point.set(x, z, y).applyMatrix4(camera.matrixWorldInverse);
  const depth = -point.z;
  point.applyMatrix4(camera.projectionMatrix);
  out.x = (point.x + 1) * width / 2;
  out.y = (1 - point.y) * height / 2;
  out.scale = depth > 0 ? height * camera.projectionMatrix.elements[5] / (2 * depth) : NaN;
  return out;
}

/** Ray intersection with the actual floor, not a screen-depth approximation. */
export function screenToWorld(camera: Camera, width: number, height: number, sx: number, sy: number,
  out: Point2 = { x: 0, y: 0 }): Point2 {
  point.setFromMatrixPosition(camera.matrixWorld);
  ray.set(sx / width * 2 - 1, 1 - sy / height * 2, 0.5).unproject(camera).sub(point);
  const t = -point.y / ray.y;
  if (Math.abs(ray.y) < 1e-9 || t < 0 || !Number.isFinite(t)) { out.x = out.y = NaN; return out; }
  out.x = point.x + ray.x * t;
  out.y = point.z + ray.z * t;
  return out;
}

export function createCameraRig(options: CameraRigOptions): CameraRig {
  let width = positive(options.width, 'width'), height = positive(options.height, 'height');
  let worldWidth = positive(options.worldWidth, 'worldWidth'), worldHeight = positive(options.worldHeight, 'worldHeight');
  const pitch = Math.min(80, Math.max(15, options.pitch ?? 42)) * radians;
  const fov = Math.min(100, Math.max(20, options.fov ?? 45));
  const camera = new PerspectiveCamera(fov, width / height, 0.1, 10000);
  const target = new Vector3();
  let logicalWidth = width, logicalHeight = height;
  let lastView: StageView | undefined;
  function update(view?: StageView) {
    lastView = view;
    logicalWidth = view ? positive(view.w, 'view.w') : width;
    logicalHeight = view ? positive(view.h, 'view.h') : height;
    // App View is already smoothed; don't add a second follow filter/latency.
    const follow = options.phone && view;
    const w = follow ? positive(view.w, 'view.w') : worldWidth;
    const h = follow ? positive(view.h, 'view.h') : worldHeight;
    target.set(follow ? view.x + w / 2 : w / 2, 0, follow ? view.y + h / 2 : h / 2);
    const tanV = Math.tan(fov * radians / 2), tanH = tanV * logicalWidth / logicalHeight;
    // Fit all four perspective corners, including the larger near edge.
    const distance = h / 2 * Math.cos(pitch) + 1.1 * Math.max(w / 2 / tanH, h / 2 * Math.sin(pitch) / tanV);
    camera.position.set(target.x, distance * Math.sin(pitch), target.z + distance * Math.cos(pitch));
    camera.far = Math.max(10000, distance * 5);
    camera.aspect = logicalWidth / logicalHeight;
    camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }
  update();
  return {
    camera, update,
    resize(w, h) { width = positive(w, 'width'); height = positive(h, 'height'); update(lastView); },
    setWorld(w, h) { worldWidth = positive(w, 'worldWidth'); worldHeight = positive(h, 'worldHeight'); update(lastView); },
    worldToScreen: (x, y, z, out) => worldToScreen(camera, logicalWidth, logicalHeight, x, y, z, out),
    screenToWorld: (sx, sy, out) => screenToWorld(camera, logicalWidth, logicalHeight, sx, sy, out),
  };
}

/** Apply to a root Group; XR tracking camera stays in native meter reference space. */
export function getXRPlacement(options: XRPlacementOptions): XRPlacement {
  const w = positive(options.worldWidth, 'worldWidth'), h = positive(options.worldHeight, 'worldHeight');
  const life = options.mode === 'life';
  const scale = life ? positive(options.metersPerPixel ?? 1.7 / 28, 'metersPerPixel') : positive(options.tableWidth ?? 1.2, 'tableWidth') / w;
  const centerX = options.follow?.x ?? w / 2;
  const centerY = options.follow?.y ?? (life ? h : h / 2);
  return { scale, position: { x: -centerX * scale, y: life ? 0 : options.tableHeight ?? TABLE_HEIGHT_METERS,
    z: -centerY * scale - (options.distance ?? (life ? 0.5 : 1.3)) } };
}

/** Center the arena on an actual meter-space surface pose. Uniform scale and
 * rotation come from the surface, never from the headset's tracking camera. */
export function surfacePlacementMatrix(surface: Matrix4, worldWidth: number, worldHeight: number,
  tableWidth = 1.2, out = new Matrix4()): Matrix4 {
  const scale = positive(tableWidth, 'tableWidth') / positive(worldWidth, 'worldWidth');
  positive(worldHeight, 'worldHeight');
  // scale + local translation in one matrix, avoiding temporary matrix objects.
  out.set(scale, 0, 0, -worldWidth * scale / 2,
    0, scale, 0, 0.002,
    0, 0, scale, -worldHeight * scale / 2,
    0, 0, 0, 1);
  return out.premultiply(surface);
}
