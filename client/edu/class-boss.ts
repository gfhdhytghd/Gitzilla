// The classroom's shared Boss drawn with the game's real kaiju renderer (client/render/boss) instead of ASCII art.
// The kit is derived deterministically from the lesson's boss name (same name → same archetype/look). Class HP
// drives the look: phases (1 → 2 → 3 tint/glitch), limbs breaking off as HP drops, enrage below half, a stagger
// volley while the class attacks, a roar now and then, and the death topple when the class wins.
// Only animates while visible (the projector); student phones never show it, so no render loop runs there.
import type { BossKit, BossPose, BossState } from "../../shared/types.ts";
import { demoBossKit } from "../app/mock.ts";

type BossMod = {
  drawBoss(ctx: CanvasRenderingContext2D, b: BossState | null, time: number): void;
  portraitFrame(kit: BossKit): { logical: number; bx: number; by: number };
};
let modP: Promise<BossMod> | null = null;
const loadBoss = () => (modP ??= import("../render/boss/index.ts") as Promise<BossMod>);

export interface ClassBossView {
  name: string;
  hp: number;
  maxHp: number;
  /** changes whenever a new class attack starts (plays the hit volley) */
  raidKey: string;
}

export interface ClassBoss {
  el: HTMLElement;
  update(v: ClassBossView): void;
  destroy(): void;
}

/** Deterministic kit for a lesson boss name (any archetype; the name shown is the teacher's). */
export function classBossKit(name: string): BossKit {
  const kit = demoBossKit(`class/${name.trim().toLowerCase() || "boss"}`);
  return { ...kit, name: name.trim() || kit.name };
}

export function classBossState(kit: BossKit, v: { hp: number; maxHp: number }, frame: { bx: number; by: number }, pose: BossState["pose"]): BossState {
  const f = v.maxHp > 0 ? Math.max(0, Math.min(1, v.hp / v.maxHp)) : 1;
  // limbs break off from the smallest up as the class deals damage; the last limb stays until the kill
  const order = kit.limbs.map((l, i) => ({ id: l.id, hp: l.maxHp, i })).sort((a, b) => a.hp - b.hp);
  const nBroken = f <= 0 ? kit.limbs.length : Math.min(kit.limbs.length - 1, Math.floor((1 - f) * kit.limbs.length));
  const broken = new Set(order.slice(0, nBroken).map((l) => l.id));
  return {
    x: frame.bx, y: frame.by, hp: Math.round(f * kit.maxHp), maxHp: kit.maxHp,
    phase: f > 0.66 ? 1 : f > 0.33 ? 2 : 3,
    limbs: kit.limbs.map((l) => ({ id: l.id, hp: broken.has(l.id) ? 0 : l.maxHp, maxHp: l.maxHp, broken: broken.has(l.id) })),
    casting: null, targetPlayer: null, enraged: f < kit.enrageAt, regions: [], kit, pose, airborne: false,
  };
}

