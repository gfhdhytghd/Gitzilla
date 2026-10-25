import { afterEach, expect, it, vi } from 'vitest';
import { AdditiveBlending, BoxGeometry, CircleGeometry, Color, DataTexture, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { unzipSync, strFromU8 } from 'three/addons/libs/fflate.module.js';
import { chooseSpatialMode, createModelPreview, createSurfacePlacement, detectSpatialSupport, exportSpatialUSDZ, prepareSpatialSnapshot } from './spatial';
import { surfacePlacementMatrix } from './projection';
import type { XRHandle, XRSelectInfo } from './types';
afterEach(() => vi.unstubAllGlobals());

const pose = (x = 1, y = 0.75, z = -2) => ({ transform: { matrix: new Matrix4().makeTranslation(x, y, z).elements } });
function surfaceFixture(hitTest = true) {
  const session = new EventTarget() as XRSession;
  const source = { cancel: vi.fn() }, anchor = { anchorSpace: {}, delete: vi.fn() };
  const hit = { getPose: vi.fn(() => pose()), createAnchor: vi.fn(async () => anchor) };
  Object.assign(session, { visibilityState: 'visible', requestReferenceSpace: vi.fn(async () => ({})),
    requestHitTestSource: hitTest ? vi.fn(async () => source) : undefined });
  const frame = { getHitTestResults: vi.fn(() => [hit]), getPose: vi.fn(() => pose(2, 0.8, -3)) };
  const handle = { mode: 'immersive-ar', session, referenceSpace: {} } as XRHandle;
  const info = { event: { frame }, inputSource: {}, transient: true, pose: pose(0, 1.6, 0) } as unknown as XRSelectInfo;
  return { session, source, anchor, hit, frame, handle, info };
}

it('detects modes/model separately and selects AR only when supported; no model UA sniffing', async () => {
  vi.stubGlobal('navigator', { xr: { isSessionSupported: async (mode: string) => mode === 'immersive-vr' } });
  const doc = { createElement: () => ({ ready: Promise.resolve(), requestImmersive() {} }) } as unknown as Document;
  expect(await detectSpatialSupport(doc)).toEqual({ vr: true, ar: false, model: true, modelImmersive: true });
  expect(chooseSpatialMode({ ar: false, vr: true })).toBe('immersive-vr');
  expect(chooseSpatialMode({ ar: true, vr: true })).toBe('immersive-ar');
  expect(chooseSpatialMode({ ar: true, vr: true }, false)).toBe('immersive-vr');
  expect(chooseSpatialMode({ ar: false, vr: false })).toBeNull();
});

it('places arena center on rotated real-surface pose in meters and reuses its output matrix', () => {
  const surface = new Matrix4().makeRotationY(Math.PI / 3); surface.setPosition(2, 0.75, -3);
  const out = new Matrix4();
  expect(surfacePlacementMatrix(surface, 480, 288, 1.2, out)).toBe(out);
  const center = new Vector3(240, 0, 144).applyMatrix4(out);
  expect(center.x).toBeCloseTo(2); expect(center.y).toBeCloseTo(0.752); expect(center.z).toBeCloseTo(-3);
  expect(new Vector3(480, 0, 0).applyMatrix4(out).distanceTo(new Vector3(0, 0, 0).applyMatrix4(out))).toBeCloseTo(1.2);
});

it('requires a fresh horizontal hit, commits on select, tracks optional anchor and cleans resources', async () => {
  const f = surfaceFixture(), changed = vi.fn();
  const p = await createSurfacePlacement(f.handle, { worldWidth: 480, worldHeight: 288, onChange: changed });
  p.update(f.frame as unknown as XRFrame); expect(p.status).toBe('candidate'); expect(p.source).toBe('hit-test');
  f.frame.getHitTestResults.mockReturnValueOnce([]); p.update(f.frame as unknown as XRFrame);
  expect(p.hasHit).toBe(false); expect(p.status).toBe('searching');
  expect(p.select(f.info)).toBe(true); expect(p.status).toBe('placed');
  await Promise.resolve(); expect(p.anchored).toBe(true);
  p.update(f.frame as unknown as XRFrame); expect(p.surface.elements[12]).toBe(2);
  p.setTableWidth(2.4); expect(p.matrix.elements[0]).toBeCloseTo(2.4 / 480);
  p.reset(); expect(f.anchor.delete).toHaveBeenCalledTimes(1); expect(p.anchored).toBe(false);
  f.session.dispatchEvent(new Event('end')); expect(p.status).toBe('disposed');
  expect(f.source.cancel).toHaveBeenCalledTimes(1); p.dispose(); expect(f.source.cancel).toHaveBeenCalledTimes(1);
});

it('rejects vertical surfaces and never labels a missing hit as a detected table', async () => {
  const f = surfaceFixture();
  f.hit.getPose.mockReturnValue({ transform: { matrix: new Matrix4().makeRotationX(Math.PI / 2).elements } });
  const p = await createSurfacePlacement(f.handle, { worldWidth: 480, worldHeight: 288 });
  p.update(f.frame as unknown as XRFrame); expect(p.hasHit).toBe(false); expect(p.select(f.info)).toBe(false); p.dispose();
});

it('allows explicitly estimated ray/plane placement without sensing and keeps VR virtual', async () => {
  const f = surfaceFixture(false);
  const p = await createSurfacePlacement(f.handle, { worldWidth: 480, worldHeight: 288 });
  const ray = new Matrix4().makeRotationX(-Math.PI / 4); ray.setPosition(0, 1.6, 0);
  f.info.pose = { transform: { matrix: ray.elements } } as unknown as XRPose;
  expect(p.status).toBe('manual'); expect(p.select(f.info)).toBe(true);
  expect(p.source).toBe('estimated-plane'); expect(p.hasHit).toBe(false); expect(p.surface.elements[13]).toBe(0.9);
  p.dispose();
  const vr = await createSurfacePlacement({ ...f.handle, mode: 'immersive-vr' }, { worldWidth: 480, worldHeight: 288 });
  expect(vr.status).toBe('virtual'); expect(vr.select(f.info)).toBe(false); vr.dispose();
});

it('deletes a late anchor when reset/dispose wins the async race', async () => {
  const f = surfaceFixture(); let resolve!: (a: typeof f.anchor) => void;
  f.hit.createAnchor.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const p = await createSurfacePlacement(f.handle, { worldWidth: 480, worldHeight: 288 });
  p.select(f.info); p.dispose(); resolve(f.anchor); await Promise.resolve();
  expect(f.anchor.delete).toHaveBeenCalledTimes(1); expect(p.anchored).toBe(false);
});

it('cancels a hit-test source that finishes creating after native session end', async () => {
  const f = surfaceFixture(); let resolve!: (source: typeof f.source) => void;
  (f.session.requestHitTestSource as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = createSurfacePlacement(f.handle, { worldWidth: 480, worldHeight: 288 });
  await Promise.resolve(); f.session.dispatchEvent(new Event('end')); resolve(f.source);
  const p = await pending; expect(p.status).toBe('disposed'); expect(f.source.cancel).toHaveBeenCalledTimes(1);
});

it('freezes instance transforms/colors/geometry without changing live resources; bounds export size', () => {
  const scene = new Group(), mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial({ color: 0xffffff }), 2);
  mesh.count = 2; mesh.setMatrixAt(0, new Matrix4().makeTranslation(10, 0, 20)); mesh.setMatrixAt(1, new Matrix4().makeTranslation(30, 5, 40));
  mesh.setColorAt(0, new Color(0xff0000)); mesh.setColorAt(1, new Color(0x00ff00)); scene.add(mesh);
  const snapshot = prepareSpatialSnapshot(scene, { metersPerPixel: 0.01 });
  expect(snapshot.root.children).toHaveLength(2); expect(snapshot.root.scale.x).toBe(0.01);
  const first = snapshot.root.children[0] as Mesh;
  expect(first.matrix.elements[12]).toBe(10); expect(first.material).toBeInstanceOf(MeshStandardMaterial);
  expect((first.material as MeshStandardMaterial).color.getHex()).toBe(0xff0000);
  expect(first.geometry).not.toBe(mesh.geometry);
  const before = first.geometry.attributes.position.getX(0); mesh.geometry.attributes.position.setX(0, 999);
  expect(first.geometry.attributes.position.getX(0)).toBe(before);
  const dispose = vi.spyOn(mesh.geometry, 'dispose'); snapshot.dispose(); expect(dispose).not.toHaveBeenCalled();
  expect(() => prepareSpatialSnapshot(scene, { maxInstances: 1 })).toThrow('budget');
});

it('exports a real USDZ archive with mesh geometry and material, not an empty file', async () => {
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0x00ff00 }));
  const blob = await exportSpatialUSDZ(mesh); expect(blob.type).toBe('model/vnd.usdz+zip');
  const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  expect(Object.keys(archive).some(name => name.startsWith('geometries/'))).toBe(true);
  const scene = Object.entries(archive).find(([name]) => name.endsWith('.usda') && !name.startsWith('geometries/'))!;
  expect(strFromU8(scene[1])).toContain('Material');
  const geometry = Object.entries(archive).find(([name]) => name.startsWith('geometries/'))!;
  expect(strFromU8(geometry[1])).toContain('def Mesh');
});

