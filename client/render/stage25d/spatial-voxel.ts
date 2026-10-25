/** Export-time bake of stage voxel shader data into portable USD mesh geometry.
 * This does not replace/edit the live renderer. Shader bounding boxes alone are
 * not meaningful USDZ content. Canvas readback happens on explicit export only. */
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import type { Mesh, Texture } from 'three';
interface Pixels { data: ArrayLike<number>; width: number; height: number }
interface VoxelMaterial {
  uniforms?: { map?: { value: Texture }; depthMap?: { value: Texture }; uAtlas?: unknown; uFlat?: { value: number } };
}
export function isVoxelExport(mesh: Mesh): boolean {
  return !Array.isArray(mesh.material) && !!(mesh.material as VoxelMaterial).uniforms?.uAtlas &&
    !!mesh.geometry.getAttribute('aSlot') && !!mesh.geometry.getAttribute('aShape');
}
function readPixels(texture: Texture, cache: Map<Texture, Pixels>): Pixels {
  const prior = cache.get(texture); if (prior) return prior;
  const image = texture.image as { data?: Uint8Array; width: number; height: number; getContext?: unknown };
  let data: ArrayLike<number>;
  if (image.data) data = image.data.slice();
  else {
    if (!globalThis.document) throw new Error('Voxel USDZ export requires readable canvas pixels');
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(texture.image as CanvasImageSource, 0, 0);
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  }
  const result = { data, width: image.width, height: image.height }; cache.set(texture, result); return result;
}
const linear = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

export function bakeVoxelExport(mesh: Mesh, index: number, cache: Map<Texture, Pixels>, budget: number) {
  const uniforms = (mesh.material as VoxelMaterial).uniforms!;
  const map = readPixels(uniforms.map!.value, cache);
  const depthMap = uniforms.depthMap?.value ? readPixels(uniforms.depthMap.value, cache) : null;
  const slot = mesh.geometry.getAttribute('aSlot'), shape = mesh.geometry.getAttribute('aShape');
  const slotIndex = (slot as { isInstancedBufferAttribute?: boolean }).isInstancedBufferAttribute ? index : 0;
  const x0 = slot.getX(slotIndex), y0 = slot.getY(slotIndex), width = slot.getZ(slotIndex), height = slot.getW(slotIndex);
  const ax = shape.getX(0), ay = shape.getY(0), depth = shape.getZ(0), depthScale = shape.getW(0);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const visited = new Uint8Array(width * height);
  let pixels = 0;
  const face = (normal: number[], a: number[], b: number[], c: number[], d: number[], color: number[]) => {
    for (const vertex of [a, b, c, a, c, d]) { positions.push(...vertex); normals.push(...normal); colors.push(...color); }
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (visited[y * width + x]) continue;
    const i = ((y0 + y) * map.width + x0 + x) * 4;
    if (map.data[i + 3] <= 127) continue;
    const col = [linear(map.data[i]), linear(map.data[i + 1]), linear(map.data[i + 2])];
    // Same depth encoding as stage shader: red=128+8*px; uFlat removes offsets.
    const di = ((y0 + y) * (depthMap?.width ?? map.width) + x0 + x) * 4;
    const front = depthMap && depthScale && (uniforms.uFlat?.value ?? 0) <= 0.5 ? (depthMap.data[di] - 128) / 8 * depthScale : 0;
    const same = (cx: number, cy: number) => {
      if (visited[cy * width + cx]) return false;
      const c = ((y0 + cy) * map.width + x0 + cx) * 4;
      if (map.data[c + 3] <= 127 || map.data[c] !== map.data[i] || map.data[c + 1] !== map.data[i + 1] || map.data[c + 2] !== map.data[i + 2]) return false;
      if (!depthMap || !depthScale || (uniforms.uFlat?.value ?? 0) > 0.5) return true;
      return (depthMap.data[((y0 + cy) * depthMap.width + x0 + cx) * 4] - 128) / 8 * depthScale === front;
    };
    // Merge rectangles with identical front color/depth; exact pixel silhouette,
    // dramatically smaller native archives than one six-sided cube per texel.
    let rw = 1, rh = 1;
    while (x + rw < width && same(x + rw, y)) rw++;
    rows: while (y + rh < height) {
      for (let dx = 0; dx < rw; dx++) if (!same(x + dx, y + rh)) break rows;
      rh++;
    }
    for (let dy = 0; dy < rh; dy++) visited.fill(1, (y + dy) * width + x, (y + dy) * width + x + rw);
    pixels += rw * rh;
    if (pixels > budget) throw new Error('Snapshot voxel budget exceeded; reduce export LOD');
    const back = front - depth, left = x - ax, right = left + rw, top = ay - y, bottom = top - rh;
    face([0, 0, 1], [left, bottom, front], [right, bottom, front], [right, top, front], [left, top, front], col);
    face([0, 0, -1], [right, bottom, back], [left, bottom, back], [left, top, back], [right, top, back], col);
    face([1, 0, 0], [right, bottom, front], [right, bottom, back], [right, top, back], [right, top, front], col);
    face([-1, 0, 0], [left, bottom, back], [left, bottom, front], [left, top, front], [left, top, back], col);
    face([0, 1, 0], [left, top, front], [right, top, front], [right, top, back], [left, top, back], col);
    face([0, -1, 0], [left, bottom, back], [right, bottom, back], [right, bottom, front], [left, bottom, front], col);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return { geometry, material: new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), pixels };
}
