// XR end screen (claude-boss): the 3D take on the 2D BSOD / KERNEL PANIC for the headset diorama.
//   victory: the boss disintegrates into its own voxels (they break off along a sweeping dissolve front, scatter, fall
//            and shrink, ~1.8 s), then a smooth blue wipe spreads over the arena floor from where it died, with the
//            BSOD on the table and on a floating panel; "PINCH ANYWHERE TO CONTINUE" pulses gently.
//   defeat:  a calmer dark red / grey KERNEL PANIC wipe and panel (the boss stays: it won).
// Photosensitivity (WCAG 2.3.1): nothing flashes. The wipe is a slow, smooth spread to a dark blue, text appears line by
// line, the prompt breathes at 0.6 Hz between 60 % and 100 % opacity.
import * as THREE from "three";
import { textSprite } from "../arena/font.ts";
import { makeCanvas } from "../arena/pix.ts";

export type EndKind = "victory" | "defeat";

/** seconds after the end before a pinch continues (the dissolve + wipe play first) */
export const CONTINUE_AFTER = 2.2;
const DISSOLVE = 1.8, WIPE_START = 0.35, WIPE_DUR = 1.4;
const MAX_CUBES = 4000;

/** A text line as a sprite that fits `maxW`: the pixel font at `sc`, or (a localized line in the native fallback font,
 *  18 px per scale unit) at scale 1; shrunk until it fits. */
function line(s: string, c: string, sc: number, maxW: number): HTMLCanvasElement {
  let sp = textSprite(s, c, null, sc);
  // the pixel font is 5 px per scale unit; anything taller is the native fallback (a localized line)
  if (sp.height > 5 * sc + 2 && sc > 1) sp = textSprite(s, c, null, (sc = 1));
  while (sp.width > maxW && sc > 1) sp = textSprite(s, c, null, --sc);
  return sp;
}
/** Draw lines top-down at x (or centred on x), each advanced by its own height. */
function stack(g: CanvasRenderingContext2D, lines: [string, number, string][], x: number, y: number, maxW: number, center = false, gap = 6): number {
  for (const [s, sc, c] of lines) {
    if (!s) { y += 5 + gap; continue; }
    const sp = line(s, c, sc, maxW);
    g.drawImage(sp, Math.round(center ? x - sp.width / 2 : x), Math.round(y));
    y += sp.height + gap;
  }
  return y;
}

const near = <T extends THREE.Texture>(t: T): T => { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; };