it('freezes texture pixels without sharing/mutating live sources and bakes per-instance atlas UVs', () => {
  const pixels = new Uint8Array(16).fill(255), texture = new DataTexture(pixels, 2, 2);
  const sourceVersion = texture.source.version;
  const geometry = new BoxGeometry();
  geometry.setAttribute('aUv', new InstancedBufferAttribute(new Float32Array([0, 0, 0.25, 0.5, 0.5, 0.5, 0.25, 0.5]), 4));
  const mesh = new InstancedMesh(geometry, new MeshBasicMaterial({ map: texture }), 2);
  mesh.count = 2;
  const snapshot = prepareSpatialSnapshot(mesh, { includeDecorations: true });
  const a = snapshot.root.children[0] as Mesh, b = snapshot.root.children[1] as Mesh;
  expect(a.geometry).not.toBe(b.geometry);
  expect(b.geometry.getAttribute('uv').getX(0) - a.geometry.getAttribute('uv').getX(0)).toBeCloseTo(0.5);
  const map = (a.material as MeshStandardMaterial).map!;
  expect(map.source).not.toBe(texture.source); expect(texture.source.version).toBe(sourceVersion);
  pixels[0] = 0; expect((map.image as { data: Uint8Array }).data[0]).toBe(255);
  snapshot.dispose(); expect(texture.image.data).toBe(pixels);
});

