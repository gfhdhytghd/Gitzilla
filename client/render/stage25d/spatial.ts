/** Optional spatial web facilities. None of these are required to play/spectate.
 * Vision Pro currently uses VR + native model; AR hit-test is progressive. */
import { Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Texture, TextureSource, Vector3 } from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import type { ImmersiveMode, SpatialSupport, XRHandle, XRSelectInfo } from './types';
import { surfacePlacementMatrix } from './projection';
import { xrSupported } from './xr';
import { bakeVoxelExport, isVoxelExport } from './spatial-voxel';

interface NativeModelElement extends HTMLElement {
  ready: Promise<unknown>;
  requestImmersive?: () => Promise<void>;
}
export function modelSupported(doc = globalThis.document): boolean {
  return !!doc && 'ready' in doc.createElement('model');
}
/** Probe before showing entry buttons, never await detection inside a click. */
export async function detectSpatialSupport(doc = globalThis.document): Promise<SpatialSupport> {
  const [vr, ar] = await Promise.all([xrSupported(), xrSupported('immersive-ar')]);
  const model = modelSupported(doc);
  return { vr, ar, model, modelImmersive: model && 'requestImmersive' in doc.createElement('model') };
}
export function chooseSpatialMode(support: Pick<SpatialSupport, 'ar' | 'vr'>, preferAR = true): ImmersiveMode | null {
  if (preferAR && support.ar) return 'immersive-ar';
  return support.vr ? 'immersive-vr' : support.ar ? 'immersive-ar' : null;
}

export interface SurfaceOptions {
  worldWidth: number; worldHeight: number; tableWidth?: number;
  /** Manual fallback is explicitly estimated, never reported as detected. */
  estimatedHeight?: number;
  onChange?: (placement: SurfacePlacement) => void;
}
export interface SurfacePlacement {
  status: 'virtual' | 'searching' | 'candidate' | 'manual' | 'placed' | 'disposed';
  source: 'virtual' | 'hit-test' | 'estimated-plane';
  /** Reused matrices in XR reference-space meters. Root matrix includes scale. */
  matrix: Matrix4;
  surface: Matrix4;
  anchored: boolean;
  /** True only for a fresh hit in this frame; never a stale cached surface. */
  hasHit: boolean;
  update(frame: XRFrame): void;
  /** Returns true when placement consumes a UI select; no gameplay control. */
  select(info: XRSelectInfo): boolean;
  /** Rescale around the same real-surface center; do not move the XR camera. */
  setTableWidth(meters: number): void;
  reset(): void;
  dispose(): void;
}

/** Creates only optional per-session hit-test resources. Call update from onFrame
 * and select from onSelect; apply matrix to the scene root after status=placed. */
export async function createSurfacePlacement(handle: XRHandle, options: SurfaceOptions): Promise<SurfacePlacement> {
  const session = handle.session, reference = handle.referenceSpace;
  const matrix = new Matrix4(), surface = new Matrix4(), ray = new Vector3(), origin = new Vector3();
  let hitSource: XRHitTestSource | undefined, anchor: XRAnchor | undefined;
  let disposed = false, generation = 0;
  let tableWidth = options.tableWidth;
  const notify = () => options.onChange?.(placement);
  const compose = () => surfacePlacementMatrix(surface, options.worldWidth, options.worldHeight, tableWidth, matrix);
  const horizontal = (pose: XRPose) => pose.transform.matrix[5] > 0.7;
  let hitPose: XRPose | undefined;
  const currentHit = (frame: XRFrame) => {
    hitPose = undefined;
    if (!hitSource || typeof frame.getHitTestResults !== 'function') return;
    for (const hit of frame.getHitTestResults(hitSource)) {
      const pose = hit.getPose(reference);
      if (pose && horizontal(pose)) { hitPose = pose; return hit; }
    }
  };
  const placement: SurfacePlacement = {
    status: handle.mode === 'immersive-ar' ? 'searching' : 'virtual',
    source: handle.mode === 'immersive-ar' ? 'estimated-plane' : 'virtual',
    matrix, surface, anchored: false, hasHit: false,
    update(frame) {
      if (disposed || handle.mode !== 'immersive-ar') return;
      if (anchor) {
        const pose = frame.getPose(anchor.anchorSpace, reference);
        if (pose) { surface.fromArray(pose.transform.matrix); compose(); }
        return;
      }
      if (placement.status === 'placed') return;
      const result = currentHit(frame);
      const prior = placement.status;
      placement.hasHit = !!result;
      if (result) {
        surface.fromArray(hitPose!.transform.matrix); compose();
        placement.status = 'candidate'; placement.source = 'hit-test';
      } else {
        placement.status = hitSource ? 'searching' : 'manual'; placement.source = 'estimated-plane';
      }
      if (prior !== placement.status) notify();
    },
    select(info) {
      if (disposed || placement.status === 'placed' || handle.mode !== 'immersive-ar' || session.visibilityState === 'hidden') return false;
      const result = currentHit(info.event.frame);
      if (result) {
        surface.fromArray(hitPose!.transform.matrix); placement.source = 'hit-test'; placement.hasHit = true;
      } else {
        // A tap may place on an estimated horizontal plane when sensing is absent.
        // With hit-test active, a missing hit must not magically become a real table.
        if (hitSource || !info.pose) return false;
        surface.fromArray(info.pose.transform.matrix);
        origin.setFromMatrixPosition(surface); ray.set(0, 0, -1).transformDirection(surface);
        const t = ((options.estimatedHeight ?? 0.9) - origin.y) / ray.y;
        if (Math.abs(ray.y) < 1e-6 || t < 0 || t > 10 || !Number.isFinite(t)) return false;
        surface.makeTranslation(origin.x + ray.x * t, options.estimatedHeight ?? 0.9, origin.z + ray.z * t);
        placement.source = 'estimated-plane'; placement.hasHit = false;
      }
      compose(); placement.status = 'placed'; notify();
      if (result?.createAnchor) {
        const version = generation;
        void result.createAnchor().then(created => {
          if (disposed || version !== generation) { created.delete(); return; }
          anchor = created; placement.anchored = true; notify();
        }).catch(() => { /* hit placement remains valid without an anchor grant */ });
      }
      return true;
    },
    setTableWidth(meters) {
      if (disposed) return;
      if (!Number.isFinite(meters) || meters <= 0) throw new RangeError('tableWidth must be positive');
      tableWidth = meters; compose(); notify();
    },
    reset() {
      if (disposed) return;
      generation++; anchor?.delete(); anchor = undefined; placement.anchored = false; placement.hasHit = false;
      placement.status = handle.mode === 'immersive-ar' ? hitSource ? 'searching' : 'manual' : 'virtual'; notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true; generation++; hitSource?.cancel(); anchor?.delete();
      placement.anchored = placement.hasHit = false; placement.status = 'disposed';
      session.removeEventListener('end', placement.dispose); notify();
    },
  };
  // End can happen while an optional async source request is still in flight.
  session.addEventListener('end', placement.dispose);
  if (handle.mode === 'immersive-ar' && session.requestHitTestSource) {
    try {
      const viewer = await session.requestReferenceSpace('viewer');
      const source = await session.requestHitTestSource({ space: viewer, entityTypes: ['plane'] });
      if (disposed) source?.cancel(); else hitSource = source;
    } catch { /* optional hit-test feature not granted */ }
  }
  if (!disposed && handle.mode === 'immersive-ar') placement.status = hitSource ? 'searching' : 'manual';
  notify();
  return placement;
}

