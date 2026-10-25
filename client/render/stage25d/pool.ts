import { CanvasTexture, DynamicDrawUsage, NearestFilter, Object3D, InstancedMesh, Color, SRGBColorSpace } from 'three';
import type { TextureCache, InstancePool, InstanceGeometry, InstanceMaterial } from './types';

/** Bounded LRU. A stable key/signature avoids needless canvas texture uploads. */
export function createTextureCache(limit = 128): TextureCache {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Texture cache limit must be positive');
  const entries = new Map<string, { signature: string | number; texture: CanvasTexture }>();
  const remove = (key: string) => { entries.get(key)?.texture.dispose(); entries.delete(key); };
  const clear = () => { for (const entry of entries.values()) entry.texture.dispose(); entries.clear(); };
  return {
    get size() { return entries.size; },
    get(key, signature, source) {
      let entry = entries.get(key);
      if (entry) {
        entries.delete(key); entries.set(key, entry);
        if (entry.signature !== signature || entry.texture.image !== source) {
          entry.texture.image = source; entry.signature = signature; entry.texture.needsUpdate = true;
        }
      } else {
        const texture = new CanvasTexture(source);
        texture.minFilter = texture.magFilter = NearestFilter;
        texture.generateMipmaps = false; texture.colorSpace = SRGBColorSpace;
        entry = { signature, texture }; entries.set(key, entry);
        if (entries.size > limit) remove(entries.keys().next().value!);
      }
      return entry.texture;
    },
    delete: remove, clear, dispose: clear,
  };
}

/** Dense, fixed-capacity stream. begin/add/end reuse matrix/color scratch objects. */
export function createInstancePool(geometry: InstanceGeometry, material: InstanceMaterial, capacity: number): InstancePool {
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Instance capacity must be positive');
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.count = 0; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const transform = new Object3D(), color = new Color();
  // Allocate color storage once, including pools that don't initially use colors.
  for (let i = 0; i < capacity; i++) mesh.setColorAt(i, color);
  mesh.instanceColor!.setUsage(DynamicDrawUsage);
  let count = 0;
  return {
    mesh, capacity, get count() { return count; },
    begin() { count = 0; },
    add(x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, tint = 0xffffff) {
      if (count === capacity) return -1;
      transform.position.set(x, y, z); transform.scale.set(sx, sy, sz); transform.rotation.set(rx, ry, rz);
      transform.updateMatrix(); mesh.setMatrixAt(count, transform.matrix);
      color.setHex(tint); mesh.setColorAt(count, color);
      return count++;
    },
    end() { mesh.count = count; if (count) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true; } },
    dispose(disposeResources = false) {
      mesh.dispose(); mesh.removeFromParent(); count = mesh.count = 0;
      if (disposeResources) {
        geometry.dispose();
        if (Array.isArray(material)) for (const m of material) m.dispose(); else material.dispose();
      }
    },
  };
}
