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

THREE.ColorManagement.enabled = false; // pixel art: texture colors pass through untouched

export interface LookExtras {
  you?: string;
  world?: { w: number; h: number };
  theme?: ArenaTheme;
  seed?: number;
  events?: GameEvent[];
}

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
  private bulCanvas: HTMLCanvasElement; private bulCtx: CanvasRenderingContext2D; private bulTex: THREE.CanvasTexture;
  private bullets: THREE.InstancedMesh; private bulUv: THREE.InstancedBufferAttribute;
  private glows: THREE.InstancedMesh; private shadows: THREE.InstancedMesh;
  private zoneWall: THREE.Mesh; private zoneRing: THREE.LineLoop;
  private grid: THREE.GridHelper;
  readonly table: THREE.Mesh;
  readonly hud: THREE.Mesh; private hudCanvas: HTMLCanvasElement; private hudCtx: CanvasRenderingContext2D; private hudTex: THREE.CanvasTexture;
  readonly buttons: THREE.Mesh[] = [];
  private w = 480; private h = 288;
  plane: BossPlane | null = null;
  private tmpM = new THREE.Matrix4(); private tmpQ = new THREE.Quaternion(); private tmpP = new THREE.Vector3(); private tmpS = new THREE.Vector3();
  private flatQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  private l3: [number, number, number] = [0, 0, 0];
  private bDir = new THREE.Vector3(); private bMid = new THREE.Vector3(); private bQ = new THREE.Quaternion();
  private col = new THREE.Color();
  private hudAt = -1;

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
    this.root.add(this.shadows, this.bullets, this.glows);

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

    // floating HUD panel + buttons (XR); positioned in root space above the far edge
    [this.hudCanvas, this.hudCtx] = makeCanvas(256, 48);
    this.hudTex = near(new THREE.CanvasTexture(this.hudCanvas));
    this.hud = new THREE.Mesh(new THREE.PlaneGeometry(256, 48), new THREE.MeshBasicMaterial({ map: this.hudTex, transparent: true }));
    this.hud.visible = false;
    this.root.add(this.hud);
    for (const [name, label] of [["scale", "SCALE"], ["follow", "FOLLOW"], ["exit", "EXIT"]] as const) {
      const [c, g] = makeCanvas(64, 16);
      g.fillStyle = "#0d1117"; g.fillRect(0, 0, 64, 16); g.fillStyle = "#2ee6c8"; g.fillRect(0, 0, 64, 1); g.fillRect(0, 15, 64, 1);
      drawText(g, label, 32, 5, "#e6edf3", { align: "center" });
      const b = new THREE.Mesh(new THREE.PlaneGeometry(64, 16), new THREE.MeshBasicMaterial({ map: near(new THREE.CanvasTexture(c)) }));
      b.name = name; b.visible = false;
      this.buttons.push(b); this.root.add(b);
    }
  }

  get size() { return { w: this.w, h: this.h }; }
  /** debug: the 2D canvases behind the textures (gallery ?atlas=1) */
  get debugCanvases() { return { floor: this.floorCanvas, atlas: this.atlas, bullets: this.bulCanvas, fx: this.fxCanvas }; }

  /** XR: the void-room grid lies on the real floor in meters (40 m, 0.5 m cells); screens: under the arena in px. */
  setXR(on: boolean) {
    if (on) { this.scene.add(this.grid); this.grid.scale.setScalar(0.01); this.grid.position.set(0, 0, 0); }
    else { this.root.add(this.grid); this.grid.scale.setScalar(1); this.grid.position.set(this.w / 2, -2, this.h / 2); }
  }

  /** Rebuild per-frame content from the match state. yaw = camera yaw in root space (billboards face it). */
  update(state: MatchState, time: number, ex: LookExtras, yaw: number, camQuat: THREE.Quaternion, decalFx: boolean) {
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
    };
    let shadowN = 0;
    const shadow = (x: number, z: number, rx: number, rz: number) => {
      if (shadowN >= this.shadows.instanceMatrix.count) return;
      this.tmpP.set(x, 0.4, z); this.tmpS.set(rx, rz, 1);
      this.tmpM.compose(this.tmpP, this.flatQ, this.tmpS);
      this.shadows.setMatrixAt(shadowN++, this.tmpM);
    };
    this.bossMesh.visible = false;
    if (boss && this.plane) {
      const p = this.plane;
      // drawBoss draws around boss.y with its feet at boss.y + foot; the slot anchor is the feet (billboard origin)
      place(this.bossMesh, BOSS_SLOT, boss.x, p.feetY, () => drawBoss(a, boss, time));
      shadow(boss.x + 20, p.feetY, 70, 14);
    }
    let hi = 0;
    for (const m of this.heroMeshes) m.visible = false;
    const sorted: PlayerState[] = state.players.filter((p) => !p.eliminated);
    for (const p of sorted) {
      const mesh = this.heroMeshes[hi], s = HERO_SLOTS[hi];
      if (!mesh) break;
      hi++;
      const scale = state.heroScale || 1;
      place(mesh, s, p.x, p.y + FOOT * scale, () => drawPlayer(a, p, time, p.id === ex.you, { softFlash: true }));
      mesh.scale.setScalar(HERO_BOOST); // heroes read too small next to a towering kaiju at true scale (UI review UI-6)
      shadow(p.x, p.y + FOOT * scale, 8 * scale, 3 * scale);
    }
    let bi = 0;
    for (const m of this.bugMeshes) m.visible = false;
    drawMinions(a, state.minions, time, (m, draw) => {
      const mesh = this.bugMeshes[bi], s = BUG_SLOTS[bi];
      if (!mesh) return;
      bi++;
      place(mesh, s, m.x, m.y + 5, draw);
      mesh.scale.setScalar(1.2);
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
      mesh.scale.setScalar(1.3);
      shadow(pk.x, pk.y + 4, 4, 1.5);
    });
    glowState.off = false;
    this.atlasTex.needsUpdate = true;

    // ---- elevated laser beams: from the (lifted) origin to the arena edge at chest height ----
    let li = 0;
    for (const b of this.beams) b.glow.visible = b.core.visible = false;
    const beamCol = fx.bossKind === "dragon" ? 0xffc030 : fx.bossKind === "mecha" ? 0xff3a1a : fx.bossKind === "abyssal" ? (boss?.phase === 3 ? 0xff2a3a : 0x2ee6ff) : 0x3ee6ff;
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
      this.bullets.setMatrixAt(i, this.tmpM);
      this.bulUv.setXYZW(i, cx / BUL_W, 1 - (cy + CELL_H) / BUL_H, CELL_W / BUL_W, CELL_H / BUL_H);
      const g = b.owner === "boss" ? (b.kind === "bug" ? 18 : 22) : 16;
      this.tmpS.set(g, g, 1);
      this.tmpM.compose(this.tmpP, camQuat, this.tmpS);
      this.glows.setMatrixAt(i, this.tmpM);
      this.col.set(b.owner === "boss" ? (b.kind === "bug" ? "#6aff2a" : "#ff2a4a") : heroColor(b.owner)).multiplyScalar(0.6);
      this.glows.setColorAt(i, this.col);
      shadow(b.x, b.y, Math.max(2, b.r), Math.max(1.2, b.r * 0.55));
    }
    glowState.off = false;
    this.bullets.count = n; this.glows.count = n;
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

  /** XR HUD panel above the far edge: boss HP, alive count, timer (redrawn ~4x/s). */
  updateHud(state: MatchState, time: number, show: boolean) {
    this.hud.visible = show;
    for (const b of this.buttons) b.visible = show;
    if (!show) return;
    const W = this.w;
    this.hud.position.set(W / 2, 150, -10);
    this.buttons.forEach((b, i) => b.position.set(W / 2 - 72 + i * 72, 116, -10));
    if (time - this.hudAt < 0.25) return;
    this.hudAt = time;
    const g = this.hudCtx;
    g.fillStyle = "#07040c"; g.fillRect(0, 0, 256, 48);
    g.fillStyle = "#2ee6c8"; g.fillRect(0, 0, 256, 1); g.fillRect(0, 47, 256, 1);
    const b = state.boss;
    if (b) {
      drawText(g, b.kit.name.split(",")[0].toUpperCase().slice(0, 30), 6, 5, "#ff8ab0", { outline: null });
      g.fillStyle = "#3a0a18"; g.fillRect(6, 14, 244, 6);
      g.fillStyle = "#ff3a5c"; g.fillRect(6, 14, Math.round(244 * Math.max(0, b.hp / b.maxHp)), 6);
    }
    const alive = state.pvp?.royale ? state.pvp.royale.alive.length + "/" + state.players.length + " ALIVE" : state.players.filter((p) => p.alive).length + " HEROES UP";
    const tt = Math.floor(state.t);
    drawText(g, alive, 6, 28, "#7dff9a", { outline: null });
    drawText(g, "T+" + Math.floor(tt / 60) + ":" + String(tt % 60).padStart(2, "0"), 250, 28, "#e6edf3", { outline: null, align: "right" });
    this.hudTex.needsUpdate = true;
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    for (const t of [this.floorTex, this.atlasTex, this.bulTex, this.hudTex, this.fxTex]) t.dispose();
  }
}