export interface SpatialExportOptions { metersPerPixel?: number; maxInstances?: number; maxVoxelPixels?: number }
/** Expand instancing and normalize materials for three's USDZExporter. This is an
 * explicit frozen snapshot, never a per-frame export or mutation of live art. */
export function prepareSpatialSnapshot(source: Object3D, options: SpatialExportOptions = {}) {
  const root = new Group(), materials = new Set<Material>(), matrix = new Matrix4(), tint = new Color();
  const geometries = new Map<BufferGeometry, BufferGeometry>(), textures = new Map<Texture, Texture>();
  const atlasGeometries = new Set<BufferGeometry>();
  const voxelPixels = new Map();
  let voxelCount = 0;
  const meterScale = options.metersPerPixel ?? 1;
  if (!Number.isFinite(meterScale) || meterScale <= 0) throw new RangeError('metersPerPixel must be positive');
  root.scale.setScalar(meterScale);
  const inverse = source.matrix.clone().identity();
  source.updateWorldMatrix(true, true);
  // Ignore parent/world placement (table/room): export the chosen root's local art.
  inverse.copy(source.matrixWorld).invert();
  let instances = 0;
  const copyTexture = (texture: Texture) => {
    let copy = textures.get(texture);
    if (copy) return copy;
    // Texture.clone() shares its Source and marks that live source dirty. Give
    // copy() its own Source from the outset; never mutate live texture pixels.
    copy = new Texture().copy({ ...texture, source: new TextureSource(texture.image) } as Texture);
    const image = texture.image as { width?: number; height?: number; getContext?: unknown; data?: Uint8Array };
    if (image?.getContext && globalThis.document) {
      const canvas = document.createElement('canvas'); canvas.width = image.width!; canvas.height = image.height!;
      canvas.getContext('2d')!.drawImage(texture.image as CanvasImageSource, 0, 0); copy.image = canvas;
    } else if (image?.data) { copy.image = { ...image, data: image.data.slice() }; }
    copy.needsUpdate = true; textures.set(texture, copy); return copy;
  };
  const standard = (original: Material, instanceColor?: Color) => {
    const m = original as Material & { color?: Color; emissive?: Color; map?: Texture; uniforms?: { map?: { value: Texture } } };
    const result = original instanceof MeshStandardMaterial ? original.clone() : new MeshStandardMaterial({
      color: m.color ?? 0xffffff, map: m.map ?? m.uniforms?.map?.value ?? null,
      opacity: m.opacity, transparent: m.transparent, alphaTest: m.alphaTest, side: m.side,
      emissive: m.emissive ?? 0x000000, roughness: 0.85, metalness: 0,
    });
    for (const key of ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const) {
      if (result[key]) result[key] = copyTexture(result[key]);
    }
    if (instanceColor) result.color.multiply(instanceColor);
    materials.add(result); return result;
  };
  const dispose = () => {
    for (const material of materials) material.dispose(); materials.clear();
    for (const geometry of geometries.values()) geometry.dispose(); geometries.clear();
    for (const geometry of atlasGeometries) geometry.dispose(); atlasGeometries.clear();
    for (const texture of textures.values()) texture.dispose(); textures.clear(); root.clear();
  };
  try {
    source.traverseVisible(object => {
      if (!(object instanceof Mesh)) return;
      // Projected silhouette-shadow shaders have no portable static geometry.
      // Leave those to native lighting instead of exporting opaque sprite copies.
      if (!Array.isArray(object.material) && (object.material as any).uniforms?.uFloorY) return;
      const add = (transform: Matrix4, color?: Color, slot?: number) => {
        if (isVoxelExport(object)) {
          const baked = bakeVoxelExport(object, slot ?? 0, voxelPixels, (options.maxVoxelPixels ?? 250000) - voxelCount);
          voxelCount += baked.pixels; atlasGeometries.add(baked.geometry); materials.add(baked.material);
          const copy = new Mesh(baked.geometry, baked.material); copy.name = object.name;
          copy.matrixAutoUpdate = false; copy.matrix.copy(transform); root.add(copy); return;
        }
        const material = Array.isArray(object.material) ? object.material.map(m => standard(m, color)) : standard(object.material, color);
        let geometry = geometries.get(object.geometry);
        if (!geometry) { geometry = object.geometry.clone() as BufferGeometry; geometries.set(object.geometry, geometry); }
        // Stage glyph/FX shaders carry each instance's atlas crop in aUv.
        // Bake it into ordinary UVs so the native model shows the right sprite.
        const rect = object.geometry.getAttribute('aUv');
        if (rect && slot !== undefined && geometry.getAttribute('uv')) {
          geometry = geometry.clone(); atlasGeometries.add(geometry);
          const uv = geometry.getAttribute('uv');
          for (let j = 0; j < uv.count; j++) uv.setXY(j,
            rect.getX(slot) + uv.getX(j) * rect.getZ(slot), rect.getY(slot) + uv.getY(j) * rect.getW(slot));
        }
        const copy = new Mesh(geometry, material); copy.name = object.name;
        copy.matrixAutoUpdate = false; copy.matrix.copy(transform); root.add(copy);
      };
      if (object instanceof InstancedMesh) {
        instances += object.count;
        if (instances > (options.maxInstances ?? 50000)) throw new Error('Snapshot instance budget exceeded; reduce export LOD');
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, matrix); matrix.premultiply(object.matrixWorld).premultiply(inverse);
          if (object.instanceColor) object.getColorAt(i, tint);
          add(matrix, object.instanceColor ? tint : undefined, i);
        }
      } else { matrix.copy(object.matrixWorld).premultiply(inverse); add(matrix); }
    });
  } catch (error) { dispose(); throw error; }
  return { root, dispose };
}

