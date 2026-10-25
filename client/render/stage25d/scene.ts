// The 3D stage's LOOK (claude-boss): void room, the floor texture (existing 2D ground renderers), standing pixel-art
// billboards (heroes, boss, minions), glyph bullets at chest height with glows + floor shadows, the GC-zone wall,
// and the XR table + floating HUD panel. Camera rigs / XR session / pools are codex-input's (projection.ts, xr.ts, pool.ts).
// Units: 1 three.js unit = 1 world px inside `root` (X = world x, Y = height, Z = world y). XR scales `root` to meters.
import * as THREE from "three";
import type { ArenaTheme, Bullet, GameEvent, MatchState, PlayerState } from "../../../shared/types.ts";
import { drawArenaBackground, drawHazards, drawObstacles, drawPerkPads, drawPickups, drawRoyaleZone } from "../arena/index.ts";
import { drawBullets, heroColor } from "../arena/bullets.ts";
import { drawMinions } from "../arena/minions.ts";
import { drawEvents } from "../arena/events.ts";
import { drawParticle, forEachParticle, fx, isTextParticle, particleHeight, setView, type Particle } from "../arena/fx.ts";
import { glowState, makeCanvas } from "../arena/pix.ts";
import { drawText } from "../arena/font.ts";
import { drawBoss } from "../boss/index.ts";
import { drawPlayer } from "../player/index.ts";
import { bossPlane, lift, type BossPlane } from "./staging.ts";
import { DEPTH_STEP, DEPTH_ZERO, prepareVoxelAtlas, shadowMaterial, voxelBox, voxelInstancedBox, voxelMaterial } from "./voxel.ts";
import { bossLayout } from "../boss/layout.ts";
import { HUD_BAR_W, HUD_PIP_GAP, hudInfo, type HudInfo } from "./hud.ts";

THREE.ColorManagement.enabled = false; // pixel art: texture colors pass through untouched

export interface LookExtras {
  you?: string;
  world?: { w: number; h: number };
  theme?: ArenaTheme;
  seed?: number;
  events?: GameEvent[];
  /** XR: the hero picked with FOLLOW gets a floating marker (the arena never moves to follow it) */
  follow?: string | null;
}

/** XR button row under the HUD panel: x of each button centre relative to the panel centre (3 px gaps, 252 px) */
const HUD_BTN_X = { scale: -94, follow: -27, exit: 40, up: 87, down: 114 } as const;
const near = <T extends THREE.Texture>(t: T): T => { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; };

// ---------- sprite atlas (all standing billboards are drawn by the existing 2D renderers into one canvas) ----------
const ATLAS_W = 1024, ATLAS_H = 512;
interface Slot { x: number; y: number; w: number; h: number; ax: number; ay: number }
const BOSS_SLOT: Slot = { x: 0, y: 0, w: 320, h: 208, ax: 112, ay: 200 };
const HERO = { w: 96, h: 100, ax: 48, ay: 88 };
const HERO_SLOTS: Slot[] = [];
for (let i = 0; i < 28; i++) {
  const col = i % 7, row = Math.floor(i / 7);
  HERO_SLOTS.push({ x: 328 + col * HERO.w, y: row * HERO.h, ...HERO });
}
const BUG = { w: 32, h: 32, ax: 16, ay: 26 };
const BUG_SLOTS: Slot[] = [];
for (let i = 0; i < 32; i++) BUG_SLOTS.push({ x: (i % 16) * BUG.w, y: 420 + Math.floor(i / 16) * BUG.h, ...BUG });
const OBS = { w: 72, h: 48, ax: 36, ay: 34 };
const OBS_SLOTS: Slot[] = [];
for (let i = 0; i < 16; i++) OBS_SLOTS.push({ x: (i % 4) * 80, y: 212 + Math.floor(i / 4) * 50, ...OBS });
const PICK = { w: 16, h: 16, ax: 8, ay: 14 };
const PICK_SLOTS: Slot[] = [];
for (let i = 0; i < 64; i++) PICK_SLOTS.push({ x: 512 + (i % 32) * 16, y: 420 + Math.floor(i / 32) * 16, ...PICK });
const FOOT = 17; // hero feet below PlayerState.y (claude-player's FOOT)
const HERO_BOOST = 1.35; // visual only: the billboard grows around the feet; hitboxes are the sim's

function slotGeometry(s: Slot): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(s.w, s.h);
  g.translate(-(s.ax - s.w / 2), -(s.h / 2 - s.ay), 0);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const u0 = s.x / ATLAS_W, u1 = (s.x + s.w) / ATLAS_W, v0 = 1 - (s.y + s.h) / ATLAS_H, v1 = 1 - s.y / ATLAS_H;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  uv.needsUpdate = true;
  return g;
}

// ---------- bullets: glyph cells drawn by drawBullets into a small atlas, shown as instanced camera-facing quads ----------
const BUL_W = 512, BUL_H = 384, CELL_W = 40, CELL_H = 24, BUL_COLS = Math.floor(BUL_W / CELL_W), BUL_MAX = BUL_COLS * Math.floor(BUL_H / CELL_H);
const CHEST = 12; // shots fly at chest height (world px)
const UP = new THREE.Vector3(0, 1, 0);
const FX_W = 512, FX_H = 192, FX_CW = 96, FX_CH = 24, FX_COLS = Math.floor(FX_W / FX_CW), FX_MAX = FX_COLS * Math.floor(FX_H / FX_CH);