it('bakes custom voxel shaders into actual colored columns, excluding transparent pixels and preserving limb depth', () => {
  const geometry = new BoxGeometry(2, 1, 4);
  geometry.setAttribute('aSlot', new Float32BufferAttribute([0, 0, 2, 1], 4));
  geometry.setAttribute('aShape', new Float32BufferAttribute([0, 1, 4, 1], 4));
  const texture = new DataTexture(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 0]), 2, 1);
  const depthMap = new DataTexture(new Uint8Array([132, 0, 0, 255, 128, 0, 0, 255]), 2, 1);
  const material = new ShaderMaterial({ uniforms: { map: { value: texture }, depthMap: { value: depthMap }, uAtlas: { value: [2, 1] } } });
  const mesh = new Mesh(geometry, material), snapshot = prepareSpatialSnapshot(mesh);
  const baked = snapshot.root.children[0] as Mesh;
  baked.geometry.computeBoundingBox();
  expect(baked.geometry.boundingBox!.min.x).toBe(0); expect(baked.geometry.boundingBox!.max.x).toBe(1);
  expect(baked.geometry.boundingBox!.max.z).toBe(0.5); expect(baked.geometry.boundingBox!.min.z).toBe(-3.5);
  expect(baked.geometry.getAttribute('color').getX(0)).toBe(1);
  expect((baked.material as MeshStandardMaterial).vertexColors).toBe(true);
  expect(() => prepareSpatialSnapshot(mesh, { maxVoxelPixels: 0 })).toThrow('voxel budget'); snapshot.dispose();
  // Adjacent identical texels become one rectangular column, not two cubes.
  texture.image.data!.set([255, 0, 0, 255], 4); depthMap.image.data![4] = 132;
  const merged = prepareSpatialSnapshot(mesh), mergedMesh = merged.root.children[0] as Mesh;
  expect(mergedMesh.geometry.getAttribute('position').count).toBe(24);
  mergedMesh.geometry.computeBoundingBox(); expect(mergedMesh.geometry.boundingBox!.max.x).toBe(2);
  merged.dispose();
});

