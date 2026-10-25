import { expect, it, vi } from 'vitest';
import { BoxGeometry, Matrix4, MeshBasicMaterial, NearestFilter } from 'three';
import { createInstancePool, createTextureCache } from './pool';

it('uploads textures only for changed frame signatures/canvases and disposes LRU entries', () => {
  const cache = createTextureCache(2), canvas = {} as HTMLCanvasElement;
  const a = cache.get('hero', 'idle0', canvas), initialVersion = a.version;
  expect(a.minFilter).toBe(NearestFilter); expect(a.generateMipmaps).toBe(false);
  expect(cache.get('hero', 'idle0', canvas)).toBe(a); expect(a.version).toBe(initialVersion);
  expect(cache.get('hero', 'idle1', canvas)).toBe(a); expect(a.version).toBe(initialVersion + 1);
  cache.get('hero', 'idle1', {} as HTMLCanvasElement); expect(a.version).toBe(initialVersion + 2);
  const disposedA = vi.fn(), b = cache.get('boss', 0, canvas), disposedB = vi.fn();
  a.addEventListener('dispose', disposedA); b.addEventListener('dispose', disposedB);
  cache.get('hero', 'idle1', a.image); cache.get('pickup', 0, canvas);
  expect(disposedB).toHaveBeenCalledTimes(1); expect(disposedA).not.toHaveBeenCalled();
  expect(cache.size).toBe(2); cache.delete('hero'); expect(disposedA).toHaveBeenCalledTimes(1);
  cache.dispose(); expect(cache.size).toBe(0); cache.dispose();
});

it('streams transforms/colors without replacing buffers; clears stale instances and bounds overflow', () => {
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const pool = createInstancePool(geometry, material, 2);
  const matrixArray = pool.mesh.instanceMatrix.array, colorArray = pool.mesh.instanceColor!.array;
  pool.begin(); expect(pool.add(2, 14, 3, 4, 5, 6, 0, 0, 0, 0xff0000)).toBe(0);
  expect(pool.add(8, 0, 4)).toBe(1); expect(pool.add(1, 1, 1)).toBe(-1); pool.end();
  expect(pool.mesh.count).toBe(2); expect(pool.count).toBe(2);
  const matrix = new Matrix4(); pool.mesh.getMatrixAt(0, matrix);
  expect(matrix.elements[12]).toBe(2); expect(matrix.elements[13]).toBe(14); expect(matrix.elements[0]).toBe(4);
  for (let frame = 0; frame < 100; frame++) { pool.begin(); pool.add(frame, 0, 0); pool.end(); }
  expect(pool.mesh.count).toBe(1); expect(pool.mesh.instanceMatrix.array).toBe(matrixArray);
  expect(pool.mesh.instanceColor!.array).toBe(colorArray);
  pool.begin(); pool.end(); expect(pool.mesh.count).toBe(0);
  const disposeGeometry = vi.spyOn(geometry, 'dispose'), disposeMaterial = vi.spyOn(material, 'dispose');
  pool.dispose(); expect(disposeGeometry).not.toHaveBeenCalled(); expect(disposeMaterial).not.toHaveBeenCalled();
  pool.dispose(true); expect(disposeGeometry).toHaveBeenCalled(); expect(disposeMaterial).toHaveBeenCalled();
});

it('rejects invalid cache/pool capacity', () => {
  expect(() => createTextureCache(0)).toThrow();
  expect(() => createInstancePool(new BoxGeometry(), new MeshBasicMaterial(), 1.5)).toThrow();
});