const bulletMat = (map: THREE.Texture) => new THREE.ShaderMaterial({
  uniforms: { map: { value: map } },
  vertexShader: `attribute vec4 aUv; varying vec2 vUv;
    void main(){ vUv = aUv.xy + uv * aUv.zw; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D map; varying vec2 vUv;
    void main(){ vec4 c = texture2D(map, vUv); if (c.a < 0.5) discard; gl_FragColor = c; }`,
  side: THREE.DoubleSide,
});

function radialTexture(): THREE.Texture {
  const [c, g] = makeCanvas(32, 32);
  const img = g.createImageData(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot(x - 15.5, y - 15.5) / 16;
    const v = Math.max(0, 1 - d);
    const q = Math.floor(v * v * 4) / 4; // banded, pixel-art glow
    const i = (y * 32 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * q; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return near(new THREE.CanvasTexture(c));
}

export class StageLook {
  readonly scene = new THREE.Scene();
  readonly root = new THREE.Group();                   // world px space (XR scales/places this)
  private floorCanvas: HTMLCanvasElement; private floorCtx: CanvasRenderingContext2D; private floorTex: THREE.CanvasTexture;
  private floor: THREE.Mesh;
  private atlas: HTMLCanvasElement; private atlasCtx: CanvasRenderingContext2D; private atlasTex: THREE.CanvasTexture;
  private atlasMat: THREE.MeshBasicMaterial;
  private bossMesh: THREE.Mesh; private heroMeshes: THREE.Mesh[]; private bugMeshes: THREE.Mesh[];
  private obsMeshes: THREE.Mesh[]; private pickMeshes: THREE.Mesh[];
  private beams: { glow: THREE.Mesh; core: THREE.Mesh }[] = [];
  private fxCanvas: HTMLCanvasElement; private fxCtx: CanvasRenderingContext2D; private fxTex: THREE.CanvasTexture;
  private fxMesh: THREE.InstancedMesh; private fxUv: THREE.InstancedBufferAttribute;
  private fxList: Particle[] = [];
  // round 3: volumetric sprites
  private depthCanvas: HTMLCanvasElement; private depthCtx: CanvasRenderingContext2D; private depthTex: THREE.CanvasTexture;
  private depthKey = "";
  private voxMat: THREE.ShaderMaterial; private bulVoxMat: THREE.ShaderMaterial; private shadowMat: THREE.ShaderMaterial;
  private sprites = new Map<THREE.Mesh, { plane: THREE.BufferGeometry; box: THREE.BufferGeometry; shadow: THREE.Mesh }>();
  private bulletsVox: THREE.InstancedMesh; private bulVoxSlots: THREE.InstancedBufferAttribute;
  private glints: THREE.InstancedMesh;
  private voxel = true;
  /** bullets as voxel glyphs (+ floor glints); off = flat glyph quads even when sprites are volumetric */
  voxBullets = true;
  private heartW = new THREE.Vector3();
  private bulCanvas: HTMLCanvasElement; private bulCtx: CanvasRenderingContext2D; private bulTex: THREE.CanvasTexture;
  private bullets: THREE.InstancedMesh; private bulUv: THREE.InstancedBufferAttribute;
  private glows: THREE.InstancedMesh; private shadows: THREE.InstancedMesh;
  private zoneWall: THREE.Mesh; private zoneRing: THREE.LineLoop;
  private grid: THREE.GridHelper;
  readonly table: THREE.Mesh;
  readonly hud: THREE.Mesh; private hudCanvas: HTMLCanvasElement; private hudCtx: CanvasRenderingContext2D; private hudTex: THREE.CanvasTexture;
  readonly buttons: THREE.Mesh[] = [];
  private followMarker: THREE.Sprite;
  private w = 480; private h = 288;
  plane: BossPlane | null = null;
  private tmpM = new THREE.Matrix4(); private tmpQ = new THREE.Quaternion(); private tmpP = new THREE.Vector3(); private tmpS = new THREE.Vector3();
  private flatQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  private l3: [number, number, number] = [0, 0, 0];
  private bDir = new THREE.Vector3(); private bMid = new THREE.Vector3(); private bQ = new THREE.Quaternion();
  private col = new THREE.Color();
  private hudAt = -Infinity; private hudKey = "";

  constructor() {
    this.scene.background = new THREE.Color(0x05030a);
    this.scene.add(this.root);
    // void room: faint terminal grid on the real floor, far below / around the arena
    this.grid = new THREE.GridHelper(4000, 80, 0x16102a, 0x16102a);
    this.grid.position.set(240, -2, 144);
    this.root.add(this.grid);

    [this.floorCanvas, this.floorCtx] = makeCanvas(480, 288);
    this.floorTex = near(new THREE.CanvasTexture(this.floorCanvas));
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.floorTex }));
    this.floor.rotation.x = -Math.PI / 2;
    this.root.add(this.floor);

    [this.atlas, this.atlasCtx] = makeCanvas(ATLAS_W, ATLAS_H);
    this.atlasTex = near(new THREE.CanvasTexture(this.atlas));
    this.atlasMat = new THREE.MeshBasicMaterial({ map: this.atlasTex, alphaTest: 0.5, side: THREE.DoubleSide });
    this.bossMesh = new THREE.Mesh(slotGeometry(BOSS_SLOT), this.atlasMat);
    this.heroMeshes = HERO_SLOTS.map((s) => new THREE.Mesh(slotGeometry(s), this.atlasMat));
    this.bugMeshes = BUG_SLOTS.map((s) => new THREE.Mesh(slotGeometry(s), this.atlasMat));
    this.obsMeshes = OBS_SLOTS.map((s) => new THREE.Mesh(slotGeometry(s), this.atlasMat));
    this.pickMeshes = PICK_SLOTS.map((s) => new THREE.Mesh(slotGeometry(s), this.atlasMat));
    for (const m of [this.bossMesh, ...this.heroMeshes, ...this.bugMeshes, ...this.obsMeshes, ...this.pickMeshes]) { m.visible = false; this.root.add(m); }

    // volumetric sprites: a voxel box per slot (+ a planar silhouette shadow), switched in per frame (LOD)
    [this.depthCanvas, this.depthCtx] = makeCanvas(ATLAS_W, ATLAS_H);
    this.depthCtx.fillStyle = `rgb(${DEPTH_ZERO},${DEPTH_ZERO},${DEPTH_ZERO})`;
    this.depthCtx.fillRect(0, 0, ATLAS_W, ATLAS_H);
    this.depthTex = near(new THREE.CanvasTexture(this.depthCanvas));
    prepareVoxelAtlas(this.atlasTex);
    this.voxMat = voxelMaterial(this.atlasTex, this.depthTex, ATLAS_W, ATLAS_H);
    this.shadowMat = shadowMaterial(this.atlasTex);
    const vox = (meshes: THREE.Mesh[], slots: Slot[], depth: number, depthScale = 0) => meshes.forEach((m, i) => {
      const shadowMesh = new THREE.Mesh(m.geometry, this.shadowMat);
      shadowMesh.visible = false; shadowMesh.renderOrder = 1;
      this.root.add(shadowMesh);
      this.sprites.set(m, { plane: m.geometry, box: voxelBox(slots[i], depth, depthScale), shadow: shadowMesh });
    });
    vox([this.bossMesh], [BOSS_SLOT], 5, 1);
    vox(this.heroMeshes, HERO_SLOTS, 2);
    vox(this.bugMeshes, BUG_SLOTS, 2);
    vox(this.obsMeshes, OBS_SLOTS, 6);
    vox(this.pickMeshes, PICK_SLOTS, 2);

    // elevated laser beams (the floor keeps the telegraph lane): additive glow tube + white core
    const tube = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    for (let i = 0; i < 4; i++) {
      const glow = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: 0x3ee6ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const core = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      glow.visible = core.visible = false;
      this.beams.push({ glow, core });
      this.root.add(glow, core);
    }

    // XR floating texts / sparks: one cell per live particle, instanced camera-facing quads
    [this.fxCanvas, this.fxCtx] = makeCanvas(FX_W, FX_H);
    this.fxTex = near(new THREE.CanvasTexture(this.fxCanvas));
    this.fxMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), bulletMat(this.fxTex), FX_MAX);
    this.fxUv = new THREE.InstancedBufferAttribute(new Float32Array(FX_MAX * 4), 4);
    this.fxMesh.geometry.setAttribute("aUv", this.fxUv);
    this.fxMesh.frustumCulled = false; this.fxMesh.count = 0; this.fxMesh.visible = false;
    this.root.add(this.fxMesh);

    [this.bulCanvas, this.bulCtx] = makeCanvas(BUL_W, BUL_H);
    this.bulTex = near(new THREE.CanvasTexture(this.bulCanvas));
    const quad = new THREE.PlaneGeometry(1, 1);
    this.bullets = new THREE.InstancedMesh(quad, bulletMat(this.bulTex), BUL_MAX);
    this.bulUv = new THREE.InstancedBufferAttribute(new Float32Array(BUL_MAX * 4), 4);
    this.bullets.geometry = quad.clone();
    this.bullets.geometry.setAttribute("aUv", this.bulUv);
    this.bullets.frustumCulled = false;
    this.bullets.count = 0;
    this.glows = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({ map: radialTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), BUL_MAX);
    this.glows.frustumCulled = false; this.glows.count = 0;
    this.shadows = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }), BUL_MAX + 64);
    this.shadows.frustumCulled = false; this.shadows.count = 0; this.shadows.renderOrder = 1;
    const vb = voxelInstancedBox(CELL_W, CELL_H, 2, BUL_MAX);
    prepareVoxelAtlas(this.bulTex);
    this.bulVoxMat = voxelMaterial(this.bulTex, this.depthTex, BUL_W, BUL_H);
    this.bulletsVox = new THREE.InstancedMesh(vb.geometry, this.bulVoxMat, BUL_MAX);
    this.bulVoxSlots = vb.slots;
    this.bulletsVox.frustumCulled = false; this.bulletsVox.count = 0;
    // point-light glints: every shot lights the floor under it
    this.glints = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({ map: radialTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), BUL_MAX);
    this.glints.frustumCulled = false; this.glints.count = 0;
    this.root.add(this.shadows, this.glints, this.bullets, this.bulletsVox, this.glows);

    // GC zone: a translucent red wall ring
    this.zoneWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 72, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2a5a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    const ringPts: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i++) ringPts.push(new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2), 0, Math.sin((i / 96) * Math.PI * 2)));
    this.zoneRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: 0xff5a8a }));
    this.zoneWall.visible = this.zoneRing.visible = false;
    this.root.add(this.zoneWall, this.zoneRing);

    // XR table (shown only for the tabletop diorama; placed in meters by the caller)
    this.table = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x0c0a16 }));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x2ee6c8 }));
    this.table.add(edge);
    this.table.visible = false;
    this.scene.add(this.table);

    // FOLLOW marker: a bobbing teal chevron over the followed hero (camera-facing; XR only)
    {
      const [c, g] = makeCanvas(9, 6);
      g.fillStyle = "#07040c"; g.fillRect(0, 0, 9, 2); for (let r = 0; r < 5; r++) g.fillRect(r, r, 9 - 2 * r, 1);
      g.fillStyle = "#2ee6c8"; for (let r = 0; r < 4; r++) g.fillRect(r + 1, r, 7 - 2 * r, 1);
      this.followMarker = new THREE.Sprite(new THREE.SpriteMaterial({ map: near(new THREE.CanvasTexture(c)), transparent: true, alphaTest: 0.5 }));
      this.followMarker.scale.set(18, 12, 1);
      this.followMarker.visible = false;
      this.root.add(this.followMarker);
    }

    // floating HUD panel + buttons (XR); positioned in root space above the far edge
    [this.hudCanvas, this.hudCtx] = makeCanvas(256, 48);
    this.hudTex = near(new THREE.CanvasTexture(this.hudCanvas));
    this.hud = new THREE.Mesh(new THREE.PlaneGeometry(256, 48), new THREE.MeshBasicMaterial({ map: this.hudTex, transparent: true }));
    this.hud.visible = false;
    this.root.add(this.hud);
    // SCALE / FOLLOW / EXIT, then table height ▲ / ▼ (tabletop only)
    for (const [name, label, w] of [["scale", "SCALE", 64], ["follow", "FOLLOW", 64], ["exit", "EXIT", 64], ["up", "▲", 24], ["down", "▼", 24]] as const) {
      const [c, g] = makeCanvas(w, 16);
      g.fillStyle = "#0d1117"; g.fillRect(0, 0, w, 16); g.fillStyle = "#2ee6c8"; g.fillRect(0, 0, w, 1); g.fillRect(0, 15, w, 1);
      if (w === 64) drawText(g, label, 32, 5, "#e6edf3", { align: "center" });
      else {
        // pixel triangle (the font has no arrows): 8 px wide, 4 rows
        g.fillStyle = "#e6edf3";
        for (let r = 0; r < 4; r++) { const k = name === "up" ? r : 3 - r; g.fillRect(11 - k, 6 + r, 2 * k + 2, 1); }
      }
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, 16), new THREE.MeshBasicMaterial({ map: near(new THREE.CanvasTexture(c)) }));
      b.name = name; b.visible = false;
      this.buttons.push(b); this.root.add(b);
    }
  }

  get size() { return { w: this.w, h: this.h }; }
  /** debug: the 2D canvases behind the textures (gallery ?atlas=1) */
  get debugCanvases() { return { floor: this.floorCanvas, atlas: this.atlas, bullets: this.bulCanvas, fx: this.fxCanvas, hud: this.hudCanvas }; }

  /** AR passthrough: transparent background, no void room (the real room is the backdrop) */
  setAR(on: boolean) {
    this.scene.background = on ? null : new THREE.Color(0x05030a);
    this.grid.visible = !on;
  }

  /** XR: the void-room grid lies on the real floor in meters (40 m, 0.5 m cells); screens: under the arena in px. */
  setXR(on: boolean) {
    if (on) { this.scene.add(this.grid); this.grid.scale.setScalar(0.01); this.grid.position.set(0, 0, 0); }
    else { this.root.add(this.grid); this.grid.scale.setScalar(1); this.grid.position.set(this.w / 2, -2, this.h / 2); }
  }

  /** Rebuild per-frame content from the match state. yaw = camera yaw in root space (billboards face it). */
  /** voxel: volumetric sprites + planar shadows + glints (false = flat billboards, the phone LOD). */
  update(state: MatchState, time: number, ex: LookExtras, yaw: number, camQuat: THREE.Quaternion, decalFx: boolean, voxel = true) {
    this.voxel = voxel;
    const W = Math.round(ex.world?.w ?? 480), H = Math.round(ex.world?.h ?? 288);
    if (W !== this.w || H !== this.h || this.floorCanvas.width !== W) {
      this.w = W; this.h = H;
      this.floorCanvas.width = W; this.floorCanvas.height = H;
      this.floorCtx = this.floorCanvas.getContext("2d")!; this.floorCtx.imageSmoothingEnabled = false;
      this.floorTex.dispose();
      this.floorTex = near(new THREE.CanvasTexture(this.floorCanvas));
      (this.floor.material as THREE.MeshBasicMaterial).map = this.floorTex;
      (this.floor.material as THREE.MeshBasicMaterial).needsUpdate = true;
      if (this.grid.parent === this.root) this.grid.position.set(W / 2, -2, H / 2);
    }
    this.floor.scale.set(W, H, 1);
    this.floor.position.set(W / 2, 0, H / 2);
    const boss = state.boss;
    this.plane = bossPlane(boss);
    const variant = state.mode === "edu" ? "classroom" : state.mode === "pvp" ? "royale" : undefined;

    // ---- floor: the existing ground renderers into the world canvas ----
    const f = this.floorCtx;
    f.setTransform(1, 0, 0, 1, 0, 0);
    setView(f, { x: 0, y: 0, w: W, h: H });
    fx.textScale = 1;
    const theme = boss?.kit.theme ?? ex.theme ?? "web";
    drawArenaBackground(f, theme, boss?.kit.seed ?? ex.seed ?? 7, time, variant, { w: W, h: H });
    if (state.pvp) drawRoyaleZone(f, state.pvp, state.t, time, { w: W, h: H });
    drawPerkPads(f, state.perkOffer ?? null, state.players, time);
    drawHazards(f, state.hazards, time);
    // XR: ingest events + step particles here (no drawing): they become billboards below
    if (decalFx) { fx.project = null; drawEvents(f, ex.events ?? state.events, time, { x: 0, y: 0, w: W, h: H }, { draw: false }); }
    this.floorTex.needsUpdate = true;

    // ---- billboards: existing sprite renderers into atlas slots ----
    const a = this.atlasCtx;
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.clearRect(0, 0, ATLAS_W, ATLAS_H);
    glowState.off = true;
    const place = (mesh: THREE.Mesh, s: Slot, wx: number, wy: number, draw: () => void) => {
      a.save();
      a.beginPath(); a.rect(s.x, s.y, s.w, s.h); a.clip();
      a.setTransform(1, 0, 0, 1, s.x + s.ax - Math.round(wx), s.y + s.ay - Math.round(wy));
      draw();
      a.restore();
      mesh.visible = true;
      mesh.position.set(wx, 0, wy);
      mesh.rotation.set(0, yaw, 0);
      mesh.scale.setScalar(1);
      const sp = this.sprites.get(mesh);
      if (sp) {
        mesh.geometry = voxel ? sp.box : sp.plane;
        mesh.material = voxel ? this.voxMat : this.atlasMat;
        sp.shadow.visible = voxel;
        sp.shadow.position.copy(mesh.position); sp.shadow.rotation.copy(mesh.rotation); sp.shadow.scale.copy(mesh.scale);
      }
    };
    const rescale = (mesh: THREE.Mesh, k: number) => { mesh.scale.setScalar(k); this.sprites.get(mesh)?.shadow.scale.setScalar(k); };
    for (const sp of this.sprites.values()) sp.shadow.visible = false;
    let shadowN = 0;
    const shadow = (x: number, z: number, rx: number, rz: number) => {
      if (shadowN >= this.shadows.instanceMatrix.count) return;
      this.tmpP.set(x, 0.4, z); this.tmpS.set(rx, rz, 1);
      this.tmpM.compose(this.tmpP, this.flatQ, this.tmpS);
      this.shadows.setMatrixAt(shadowN++, this.tmpM);
    };
    this.bossMesh.visible = false;
    if (!boss) for (const m of [this.voxMat, this.bulVoxMat]) m.uniforms.uHeart.value.w = 0;
    // floor height of the planar shadows in world space (XR scales/moves the root)
    this.root.updateMatrixWorld(true);
    this.shadowMat.uniforms.uFloorY.value = this.root.position.y + 0.35 * this.root.scale.y;
    if (boss && this.plane) {
      const p = this.plane;
      // drawBoss draws around boss.y with its feet at boss.y + foot; the slot anchor is the feet (billboard origin)
      place(this.bossMesh, BOSS_SLOT, boss.x, p.feetY, () => drawBoss(a, boss, time));
      if (voxel) this.paintBossDepth(boss, p.foot);
      // the heart is a point light for every voxel side face nearby
      const hl = bossLayout(boss.kit);
      lift(p, boss.x + hl.heart.x, boss.y + hl.heart.y, 0, this.l3);
      this.heartW.set(this.l3[0], this.l3[1], this.l3[2] + 6);
      this.root.localToWorld(this.heartW);
      const beat = 0.75 + 0.25 * Math.sin(time * (boss.phase === 3 ? 9 : boss.phase === 2 ? 6 : 4));
      for (const m of [this.voxMat, this.bulVoxMat]) {
        m.uniforms.uHeart.value.set(this.heartW.x, this.heartW.y, this.heartW.z, (boss.phase === 3 ? 1.6 : 1.1) * beat);
        (m.uniforms.uHeartCol.value as THREE.Color).set(boss.kit.design ? boss.kit.palette[2] ?? "#ff3a5c" : boss.kit.palette[3] ?? "#ff3a5c");
      }
      shadow(boss.x + 20, p.feetY, 70, 14);
    }
    let hi = 0;
    for (const m of this.heroMeshes) m.visible = false;
    const fp = ex.follow ? state.players.find((q) => q.id === ex.follow && !q.eliminated) : undefined;
    this.followMarker.visible = !!fp;
    if (fp) this.followMarker.position.set(fp.x, 74 * (state.heroScale || 1) + Math.sin(time * 4) * 2, fp.y + FOOT * (state.heroScale || 1));
    const sorted: PlayerState[] = state.players.filter((p) => !p.eliminated);
    for (const p of sorted) {
      const mesh = this.heroMeshes[hi], s = HERO_SLOTS[hi];
      if (!mesh) break;
      hi++;
      const scale = state.heroScale || 1;
      place(mesh, s, p.x, p.y + FOOT * scale, () => drawPlayer(a, p, time, p.id === ex.you, { softFlash: true }));
      rescale(mesh, HERO_BOOST); // heroes read too small next to a towering kaiju at true scale (UI review UI-6)
      shadow(p.x, p.y + FOOT * scale, 8 * scale, 3 * scale);
    }
    let bi = 0;
    for (const m of this.bugMeshes) m.visible = false;
    drawMinions(a, state.minions, time, (m, draw) => {
      const mesh = this.bugMeshes[bi], s = BUG_SLOTS[bi];
      if (!mesh) return;
      bi++;
      place(mesh, s, m.x, m.y + 5, draw);
      rescale(mesh, 1.2);
      shadow(m.x, m.y + 5, 6, 2);
    });
    let oi = 0;
    for (const m of this.obsMeshes) m.visible = false;
    drawObstacles(a, state.obstacles ?? [], time, (o, draw) => {
      const mesh = this.obsMeshes[oi], s = OBS_SLOTS[oi];
      if (!mesh) return;
      oi++;
      place(mesh, s, o.x, o.y + o.h / 2, draw);
      shadow(o.x, o.y, o.w * 0.55, o.h * 0.5);
    });
    let pi = 0;
    for (const m of this.pickMeshes) m.visible = false;
    drawPickups(a, state.pickups ?? [], time, (pk, draw) => {
      const mesh = this.pickMeshes[pi], s = PICK_SLOTS[pi];
      if (!mesh) return;
      pi++;
      place(mesh, s, pk.x, pk.y + 4, draw);
      rescale(mesh, 1.3);
      shadow(pk.x, pk.y + 4, 4, 1.5);
    });
    glowState.off = false;
    this.atlasTex.needsUpdate = true;

    // ---- elevated laser beams: from the (lifted) origin to the arena edge at chest height ----
    let li = 0;
    for (const b of this.beams) b.glow.visible = b.core.visible = false;
    const tintCol = fx.bossTint ? parseInt(fx.bossTint.edge.slice(1), 16) : null;
    const beamCol = fx.bossKind === "mecha" ? 0xff3a1a : fx.bossKind === "abyssal" && boss?.phase === 3 ? 0xff2a3a : tintCol ?? (fx.bossKind === "dragon" ? 0xffc030 : fx.bossKind === "abyssal" ? 0x2ee6ff : 0x3ee6ff);
    for (const hz of state.hazards) {
      if (hz.kind !== "laser" || !hz.armed || hz.r >= 15 || li >= this.beams.length) continue;
      const ux = Math.cos(hz.angle), uy = Math.sin(hz.angle);
      let len = 0;
      while (len < 2000) { const x = hz.x + ux * len, y = hz.y + uy * len; if (x < 4 || y < 4 || x > W - 4 || y > H - 4) break; len += 4; }
      const [sx, sy, sz] = lift(this.plane, hz.x, hz.y, CHEST, this.l3);
      const ex2 = hz.x + ux * len, ey2 = hz.y + uy * len;
      this.tmpP.set(sx, sy, sz);
      const dir = this.bDir.set(ex2 - sx, CHEST - sy, ey2 - sz);
      const dl = dir.length();
      const mid = this.bMid.copy(this.tmpP).addScaledVector(dir, 0.5);
      const q = this.bQ.setFromUnitVectors(UP, dir.normalize());
      const wob = 1 + 0.15 * Math.sin(time * 60);
      const b = this.beams[li++];
      (b.glow.material as THREE.MeshBasicMaterial).color.setHex(beamCol);
      for (const [mesh, w] of [[b.glow, hz.r * 1.1 * wob], [b.core, Math.max(1, hz.r * 0.35)]] as [THREE.Mesh, number][]) {
        mesh.visible = true;
        mesh.position.copy(mid); mesh.quaternion.copy(q); mesh.scale.set(w, dl, w);
      }
    }

    // ---- XR: particles (damage numbers, sparks, taunts) as billboards at sprite height ----
    this.fxMesh.visible = decalFx;
    if (decalFx) {
      const list = this.fxList; list.length = 0;
      forEachParticle((pt) => { if (isTextParticle(pt.kind)) list.push(pt); });
      forEachParticle((pt) => { if (!isTextParticle(pt.kind) && pt.kind !== "ring" && list.length < FX_MAX) list.push(pt); });
      const fc = this.fxCtx;
      fc.setTransform(1, 0, 0, 1, 0, 0);
      fc.clearRect(0, 0, FX_W, FX_H);
      glowState.off = true;
      const nfx = Math.min(list.length, FX_MAX);
      for (let i = 0; i < nfx; i++) {
        const pt = list[i];
        const cx = (i % FX_COLS) * FX_CW, cy = Math.floor(i / FX_COLS) * FX_CH;
        fc.save();
        fc.beginPath(); fc.rect(cx, cy, FX_CW, FX_CH); fc.clip();
        fc.setTransform(1, 0, 0, 1, cx + FX_CW / 2 - Math.round(pt.x), cy + FX_CH / 2 - Math.round(pt.y));
        drawParticle(fc, pt);
        fc.restore();
        const [X, Y, Z] = lift(this.plane, pt.x, pt.y, particleHeight(pt.kind), this.l3);
        this.tmpP.set(X, Y, Z); this.tmpS.set(FX_CW, FX_CH, 1);
        this.tmpM.compose(this.tmpP, camQuat, this.tmpS);
        this.fxMesh.setMatrixAt(i, this.tmpM);
        this.fxUv.setXYZW(i, cx / FX_W, 1 - (cy + FX_CH) / FX_H, FX_CW / FX_W, FX_CH / FX_H);
      }
      glowState.off = false;
      this.fxMesh.count = nfx;
      this.fxMesh.instanceMatrix.needsUpdate = true; this.fxUv.needsUpdate = true;
      this.fxTex.needsUpdate = nfx > 0;
    }

    // ---- bullets: glyph cells + glow + floor shadow ----
    const bc = this.bulCtx;
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.clearRect(0, 0, BUL_W, BUL_H);
    glowState.off = true;
    const n = Math.min(state.bullets.length, BUL_MAX);
    const one: Bullet[] = [state.bullets[0]];
    for (let i = 0; i < n; i++) {
      const b = state.bullets[i];
      const cx = (i % BUL_COLS) * CELL_W, cy = Math.floor(i / BUL_COLS) * CELL_H;
      bc.save();
      bc.beginPath(); bc.rect(cx, cy, CELL_W, CELL_H); bc.clip();
      bc.setTransform(1, 0, 0, 1, cx + CELL_W / 2 - Math.round(b.x), cy + CELL_H / 2 - Math.round(b.y));
      one[0] = b;
      drawBullets(bc, one, time);
      bc.restore();
      // instance: camera-facing quad at chest height (lifted onto the boss plane near the boss)
      const [X, Y, Z] = lift(this.plane, b.x, b.y, CHEST, this.l3);
      this.tmpP.set(X, Y, Z); this.tmpS.set(CELL_W, CELL_H, 1);
      this.tmpM.compose(this.tmpP, camQuat, this.tmpS);
      if (voxel && this.voxBullets) {
        this.tmpS.set(1, 1, 1);
        this.tmpM.compose(this.tmpP, camQuat, this.tmpS);
        this.bulletsVox.setMatrixAt(i, this.tmpM);
        this.bulVoxSlots.setXYZW(i, cx, cy, CELL_W, CELL_H);
        // glint on the floor under the shot
        this.tmpP.set(b.x, 0.6, b.y); this.tmpS.set(26, 18, 1);
        this.tmpM.compose(this.tmpP, this.flatQ, this.tmpS);
        this.glints.setMatrixAt(i, this.tmpM);
        this.tmpP.set(X, Y, Z);
      } else {
        this.bullets.setMatrixAt(i, this.tmpM);
        this.bulUv.setXYZW(i, cx / BUL_W, 1 - (cy + CELL_H) / BUL_H, CELL_W / BUL_W, CELL_H / BUL_H);
      }
      const g = b.owner === "boss" ? (b.kind === "bug" ? 18 : 22) : 16;
      this.tmpS.set(g, g, 1);
      this.tmpM.compose(this.tmpP, camQuat, this.tmpS);
      this.glows.setMatrixAt(i, this.tmpM);
      this.col.set(b.owner === "boss" ? (b.kind === "bug" ? "#6aff2a" : "#ff2a4a") : heroColor(b.owner)).multiplyScalar(0.6);
      this.glows.setColorAt(i, this.col);
      if (voxel && this.voxBullets) this.glints.setColorAt(i, this.col.multiplyScalar(0.8));
      shadow(b.x, b.y, Math.max(2, b.r), Math.max(1.2, b.r * 0.55));
    }
    glowState.off = false;
    const vb = voxel && this.voxBullets;
    this.bullets.count = vb ? 0 : n; this.glows.count = n;
    this.bulletsVox.count = vb ? n : 0; this.glints.count = vb ? n : 0;
    if (vb) {
      this.bulletsVox.instanceMatrix.needsUpdate = true; this.bulVoxSlots.needsUpdate = true;
      this.glints.instanceMatrix.needsUpdate = true;
      if (this.glints.instanceColor) this.glints.instanceColor.needsUpdate = true;
    }
    this.bullets.instanceMatrix.needsUpdate = true; this.bulUv.needsUpdate = true;
    this.glows.instanceMatrix.needsUpdate = true;
    if (this.glows.instanceColor) this.glows.instanceColor.needsUpdate = true;
    this.bulTex.needsUpdate = n > 0;
    this.shadows.count = shadowN; this.shadows.instanceMatrix.needsUpdate = true;

    // ---- GC zone wall ----
    const z = state.pvp?.royale?.zone;
    this.zoneWall.visible = this.zoneRing.visible = !!z;
    if (z) {
      const wallH = 34;
      this.zoneWall.scale.set(z.r, wallH, z.r); this.zoneWall.position.set(z.cx, wallH / 2, z.cy);
      (this.zoneWall.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.06 * Math.sin(time * 4);
      this.zoneRing.scale.set(z.r, 1, z.r); this.zoneRing.position.set(z.cx, wallH, z.cy);
    }
  }

  /** Boss depth: per-texel z offsets in the boss slot from its layout lobes (limbs near/far, tail behind). */
  private paintBossDepth(boss: NonNullable<MatchState["boss"]>, foot: number) {
    const L = bossLayout(boss.kit);
    const key = boss.kit.repo + "|" + boss.kit.seed + "|" + L.body + "|" + foot;
    if (key === this.depthKey) return;
    this.depthKey = key;
    const g = this.depthCtx, S = BOSS_SLOT;
    g.save();
    g.beginPath(); g.rect(S.x, S.y, S.w, S.h); g.clip();
    g.fillStyle = `rgb(${DEPTH_ZERO},${DEPTH_ZERO},${DEPTH_ZERO})`;
    g.fillRect(S.x, S.y, S.w, S.h);
    const slotNames = L.kaiju?.slots ?? [];
    const OFF: Record<string, number> = {
      arms: 9, "rocket-fist": 10, jaw: 5, head: 5, "head-0": 7, "head-1": 3, "head-2": 9, neck: 3, leg: 6, "leg-back": -6,
      tail: -6, "tail-tip": -9, plates: -3, "neck-plates": -2, "back-armor": -3, "shoulder-cannon": 3, wing: -11,
      crest: 1, coil: 0, "coil-front": 5, "coil-back": -5,
    };
    const lobes = L.lobes.map((o) => ({ o, off: o.owner >= 0 ? OFF[slotNames[o.owner]] ?? 0 : o.mat === "belly" ? 3 : 0 }))
      .sort((a, b) => a.off - b.off);
    const ox = S.x + S.ax, oy = S.y + S.ay - foot;
    for (const { o, off } of lobes) {
      const v = Math.max(0, Math.min(255, DEPTH_ZERO + Math.round(off * DEPTH_STEP)));
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      g.ellipse(ox + o.x, oy + o.y, o.r + 3, (o.ry ?? o.r) + 3, 0, 0, Math.PI * 2);
      g.fill();
    }
    // the chest/heart pushes forward a little more
    const hv = DEPTH_ZERO + 4 * DEPTH_STEP;
    g.fillStyle = `rgb(${hv},${hv},${hv})`;
    g.beginPath(); g.arc(ox + L.heart.x, oy + L.heart.y, 14, 0, Math.PI * 2); g.fill();
    g.restore();
    this.depthTex.needsUpdate = true;
  }

  /** XR HUD panel above the far edge: boss HP (same numbers as the 2D boss bar), phase, limbs, alive count, timer.
   *  Redrawn when what it shows changes (hudInfo().key), at most ~15x/s by the wall clock. Never keyed on the caller's
   *  `time`: in a headset session the page rAF that advances it can pause, which froze the panel (round 4 fix). */
  updateHud(state: MatchState, show: boolean, heightButtons = false) {
    this.hud.visible = show;
    for (const b of this.buttons) b.visible = show && (heightButtons || (b.name !== "up" && b.name !== "down"));
    if (!show) return;
    const W = this.w;
    // above the standing boss (it stands in front of the far edge and hid the bar's right half at a fixed 150 px)
    const y = Math.max(150, (this.plane ? this.plane.feetY - this.plane.top : 0) + 30);
    this.hud.position.set(W / 2, y, -10);
    // SCALE FOLLOW EXIT ▲ ▼ in one row on top of the panel, spanning its width
    for (const b of this.buttons) b.position.set(W / 2 + HUD_BTN_X[b.name as keyof typeof HUD_BTN_X], y + 33, -10);
    const info = hudInfo(state);
    if (info.key === this.hudKey) return;
    const now = performance.now();
    if (now - this.hudAt < 66 && now >= this.hudAt) return;
    this.hudAt = now;
    this.hudKey = info.key;
    this.drawHud(info);
  }

  private drawHud(info: HudInfo) {
    const g = this.hudCtx;
    g.fillStyle = "#07040c"; g.fillRect(0, 0, 256, 48);
    g.fillStyle = "#2ee6c8"; g.fillRect(0, 0, 256, 1); g.fillRect(0, 47, 256, 1);
    const b = info.boss;
    if (b) {
      drawText(g, b.name, 6, 4, "#ff8ab0", { outline: null });
      drawText(g, b.pctText, 250, 4, "#e6edf3", { outline: null, align: "right" });
      g.fillStyle = "#3a0a18"; g.fillRect(6, 12, HUD_BAR_W, 7);
      g.fillStyle = b.phase === 3 ? "#ff2a3a" : "#ff3a5c"; g.fillRect(6, 12, b.barPx, 7);
      g.fillStyle = "#ff8aa0"; g.fillRect(6, 12, b.barPx, 1);
      drawText(g, b.phaseText, 6, 22, b.phase === 3 ? "#ff3a5c" : b.enraged ? "#ffb000" : "#8b949e", { outline: null });
      b.limbs.forEach((l, i) => {
        const x = 6 + i * (b.pipW + HUD_PIP_GAP);
        g.fillStyle = l.broken ? "#30363d" : "#2a1a10"; g.fillRect(x, 30, b.pipW, 4);
        if (l.broken) { g.fillStyle = "#ff3a5c"; g.fillRect(x, 31, b.pipW, 1); }
        else { g.fillStyle = l.weak ? "#ff8ab0" : "#ffb000"; g.fillRect(x, 30, l.px, 4); }
      });
    }
    drawText(g, info.alive, 6, 38, "#7dff9a", { outline: null });
    drawText(g, info.timer, 250, 38, "#e6edf3", { outline: null, align: "right" });
    this.hudTex.needsUpdate = true;
  }

  /** debug/tests: the key of the panel as last drawn */
  get hudDrawnKey() { return this.hudKey; }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    for (const t of [this.floorTex, this.atlasTex, this.bulTex, this.hudTex, this.fxTex, this.depthTex]) t.dispose();
    for (const sp of this.sprites.values()) sp.box.dispose();
  }
}