export async function exportSpatialUSDZ(source: Object3D, options: SpatialExportOptions = {}): Promise<Blob> {
  const snapshot = prepareSpatialSnapshot(source, options);
  try {
    const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js');
    const data = await new USDZExporter().parseAsync(snapshot.root, { onlyVisible: true, maxTextureSize: 1024, includeAnchoringProperties: true });
    return new Blob([data], { type: 'model/vnd.usdz+zip' });
  } finally { snapshot.dispose(); }
}

/** Mount native model only where actually implemented. Caller supplies a frozen
 * current arena/boss export, e.g. () => stage.exportUSDZ(). No arbitrary HTML. */
export function createModelPreview(container: HTMLElement, exportSnapshot: () => Promise<Blob>, label = 'Current arena snapshot') {
  const doc = container.ownerDocument;
  const supported = modelSupported(doc);
  const element = supported ? doc.createElement('model') as NativeModelElement : null;
  let url: string | undefined, disposed = false, generation = 0;
  if (element) {
    element.setAttribute('stagemode', 'orbit'); element.setAttribute('aria-label', label);
    element.style.width = '100%'; element.style.height = '320px';
    container.append(element);
  }
  return {
    supported, element,
    async refresh() {
      if (!element || disposed) return false;
      const version = ++generation;
      const blob = await exportSnapshot();
      if (disposed || version !== generation) return false;
      const next = URL.createObjectURL(blob), previous = url; url = next;
      element.setAttribute('src', next);
      try { await element.ready; }
      catch (error) { if (url === next) { URL.revokeObjectURL(next); url = undefined; element.removeAttribute('src'); } throw error; }
      finally { if (previous) URL.revokeObjectURL(previous); }
      return !disposed && version === generation;
    },
    /** Call directly in a fresh user click, after refresh completed. */
    enterImmersive() {
      if (!element?.requestImmersive || disposed || !url) return Promise.reject(new Error('Native immersive model is unavailable'));
      return element.requestImmersive();
    },
    dispose() { disposed = true; generation++; element?.remove(); if (url) URL.revokeObjectURL(url); url = undefined; },
  };
}
