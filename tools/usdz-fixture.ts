/** Export benchmark only: freeze an actual gallery raid once for paired tests. */
import * as T from 'three';
import * as current from '../client/render/stage25d/spatial';
import { createCameraRig } from '../client/render/stage25d/projection';

function freeze(source: T.Object3D) {
  const result = source.clone(true), textures = new Map<unknown, T.Texture>();
  const copyTexture = (texture: T.Texture) => {
    const cached = textures.get(texture.image); if (cached) return cached;
    const image = texture.image as HTMLCanvasElement;
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    const copy = new T.Texture().copy({ ...texture, source: new T.TextureSource(canvas) } as T.Texture);
    textures.set(image, copy); return copy;
  };
  result.traverse(object => {
    if (!(object instanceof T.Mesh)) return;
    object.geometry = object.geometry.clone();
    const material = (original: T.Material) => {
      const copy = original.clone();
      for (const key of Object.keys(copy)) {
        const value = (copy as any)[key]; if (value?.isTexture) (copy as any)[key] = copyTexture(value);
      }
      if (copy instanceof T.ShaderMaterial) for (const uniform of Object.values(copy.uniforms)) {
        if (uniform.value?.isTexture) uniform.value = copyTexture(uniform.value);
      }
      return copy;
    };
    object.material = Array.isArray(object.material) ? object.material.map(material) : material(object.material);
  });
  return result;
}

export async function benchmark(beforePath: string) {
  const before = await import(/* @vite-ignore */ beforePath) as typeof current;
  const live = (window as any).__stage.debugScene.children.find((object: T.Object3D) => object instanceof T.Group);
  // Stop this test gallery's loop; both exporters consume the same frozen pixels,
  // transforms and instances. This is never a real game page/shared server.
  window.requestAnimationFrame = () => 0;
  const source = freeze(live);
  // Warm lazy exporter import before timing either implementation.
  await current.exportSpatialUSDZ(new T.Group());
  const results: Record<string, any> = {};
  for (const [name, api] of [['before', before], ['after', current]] as const) {
    const prepared = api.prepareSpatialSnapshot(source, { metersPerPixel: 1.2 / 480 });
    prepared.root.updateMatrixWorld(true);
    const meshes = prepared.root.children as T.Mesh[];
    results[name] = { meshes: meshes.length, coloredMeshes: meshes.filter(m => m.geometry.getAttribute('color')).length,
      vertices: meshes.reduce((sum, m) => sum + m.geometry.getAttribute('position').count, 0),
      triangles: meshes.reduce((sum, m) => sum + (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3, 0),
      bounds: new T.Box3().setFromObject(prepared.root).getSize(new T.Vector3()).toArray(),
      voxelStats: (prepared as any).stats ?? null, timesMs: [] as number[] };
    // Side-by-side export geometry proof, with identical camera and neutral light.
    const renderer = new T.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true }); renderer.setSize(960, 640);
    const scene = new T.Scene(); scene.background = new T.Color(0x07151c);
    prepared.root.scale.setScalar(1); scene.add(prepared.root);
    scene.add(new T.AmbientLight(0xffffff, 1.5));
    const light = new T.DirectionalLight(0xffffff, 2); light.position.set(-200, 400, 300); scene.add(light);
    const rig = createCameraRig({ width: 960, height: 640, worldWidth: 480, worldHeight: 288, pitch: 35 });
    renderer.render(scene, rig.camera); results[name].image = renderer.domElement.toDataURL('image/png');
    renderer.dispose(); prepared.dispose();
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      const blob = await api.exportSpatialUSDZ(source, { metersPerPixel: 1.2 / 480 });
      results[name].timesMs.push(performance.now() - start);
      if (run === 0) { results[name].bytes = blob.size; results[name].url = URL.createObjectURL(blob); }
    }
  }
  return results;
}
