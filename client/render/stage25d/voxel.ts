// Volumetric pixel sprites (claude-boss, round 3): every opaque texel of a sprite becomes a voxel column.
// No meshing on the CPU: each sprite is one box and a fragment shader walks the texel grid (2D DDA through a
// height field), so animated atlases (heroes/boss redrawn every frame) stay volumetric with zero readbacks.
// Front faces show the texel color exactly; side/top faces are lit by a key light + the boss heart's point light.
// Optional per-texel depth offsets (a second atlas) give the boss real depth: limbs and tail at different z.
import * as THREE from "three";

/** Atlas pixel rect of a sprite + its anchor (feet) and voxel depth. */
export interface VoxelSlot { x: number; y: number; w: number; h: number; ax: number; ay: number }

/** depth offsets are stored as 128 + 8 * px in the R channel of the depth atlas */
export const DEPTH_ZERO = 128, DEPTH_STEP = 8, DEPTH_MAX = 11;

/** Box around the sprite in object space (feet at the origin, y up, front at z = zFront). */
export function voxelBox(s: VoxelSlot, depth: number, depthScale: number): THREE.BufferGeometry {
  const zFront = depthScale ? DEPTH_MAX * depthScale : 0, zBack = -depth - (depthScale ? DEPTH_MAX * depthScale : 0);
  const g = new THREE.BoxGeometry(s.w, s.h, zFront - zBack);
  g.translate(s.w / 2 - s.ax, s.ay - s.h / 2, (zFront + zBack) / 2);
  const n = g.attributes.position.count;
  const slot = new Float32Array(n * 4), shape = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    slot.set([s.x, s.y, s.w, s.h], i * 4);
    shape.set([s.ax, s.ay, depth, depthScale], i * 4);
  }
  g.setAttribute("aSlot", new THREE.BufferAttribute(slot, 4));
  g.setAttribute("aShape", new THREE.BufferAttribute(shape, 4));
  return g;
}

/** Instanced variant (bullets): aSlot per instance, shape shared. */
export function voxelInstancedBox(w: number, h: number, depth: number, maxInstances: number): { geometry: THREE.BufferGeometry; slots: THREE.InstancedBufferAttribute } {
  const g = voxelBox({ x: 0, y: 0, w, h, ax: w / 2, ay: h / 2 }, depth, 0);
  g.deleteAttribute("aSlot");
  const slots = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4);
  g.setAttribute("aSlot", slots);
  return { geometry: g, slots };
}