it('mounts native model only on support; refreshes/revokes URL resources and ignores disposed exports', async () => {
  const element = { style: {}, ready: Promise.resolve(), setAttribute: vi.fn(), removeAttribute: vi.fn(), remove: vi.fn(), requestImmersive: vi.fn(async () => {}) };
  const container = { ownerDocument: { createElement: () => element }, append: vi.fn() } as unknown as HTMLElement;
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const preview = createModelPreview(container, async () => new Blob(['USDZ']));
  expect(preview.supported).toBe(true); await preview.refresh(); await preview.refresh();
  expect(revoke).toHaveBeenCalledWith('blob:first'); await preview.enterImmersive();
  expect(element.requestImmersive).toHaveBeenCalledTimes(1); preview.dispose();
  expect(revoke).toHaveBeenCalledWith('blob:second'); expect(await preview.refresh()).toBe(false);
  expect(create).toHaveBeenCalledTimes(2); create.mockRestore(); revoke.mockRestore();
  const noModel = createModelPreview({ ownerDocument: { createElement: () => ({}) } } as unknown as HTMLElement, vi.fn());
  expect(noModel.supported).toBe(false); expect(await noModel.refresh()).toBe(false);
});

function voxelTestMesh(w: number, h: number, data?: Uint8Array) {
  const geometry = new BoxGeometry(w, h, 2);
  geometry.setAttribute('aSlot', new Float32BufferAttribute([0, 0, w, h], 4));
  geometry.setAttribute('aShape', new Float32BufferAttribute([0, h, 2, 0], 4));
  const material = new ShaderMaterial({ uniforms: { map: { value: new DataTexture(data ?? new Uint8Array(w * h * 4).fill(255), w, h) }, uAtlas: { value: [w, h] } } });
  return new Mesh(geometry, material);
}

it('shares a hard voxel budget across every actor and uses LOD instead of truncating actors', () => {
  const scene = new Group(), a = voxelTestMesh(32, 32), b = voxelTestMesh(32, 32);
  b.position.x = 100; scene.add(a, b);
  const snapshot = prepareSpatialSnapshot(scene, { maxVoxelPixels: 32 });
  expect(snapshot.root.children).toHaveLength(2); expect(snapshot.stats.sampledPixels).toBeLessThanOrEqual(32);
  expect(snapshot.stats.actors.every(actor => actor.step > 1 && actor.sampledPixels > 0)).toBe(true);
  const second = snapshot.root.children[1] as Mesh; expect(second.matrix.elements[12]).toBe(100);
  second.geometry.computeBoundingBox(); expect(second.geometry.boundingBox!.max.x).toBe(32);
  snapshot.dispose();
});

it('quantizes nearby colors for merging and culls covered internal side faces', () => {
  const close = voxelTestMesh(2, 1, new Uint8Array([20, 20, 20, 255, 21, 21, 21, 255]));
  const merged = prepareSpatialSnapshot(close);
  expect(merged.stats.actors[0].rectangles).toBe(1); merged.dispose();
  const distinct = voxelTestMesh(2, 1, new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]));
  const snapshot = prepareSpatialSnapshot(distinct), mesh = snapshot.root.children[0] as Mesh;
  expect(mesh.geometry.getAttribute('position').count).toBe(40); //10quads, no shared internal wall
  expect(mesh.geometry.index!.count).toBe(60); snapshot.dispose();
});

it('keeps actors/floor but omits preview FX, grid-like non-mesh objects and decorative floor textures', () => {
  const scene = new Group(), texture = new DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
  const floor = new Mesh(new PlaneGeometry(480, 288), new MeshBasicMaterial({ map: texture })); floor.rotation.x = -Math.PI / 2;
  const glow = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ blending: AdditiveBlending }));
  const shadow = new Mesh(new CircleGeometry(), new MeshBasicMaterial());
  scene.add(floor, glow, shadow, voxelTestMesh(4, 4));
  const snapshot = prepareSpatialSnapshot(scene); expect(snapshot.root.children).toHaveLength(2);
  expect((snapshot.root.children[0] as Mesh).material).toMatchObject({ map: null });
  expect((floor.material as MeshBasicMaterial).map).toBe(texture); snapshot.dispose();
});

it('does not attach a model blob after its owner was torn down during export', async () => {
  let resolve!: (blob: Blob) => void;
  const element = { style: {}, ready: Promise.resolve(), setAttribute: vi.fn(), remove: vi.fn() };
  const container = { ownerDocument: { createElement: () => element }, append: vi.fn() } as unknown as HTMLElement;
  const create = vi.spyOn(URL, 'createObjectURL');
  const preview = createModelPreview(container, () => new Promise(done => { resolve = done; }));
  const pending = preview.refresh(); preview.dispose(); resolve(new Blob(['USDZ']));
  expect(await pending).toBe(false); expect(create).not.toHaveBeenCalled(); create.mockRestore();
});