const WIPE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WIPE_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec2 uSize;
uniform vec2 uO;
uniform float uR;
varying vec2 vUv;
void main() {
  vec2 p = vec2(vUv.x * uSize.x, (1.0 - vUv.y) * uSize.y);
  float k = 1.0 - smoothstep(uR - 28.0, uR, distance(p, uO));
  if (k <= 0.0) discard;
  vec4 c = texture2D(map, vUv);
  gl_FragColor = vec4(c.rgb, c.a * k);
}`;

export interface EndingStart {
  kind: EndKind;
  time: number;
  /** boss name (the BSOD copy; the repo name stands in when it isn't plain ASCII, the pixel font's range), arena size,
   *  where the wipe starts (2D world coords) */
  name: string; repo?: string; w: number; h: number; origin: { x: number; y: number };
  /** victory: the boss sprite to disintegrate: its atlas pixels, slot rect + anchor, and the billboard's placement */
  boss?: { atlas: HTMLCanvasElement; slot: { x: number; y: number; w: number; h: number; ax: number; ay: number }; x: number; z: number; yaw: number; scale: number };
}

export class XREnding {
  readonly group = new THREE.Group();
  kind: EndKind | null = null;
  private t0 = 0;
  private w = 480; private h = 288;
  private cubes: THREE.InstancedMesh;
  private n = 0;
  /** per cube: x y z (root space), vx vy vz, delay, spin, size */
  private data = new Float32Array(MAX_CUBES * 9);
  private base = new Float32Array(MAX_CUBES * 3);
  private wipe: THREE.Mesh; private wipeMat: THREE.ShaderMaterial;
  private floorCanvas: HTMLCanvasElement; private floorTex: THREE.CanvasTexture;
  private panel: THREE.Mesh; private panelCanvas: HTMLCanvasElement; private panelCtx: CanvasRenderingContext2D; private panelTex: THREE.CanvasTexture;
  private prompt: THREE.Mesh; private promptMat: THREE.MeshBasicMaterial;
  private name = "BOSS";
  private panelKey = "";
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private p = new THREE.Vector3(); private s = new THREE.Vector3();

  constructor() {
    this.group.visible = false;
    this.cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_CUBES);
    this.cubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CUBES * 3), 3);
    this.cubes.frustumCulled = false;
    this.cubes.count = 0;
    [this.floorCanvas] = makeCanvas(480, 288);
    this.floorTex = near(new THREE.CanvasTexture(this.floorCanvas));
    this.wipeMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.floorTex }, uSize: { value: new THREE.Vector2(480, 288) }, uO: { value: new THREE.Vector2(240, 144) }, uR: { value: 0 } },
      vertexShader: WIPE_VERT, fragmentShader: WIPE_FRAG, transparent: true, depthWrite: false,
      // a few mm over the floor at table scale: never z-fights with it, even from a low head
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.wipe = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.wipeMat);
    this.wipe.rotation.x = -Math.PI / 2;
    this.wipe.renderOrder = 1;
    [this.panelCanvas, this.panelCtx] = makeCanvas(300, 200);
    this.panelTex = near(new THREE.CanvasTexture(this.panelCanvas));
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(300, 200), new THREE.MeshBasicMaterial({ map: this.panelTex, transparent: true }));
    // the prompt: its own strip (a gentle opacity breath, no redraws); sized to the (possibly localized) text
    const sp = line("PINCH ANYWHERE TO CONTINUE", "#ffffff", 2, 292);
    const [pc, pg] = makeCanvas(300, sp.height + 6);
    pg.fillStyle = "#07040c"; pg.fillRect(0, 0, 300, sp.height + 6);
    pg.drawImage(sp, Math.round(150 - sp.width / 2), 3);
    this.promptMat = new THREE.MeshBasicMaterial({ map: near(new THREE.CanvasTexture(pc)), transparent: true, opacity: 0 });
    this.prompt = new THREE.Mesh(new THREE.PlaneGeometry(300, sp.height + 6), this.promptMat);
    this.group.add(this.cubes, this.wipe, this.panel, this.prompt);
  }

  get active() { return this.kind !== null; }
  /** a pinch now continues (the dissolve and the wipe have played) */
  ready(time: number) { return this.kind !== null && time - this.t0 >= CONTINUE_AFTER; }

  start(o: EndingStart) {
    this.kind = o.kind;
    this.t0 = o.time;
    this.w = o.w; this.h = o.h;
    const n = (o.name.split(",")[0] || "").trim();
    this.name = (/^[\x20-\x7e]+$/.test(n) ? n : o.repo?.split("/").pop() || "BOSS").toUpperCase().slice(0, 24);
    this.panelKey = "";
    this.group.visible = true;
    // the wipe plane just above the floor, the panel above the far edge facing the seat
    this.wipe.scale.set(o.w, o.h, 1);
    this.wipe.position.set(o.w / 2, 1.5, o.h / 2);
    this.wipeMat.uniforms.uSize.value.set(o.w, o.h);
    this.wipeMat.uniforms.uO.value.set(o.origin.x, o.origin.y);
    this.wipeMat.uniforms.uR.value = 0;
    this.panel.position.set(o.w / 2, 176, -12);
    this.prompt.position.set(o.w / 2, 64, -12);
    this.paintFloor(o.kind, o.w, o.h);
    this.n = 0;
    if (o.boss) this.shatter(o.boss);
    this.cubes.count = this.n;
  }

  stop() {
    this.kind = null;
    this.group.visible = false;
    this.cubes.count = 0;
    this.n = 0;
  }

  /** victory: every 2nd opaque texel of the boss sprite becomes a voxel cube at its spot on the billboard */
  private shatter(b: NonNullable<EndingStart["boss"]>) {
    const { slot: S } = b;
    const img = b.atlas.getContext("2d")!.getImageData(S.x, S.y, S.w, S.h).data;
    let opaque = 0;
    for (let i = 3; i < img.length; i += 4) if (img[i] > 128) opaque++;
    const step = Math.max(2, Math.ceil(Math.sqrt(opaque / MAX_CUBES)));
    const cos = Math.cos(b.yaw), sin = Math.sin(b.yaw);
    const col = this.cubes.instanceColor!;
    // the dissolve front sweeps from the head (top left) down to the tail; the outward push is from the body centre
    const cx = S.w * 0.45, cy = S.h * 0.55;
    for (let v = 0; v < S.h && this.n < MAX_CUBES; v += step)
      for (let u = 0; u < S.w && this.n < MAX_CUBES; u += step) {
        const k = (v * S.w + u) * 4;
        if (img[k + 3] <= 128) continue;
        const lx = (u - S.ax) * b.scale, ly = (S.ay - v) * b.scale, lz = -Math.random() * 4 * b.scale;
        const i = this.n++, o = i * 9;
        // billboard local (x right, y up, z toward the viewer) -> root space (rotated by the billboard yaw)
        this.data[o] = b.x + lx * cos + lz * sin;
        this.data[o + 1] = Math.max(0.6, ly);
        this.data[o + 2] = b.z - lx * sin + lz * cos;
        const ox = (u - cx) / S.w, oy = (cy - v) / S.h;
        const out = 28 + Math.random() * 40;
        this.data[o + 3] = (ox * cos) * out + (Math.random() - 0.5) * 18;
        this.data[o + 4] = 20 + oy * 40 + Math.random() * 35;
        this.data[o + 5] = (-ox * sin) * out + (Math.random() - 0.4) * 30;
        this.data[o + 6] = 0.05 + 0.85 * ((u / S.w) * 0.55 + (v / S.h) * 0.45) + Math.random() * 0.15;
        this.data[o + 7] = (Math.random() - 0.5) * 12;
        this.data[o + 8] = step * b.scale * (0.85 + Math.random() * 0.3);
        this.base.set([img[k] / 255, img[k + 1] / 255, img[k + 2] / 255], i * 3);
        col.setXYZ(i, img[k] / 255, img[k + 1] / 255, img[k + 2] / 255);
      }
    col.needsUpdate = true;
  }

  private paintFloor(kind: EndKind, w: number, h: number) {
    const c = this.floorCanvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    // big enough to read on the table from the seat
    if (kind === "victory") {
      g.fillStyle = "#0a3fb0"; g.fillRect(0, 0, w, h);
      stack(g, [[":(", 14, "#ffffff"], ["", 1, ""], ["STOP CODE:", 3, "#cfe0ff"], ["SQUAD_DIFF", 4, "#ffffff"]], Math.round(w * 0.08), Math.round(h * 0.16), w * 0.84);
    } else {
      g.fillStyle = "#1e0a10"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#2a1218"; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
      stack(g, [["KERNEL PANIC", 6, "#c86a76"], ["", 1, ""], ["NOT SYNCING", 3, "#9a5a64"]], Math.round(w / 2), Math.round(h * 0.32), w * 0.84, true);
    }
    this.floorTex.needsUpdate = true;
  }

  /** The floating panel (redrawn when its text changes: lines appear one by one, the autopsy percentage counts up). */
  private paintPanel(t: number) {
    const shown = Math.min(12, Math.floor(t * 4));
    const pct = Math.min(100, Math.floor(Math.max(0, t - 1) * 45));
    const key = `${this.kind}|${shown}|${pct}`;
    if (key === this.panelKey) return;
    this.panelKey = key;
    const g = this.panelCtx, W = 300, H = 200;
    g.clearRect(0, 0, W, H);
    const lines: [string, number, string][] = this.kind === "victory"
      ? [[":(", 5, "#ffffff"], ["", 1, ""], ...wrap(this.name + " HAS STOPPED RESPONDING.", 34).map((l) => [l, 2, "#ffffff"] as [string, number, string]),
         ["", 1, ""], ["SEGMENTATION FAULT (CORE DUMPED)", 2, "#ffffff"], ["STOP CODE: SQUAD_DIFF", 2, "#cfe0ff"], ["", 1, ""],
         ["COLLECTING AUTOPSY DATA... " + pct + "%", 2, "#cfe0ff"]]
      : [["KERNEL PANIC", 4, "#e07a86"], ["", 1, ""], ["NOT SYNCING: ATTEMPTED", 2, "#d8a0a8"], ["TO KILL INIT!", 2, "#d8a0a8"], ["", 1, ""],
         ["CALL TRACE:", 2, "#a06a72"], [" <SQUAD_WIPE+0X1F/0X40>", 2, "#a06a72"], [" <" + this.name.replace(/[^A-Z0-9_]/g, "_").slice(0, 12) + "_GLOAT+0X2A>", 2, "#a06a72"]];
    g.fillStyle = this.kind === "victory" ? "rgba(10,63,176,0.94)" : "rgba(30,10,16,0.94)";
    g.fillRect(0, 0, W, H);
    g.fillStyle = this.kind === "victory" ? "#5a8ae0" : "#5a2a34";
    g.fillRect(0, 0, W, 1); g.fillRect(0, H - 1, W, 1);
    stack(g, lines.map(([s, sc, c], i) => [i <= shown ? s : "", sc, c] as [string, number, string]), 12, 10, W - 24);
    this.panelTex.needsUpdate = true;
  }

  update(time: number) {
    if (!this.kind) return;
    const t = time - this.t0;
    // ---- voxels: hold, then break off along the front, fly, fall, shrink ----
    if (this.n) {
      const G = 160;
      const blue: [number, number, number] = [10 / 255, 63 / 255, 176 / 255];
      const col = this.cubes.instanceColor!;
      for (let i = 0; i < this.n; i++) {
        const o = i * 9, d = this.data[o + 6];
        const a = Math.max(0, t - d);
        const life = Math.min(1, a / 0.85);
        const size = this.data[o + 8] * (1 - life);
        this.p.set(this.data[o] + this.data[o + 3] * a, Math.max(0.5, this.data[o + 1] + this.data[o + 4] * a - 0.5 * G * a * a), this.data[o + 2] + this.data[o + 5] * a);
        this.e.set(this.data[o + 7] * a, this.data[o + 7] * a * 0.7, 0);
        this.q.setFromEuler(this.e);
        this.s.setScalar(Math.max(0.0001, size));
        this.m.compose(this.p, this.q, this.s);
        this.cubes.setMatrixAt(i, this.m);
        if (a > 0) {
          // breaking voxels cool toward the BSOD blue as they dissolve (no bright flash)
          const k = Math.min(1, life * 1.2), b = i * 3;
          col.setXYZ(i, this.base[b] + (blue[0] - this.base[b]) * k, this.base[b + 1] + (blue[1] - this.base[b + 1]) * k, this.base[b + 2] + (blue[2] - this.base[b + 2]) * k);
        }
      }
      this.cubes.instanceMatrix.needsUpdate = true;
      col.needsUpdate = true;
      if (t > DISSOLVE + 1) this.cubes.count = 0;
    }
    // ---- floor wipe: a smooth spread from the origin to the farthest corner ----
    const w = Math.min(1, Math.max(0, (t - WIPE_START) / WIPE_DUR));
    const ease = w * w * (3 - 2 * w);
    const O = this.wipeMat.uniforms.uO.value as THREE.Vector2;
    const far = Math.max(Math.hypot(O.x, O.y), Math.hypot(this.w - O.x, O.y), Math.hypot(O.x, this.h - O.y), Math.hypot(this.w - O.x, this.h - O.y)) + 30;
    this.wipeMat.uniforms.uR.value = ease * far;
    // ---- panel + the breathing continue prompt ----
    this.panel.visible = t > WIPE_START + 0.4;
    if (this.panel.visible) this.paintPanel(t - WIPE_START - 0.4);
    const ready = t >= CONTINUE_AFTER;
    this.prompt.visible = ready;
    if (ready) this.promptMat.opacity = Math.min(1, (t - CONTINUE_AFTER) / 0.5) * (0.6 + 0.4 * (0.5 + 0.5 * Math.sin((t - CONTINUE_AFTER) * Math.PI * 2 * 0.6)));
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
    this.floorTex.dispose(); this.panelTex.dispose(); this.promptMat.map?.dispose();
  }
}

function wrap(text: string, n: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    if (cur && (cur + " " + w).length > n) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
  }
  if (cur) out.push(cur);
  return out;
}