const VERT = /* glsl */ `
attribute vec4 aSlot;
attribute vec4 aShape;
uniform vec3 uLightDir;
uniform vec4 uHeart;
varying vec3 vPos;
varying vec3 vCam;
varying vec3 vToLight;
varying vec3 vHeartObj;
flat varying vec4 vSlot;
flat varying vec4 vShape;
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
#endif
  vec4 w = m * vec4(position, 1.0);
  mat4 inv = inverse(m);
  vCam = (inv * vec4(cameraPosition, 1.0)).xyz;
  vToLight = normalize((inv * vec4(-uLightDir, 0.0)).xyz);
  vHeartObj = (inv * vec4(uHeart.xyz, 1.0)).xyz;
  vPos = position;
  vSlot = aSlot;
  vShape = aShape;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform sampler2D depthMap;
uniform vec2 uAtlas;
uniform vec4 uHeart;
uniform vec3 uHeartCol;
uniform float uFlat;
varying vec3 vPos;
varying vec3 vCam;
varying vec3 vToLight;
varying vec3 vHeartObj;
flat varying vec4 vSlot;
flat varying vec4 vShape;

ivec2 atlasPx(ivec2 c) { return ivec2(int(vSlot.x) + c.x, int(uAtlas.y) - 1 - (int(vSlot.y) + c.y)); }
float zFrontOf(ivec2 c) {
  if (vShape.w == 0.0) return 0.0;
  float r = texelFetch(depthMap, atlasPx(c), 0).r * 255.0;
  return (r - ${DEPTH_ZERO}.0) / ${DEPTH_STEP}.0 * vShape.w;
}
vec3 heartLight(vec3 p, vec3 n) {
  if (uHeart.w <= 0.0) return vec3(0.0);
  vec3 d = vHeartObj - p;
  float dist = length(d);
  return uHeartCol * uHeart.w * max(dot(n, d / max(dist, 0.001)), 0.0) / (1.0 + dist * dist * 0.0015);
}
void main() {
  float ax = vShape.x, ay = vShape.y, depth = vShape.z;
  float zMin = -depth - (vShape.w == 0.0 ? 0.0 : ${DEPTH_MAX}.0 * vShape.w) - 0.01;
  vec3 rd = normalize(vPos - vCam);
  // texel space: x right, y DOWN (atlas rows), z toward the viewer
  vec3 p = vec3(vPos.x + ax, ay - vPos.y, vPos.z);
  vec3 dir = vec3(rd.x, -rd.y, rd.z);
  p += dir * 0.002;
  ivec2 size = ivec2(vSlot.zw);
  ivec2 cell = ivec2(floor(p.xy));
  cell = clamp(cell, ivec2(0), size - 1);
  vec2 stepv = vec2(dir.x >= 0.0 ? 1.0 : -1.0, dir.y >= 0.0 ? 1.0 : -1.0);
  vec2 invd = 1.0 / max(abs(dir.xy), vec2(1e-5));
  vec2 bound = vec2(cell) + max(stepv, vec2(0.0));
  vec2 tMax = abs(bound - p.xy) * invd;
  float t = 0.0;
  int axis = -1;
  // the face the ray entered the box through (for hits in the first cell)
  vec3 nEntry = abs(vPos.z - (vShape.w == 0.0 ? 0.0 : ${DEPTH_MAX}.0 * vShape.w)) < 0.01 ? vec3(0.0, 0.0, 1.0)
    : (abs(abs(vPos.x + ax - vSlot.z * 0.5) - vSlot.z * 0.5) < 0.01 ? vec3(sign(vPos.x + ax - vSlot.z * 0.5), 0.0, 0.0) : vec3(0.0, sign(vPos.y - (ay - vSlot.w * 0.5)), 0.0));
  for (int i = 0; i < 64; i++) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= size.x || cell.y >= size.y) break;
    // empty-space skip: mip 2 averages a 4x4 texel block; alpha 0 there = the whole block is empty
    ivec2 apx = atlasPx(cell);
    if (texelFetch(map, apx >> 2, 2).a == 0.0) {
      vec2 b0 = vec2(((int(vSlot.x) + cell.x) & ~3) - int(vSlot.x), ((int(vSlot.y) + cell.y) & ~3) - int(vSlot.y));
      vec2 tb = vec2(dir.x > 0.0 ? (b0.x + 4.0 - p.x) * invd.x : dir.x < 0.0 ? (p.x - b0.x) * invd.x : 1e9,
                     dir.y > 0.0 ? (b0.y + 4.0 - p.y) * invd.y : dir.y < 0.0 ? (p.y - b0.y) * invd.y : 1e9);
      float tn = min(tb.x, tb.y) + 0.002;
      if (p.z + dir.z * tn < zMin) break;
      axis = tb.x < tb.y ? 0 : 1;
      t = tn;
      vec2 q = p.xy + dir.xy * t;
      cell = ivec2(floor(q));
      tMax = t + abs(vec2(cell) + max(stepv, vec2(0.0)) - q) * invd;
      continue;
    }
    float tOut = min(tMax.x, tMax.y);
    float zin = p.z + dir.z * t, zout = p.z + dir.z * tOut;
    vec4 c = texelFetch(map, apx, 0);
    if (c.a > 0.5) {
      float zf = uFlat > 0.5 ? 0.0 : zFrontOf(cell);
      float zb = zf - depth;
      vec3 n = vec3(0.0);
      bool hit = false;
      if (zin <= zf + 0.002 && zin >= zb - 0.002) {
        hit = true;
        n = axis < 0 ? nEntry : (axis == 0 ? vec3(-stepv.x, 0.0, 0.0) : vec3(0.0, stepv.y, 0.0));
      } else if (zin > zf && zout <= zf) {
        hit = true;
        n = vec3(0.0, 0.0, 1.0);
      }
      if (hit) {
        vec3 hp = vec3(p.x + dir.x * t - ax, ay - (p.y + dir.y * t), zin);
        vec3 col;
        if (n.z > 0.5) col = c.rgb + heartLight(hp, n) * 0.35;           // front face: the exact pixel
        else col = c.rgb * (0.48 + 0.45 * max(dot(n, vToLight), 0.0)) + heartLight(hp, n);
        gl_FragColor = vec4(col, 1.0);
        return;
      }
    }
    if (zout < zMin) break;
    t = tOut;
    if (tMax.x < tMax.y) { tMax.x += invd.x; cell.x += int(stepv.x); axis = 0; }
    else { tMax.y += invd.y; cell.y += int(stepv.y); axis = 1; }
  }
  discard;
}`;

/** The sprite atlas must carry mipmaps (level 2 = 4x4 occupancy for the empty-space skip). */
export function prepareVoxelAtlas(t: THREE.Texture) {
  t.generateMipmaps = true;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.magFilter = THREE.NearestFilter;
}

export function voxelMaterial(map: THREE.Texture, depthMap: THREE.Texture, atlasW: number, atlasH: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map }, depthMap: { value: depthMap }, uAtlas: { value: new THREE.Vector2(atlasW, atlasH) },
      uLightDir: { value: LIGHT_DIR.clone() }, uHeart: { value: new THREE.Vector4(0, 0, 0, 0) }, uHeartCol: { value: new THREE.Color(1, 0.2, 0.35) },
      uFlat: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.FrontSide,
  });
}

/** Key light: from the upper left, slightly toward the viewer (direction the light travels). */
export const LIGHT_DIR = new THREE.Vector3(0.55, -1, -0.45).normalize();

const SHADOW_VERT = /* glsl */ `
uniform vec3 uLightDir;
uniform float uFloorY;
varying vec2 vUv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec3 s = w.xyz - uLightDir * ((w.y - uFloorY) / uLightDir.y);
  s.y = uFloorY;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(s, 1.0);
}`;
const SHADOW_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  if (texture2D(map, vUv).a < 0.5) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, uOpacity);
}`;

/** Planar silhouette shadow (the sprite plane projected along the key light onto the floor). */
export function shadowMaterial(map: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uLightDir: { value: LIGHT_DIR.clone() }, uFloorY: { value: 0.35 }, uOpacity: { value: 0.32 } },
    vertexShader: SHADOW_VERT,
    fragmentShader: SHADOW_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
}