export function createClassBoss(): ClassBoss {
  const canvas = document.createElement("canvas");
  canvas.className = "cr-boss-canvas";
  const el = document.createElement("div");
  el.className = "cr-boss-art cr-boss-sprite";
  el.setAttribute("aria-hidden", "true");
  el.append(canvas);
  const g = canvas.getContext("2d")!;

  let view: ClassBossView | null = null;
  let kit: BossKit | null = null;
  let mod: BossMod | null = null;
  let frame = { logical: 176, bx: 88, by: 80 };
  let raf = 0, alive = true, lastDraw = 0;
  let lastRaid = "", lastPhase = 1;
  // scripted pose timeline (seconds, renderer time base)
  let pose: { name: BossPose; start: number; total: number; dir: [number, number] } | null = null;
  let queue: { name: BossPose; total: number }[] = [];
  let nextRoar = 0;
  const now = () => performance.now() / 1000;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const play = (name: BossPose, total: number) => { pose = { name, start: now(), total, dir: [-1, 0] }; };

  // crop window inside the portrait frame: the kaiju's real pixel bounds (measured once per kit) + room for poses
  let crop = { x: 0, y: 0, w: 176, h: 176 };
  const setKit = (name: string) => {
    kit = classBossKit(name);
    if (mod) frame = mod.portraitFrame(kit);
    crop = { x: 0, y: 0, w: frame.logical, h: frame.logical };
    if (mod) {
      const probe = document.createElement("canvas");
      probe.width = probe.height = frame.logical;
      const pg = probe.getContext("2d", { willReadFrequently: true })!;
      pg.imageSmoothingEnabled = false;
      try {
        mod.drawBoss(pg, classBossState(kit, { hp: 1, maxHp: 1 }, frame, { name: "idle", t: 0, total: 1, dir: [-1, 0] }), 0.35);
        const d = pg.getImageData(0, 0, frame.logical, frame.logical).data;
        let x0 = frame.logical, y0 = frame.logical, x1 = -1, y1 = -1;
        for (let y = 0; y < frame.logical; y++) for (let x = 0; x < frame.logical; x++) if (d[(y * frame.logical + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 > x0 && y1 > y0) {
          const pad = 12, bottom = 14; // stagger/roar jitter + the death topple sinking a little
          const x = Math.max(0, x0 - pad), y = Math.max(0, y0 - pad);
          crop = { x, y, w: Math.min(frame.logical, x1 + pad + 1) - x, h: Math.min(frame.logical, y1 + bottom + 1) - y };
        }
      } catch { /* keep the whole frame */ }
    }
    canvas.width = crop.w;
    canvas.height = crop.h;
    g.imageSmoothingEnabled = false;
  };

  const draw = () => {
    if (!kit || !mod || !view) return;
    const t = now();
    if (pose && t - pose.start >= pose.total) pose = queue.length ? (() => { const n = queue.shift()!; return { name: n.name, start: t, total: n.total, dir: [-1, 0] as [number, number] }; })() : pose.name === "death" ? pose : null;
    const dead = view.hp <= 0;
    if (!pose && !dead && !reduced && t > nextRoar) { play("roar", 1.1); nextRoar = t + 9 + Math.random() * 6; }
    const p = pose ? { name: pose.name, t: Math.min(t - pose.start, pose.total), total: pose.total, dir: pose.dir } : { name: "idle" as BossPose, t: 0, total: 1, dir: [-1, 0] as [number, number] };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (dead && pose?.name === "death" && t - pose.start >= pose.total) return; // toppled: nothing left standing
    // floor shadow so the kaiju stands on the stage
    g.fillStyle = "rgba(0,0,0,.45)";
    g.beginPath();
    g.ellipse(canvas.width / 2, canvas.height - 9, canvas.width * 0.36, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.setTransform(1, 0, 0, 1, -crop.x, -crop.y);
    mod.drawBoss(g, classBossState(kit, view, frame, p), reduced ? 0.35 : t);
    g.setTransform(1, 0, 0, 1, 0, 0);
  };

  const loop = (ms: number) => {
    raf = 0;
    if (!alive) return;
    // only animate while on screen (projector); ~30 fps is plenty for pixel art
    if (el.isConnected && el.offsetParent !== null && ms - lastDraw > 32) { lastDraw = ms; draw(); }
    raf = requestAnimationFrame(loop);
  };

  void loadBoss().then((m) => {
    mod = m;
    if (view) setKit(view.name);
    draw();
    if (!reduced) raf = requestAnimationFrame(loop);
  }).catch(() => { el.textContent = ""; });

  return {
    el,
    update(v) {
      const prev = view;
      view = { ...v };
      if (!kit || (prev && prev.name !== v.name) || !prev) setKit(v.name);
      const f = v.maxHp > 0 ? v.hp / v.maxHp : 1;
      const phase = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
      if (v.hp <= 0 && pose?.name !== "death") { queue = []; play("death", 1.8); }
      else if (v.raidKey && v.raidKey !== lastRaid && prev) {
        // the class volley lands: repeated staggers, then an enrage beat if the phase dropped
        play("stagger", 0.55);
        queue = Array.from({ length: 6 }, (): { name: BossPose; total: number } => ({ name: "stagger", total: 0.55 }));
        if (phase > lastPhase) queue.push({ name: "enrage", total: 1.4 });
        else queue.push({ name: "roar", total: 1 });
      } else if (phase > lastPhase && prev) play("enrage", 1.4);
      lastRaid = v.raidKey;
      lastPhase = phase;
      if (reduced) draw();
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      el.remove();
    },
  };
}
