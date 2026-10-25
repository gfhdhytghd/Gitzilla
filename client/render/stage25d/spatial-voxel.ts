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
export interface VoxelBakeOptions { colorBits?: number; depthStep?: number }
export function voxelPixelCount(mesh: Mesh, index: number, cache: Map<Texture, Pixels>): number {
  const map = readPixels((mesh.material as VoxelMaterial).uniforms!.map!.value, cache);
  const slot = mesh.geometry.getAttribute('aSlot');
  const k = (slot as { isInstancedBufferAttribute?: boolean }).isInstancedBufferAttribute ? index : 0;
  let count = 0;
  for (let y = 0; y < slot.getW(k); y++) for (let x = 0; x < slot.getZ(k); x++) {
    if (map.data[((slot.getY(k) + y) * map.width + slot.getX(k) + x) * 4 + 3] > 127) count++;
  }
  return count;
}

export function bakeVoxelExport(mesh: Mesh, index: number, cache: Map<Texture, Pixels>, budget: number, options: VoxelBakeOptions = {}) {
  if (!Number.isInteger(budget) || budget < 1) throw new RangeError('Snapshot voxel budget must be positive');
  const uniforms = (mesh.material as VoxelMaterial).uniforms!;
  const map = readPixels(uniforms.map!.value, cache);
  const depthMap = uniforms.depthMap?.value ? readPixels(uniforms.depthMap.value, cache) : null;
  const slot = mesh.geometry.getAttribute('aSlot'), shape = mesh.geometry.getAttribute('aShape');
  const k = (slot as { isInstancedBufferAttribute?: boolean }).isInstancedBufferAttribute ? index : 0;
  const x0 = slot.getX(k), y0 = slot.getY(k), width = slot.getZ(k), height = slot.getW(k);
  const ax = shape.getX(0), ay = shape.getY(0), depth = shape.getZ(0), depthScale = shape.getW(0);
  const levels = 2 ** (options.colorBits ?? 4) - 1, depthStep = options.depthStep ?? 0.5;
  const quantize = (value: number) => Math.round(value / 255 * levels) * (255 / levels);
  let step = 1, gw = width, gh = height, pixels = 0;
  let palette = new Int32Array(0), fronts = new Float32Array(0);
  // Adapt grid resolution, never truncate the end of a boss/hero or omit actors.
  // Any opaque texel keeps its cell occupied, retaining thin silhouettes.
  do {
    gw = Math.ceil(width / step); gh = Math.ceil(height / step);
    palette = new Int32Array(gw * gh).fill(-1); fronts = new Float32Array(gw * gh); pixels = 0;
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
      const histogram = new Map<number, { count: number; front: number }>();
      for (let dy = 0; dy < step && cy * step + dy < height; dy++) for (let dx = 0; dx < step && cx * step + dx < width; dx++) {
        const sx = x0 + cx * step + dx, sy = y0 + cy * step + dy, i = (sy * map.width + sx) * 4;
        if (map.data[i + 3] <= 127) continue;
        const color = (quantize(map.data[i]) << 16) | (quantize(map.data[i + 1]) << 8) | quantize(map.data[i + 2]);
        const z = depthMap && depthScale && (uniforms.uFlat?.value ?? 0) <= 0.5 ? (depthMap.data[(sy * depthMap.width + sx) * 4] - 128) / 8 * depthScale : 0;
        const front = Math.round(z / depthStep) * depthStep;
        const key = color; const entry = histogram.get(key);
        if (entry) { entry.count++; entry.front = Math.max(entry.front, front); }
        else histogram.set(key, { count: 1, front });
      }
      let best = -1, count = 0, front = 0;
      for (const [color, entry] of histogram) if (entry.count > count) { best = color; count = entry.count; front = entry.front; }
      if (best >= 0) { palette[cy * gw + cx] = best; fronts[cy * gw + cx] = front; pixels++; }
    }
    if (pixels > budget) step++;
  } while (pixels > budget);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const visited = new Uint8Array(gw * gh);
  const face = (normal: number[], a: number[], b: number[], c: number[], d: number[], color: number[]) => {
    const base = positions.length / 3;
    for (const vertex of [a, b, c, d]) { positions.push(...vertex); normals.push(...normal); colors.push(...color); }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  let rectangles = 0;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const cell = y * gw + x, packed = palette[cell]; if (visited[cell] || packed < 0) continue;
    const front = fronts[cell], back = front - depth;
    const same = (cx: number, cy: number) => !visited[cy * gw + cx] && palette[cy * gw + cx] === packed && fronts[cy * gw + cx] === front;
    let rw = 1, rh = 1;
    while (x + rw < gw && same(x + rw, y)) rw++;
    rows: while (y + rh < gh) { for (let dx = 0; dx < rw; dx++) if (!same(x + dx, y + rh)) break rows; rh++; }
    for (let dy = 0; dy < rh; dy++) visited.fill(1, (y + dy) * gw + x, (y + dy) * gw + x + rw);
    rectangles++;
    const col = [linear(packed >>> 16), linear((packed >>> 8) & 255), linear(packed & 255)];
    const left = x * step - ax, right = Math.min(width, (x + rw) * step) - ax;
    const top = ay - y * step, bottom = ay - Math.min(height, (y + rh) * step);
    face([0, 0, 1], [left, bottom, front], [right, bottom, front], [right, top, front], [left, top, front], col);
    face([0, 0, -1], [right, bottom, back], [left, bottom, back], [left, top, back], [right, top, back], col);
    const covers = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < gw && cy < gh && palette[cy * gw + cx] >= 0 && fronts[cy * gw + cx] >= front && fronts[cy * gw + cx] - depth <= back;
    let rightCovered = true, leftCovered = true, topCovered = true, bottomCovered = true;
    for (let dy = 0; dy < rh; dy++) { rightCovered &&= covers(x + rw, y + dy); leftCovered &&= covers(x - 1, y + dy); }
    for (let dx = 0; dx < rw; dx++) { topCovered &&= covers(x + dx, y - 1); bottomCovered &&= covers(x + dx, y + rh); }
    if (!rightCovered) face([1, 0, 0], [right, bottom, front], [right, bottom, back], [right, top, back], [right, top, front], col);
    if (!leftCovered) face([-1, 0, 0], [left, bottom, back], [left, bottom, front], [left, top, front], [left, top, back], col);
    if (!topCovered) face([0, 1, 0], [left, top, front], [right, top, front], [right, top, back], [left, top, back], col);
    if (!bottomCovered) face([0, -1, 0], [left, bottom, back], [right, bottom, back], [right, bottom, front], [left, bottom, front], col);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3)); geometry.setIndex(indices);
  return { geometry, material: new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), pixels, step, rectangles };
}
