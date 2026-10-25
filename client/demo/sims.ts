// Headless mini-matches for the slides: the real sim (sim/) stepped at 30 Hz inside the scene's frame loop, drawn with
// the real renderers in the same order as game.ts. Bots are copies of the stage25d gallery's raid bot + the PvP AI.
import type { BossKit, BossState, GameEvent, InputFrame, MatchState, PlayerKit, PlayerState } from "../../shared/types.ts";
import { bossRegions, createMatch, createPvpController, pvpArenaSize, type Match } from "../../sim/index.ts";
import { R, X, safe } from "../app/renderers.ts";

export type Bot = (s: MatchState, p: PlayerState) => InputFrame;
export interface MiniSim {
  state: MatchState;
  world: { w: number; h: number };
  events: GameEvent[];                 // since the last draw (drawSim drains them)
  step(dt: number): void;
  /** Override one player's input (the phone-gesture demo drives hero 0 by hand). */
  drive?: (p: PlayerState, s: MatchState) => InputFrame;
}

const idle = (seq: number): InputFrame => ({ seq, move: [0, 0], aim: null, fire: false, dash: false, skill: false, source: "keyboard" });

export function raidBot(i: number): Bot {
  let seq = 0, ang = i * 1.7, dashT = 0;
  return (s, p) => {
    const b = s.boss;
    if (!b) return { ...idle(seq++), fire: true };
    ang += 0.012 * (i % 2 ? 1 : -1);
    const want = 120 + (i % 3) * 20;
    let mx = b.x + Math.cos(ang) * want - p.x, my = b.y + Math.sin(ang) * want * 0.7 - p.y;
    for (const bl of s.bullets) if (bl.owner === "boss" && Math.hypot(bl.x - p.x, bl.y - p.y) < 22) { mx += (p.y - bl.y) * 3; my -= (p.x - bl.x) * 3; }
    const down = s.players.find((o) => !o.alive);
    if (down && p.alive) { mx = down.x - p.x; my = down.y - p.y; }
    const l = Math.hypot(mx, my) || 1, k = Math.min(1, l / 20);
    dashT -= 1 / 30;
    const dash = dashT <= 0 && Math.random() < 0.01;
    if (dash) dashT = 2;
    return { seq: seq++, move: [(mx / l) * k, (my / l) * k], aim: null, fire: true, dash, skill: Math.random() < 0.004, source: "keyboard" };
  };
}

/** A looping match: restarts a few seconds after it ends so a slide can sit on it forever. */
export function createMiniSim(opts: { kind: "raid" | "royale"; heroes: { name: string; kit: PlayerKit }[]; boss?: BossKit; restartAfter?: number; speed?: number }): MiniSim {
  const royale = opts.kind === "royale";
  const roster = opts.heroes.map((h, i) => ({ id: (royale ? "bot-" : "p") + i, name: h.name, kit: h.kit }));
  const world = royale ? (() => { const s = pvpArenaSize(roster.length, "pvp"); return { w: s.width, h: s.height }; })() : { w: 480, h: 288 };
  const make = (): Match => royale ? createMatch(roster, null, { mode: "pvp" }) : createMatch(roster, opts.boss!);
  const bots: Bot[] = roster.map((_, i) => (royale ? createPvpController(1000 + i) : raidBot(i)));
  let match = make(), acc = 0, overFor = 0, seq = 0;
  const sim: MiniSim = {
    state: match.snapshot() as MatchState, world, events: [],
    step(dt) {
      acc += Math.min(0.1, dt) * (opts.speed ?? 1);
      while (acc >= 1 / 30) {
        const inputs = new Map<string, InputFrame>();
        sim.state.players.forEach((p, i) => inputs.set(p.id, i === 0 && sim.drive ? { ...sim.drive(p, sim.state), seq: seq++ } : bots[i](sim.state, p)));
        match.step(1 / 30, inputs);
        const snap = match.snapshot() as MatchState;
        if (sim.events.length < 400) sim.events.push(...snap.events);
        sim.state = snap;
        acc -= 1 / 30;
      }
      if (match.over) {
        overFor += dt;
        if (overFor > (opts.restartAfter ?? 4)) { match = make(); sim.state = match.snapshot() as MatchState; overFor = 0; }
      }
    },
  };
  return sim;
}

/** Draws a match state in world units (the caller sets the transform). events: pass null to skip particles/damage
 *  text (the particle pool is global, so only one sim on screen should feed it). */
export function drawSim(ctx: CanvasRenderingContext2D, sim: MiniSim, time: number, opts: { events?: boolean; postFx?: boolean; shake?: number; variant?: "classroom" | "royale" } = {}) {
  const s = sim.state, roy = s.mode === "pvp";
  const big = sim.world.w !== 480 || sim.world.h !== 288 ? sim.world : undefined;
  X.trackPlayers(s.players);
  const tgt = s.boss ? s.players.find((p) => p.id === s.boss!.targetPlayer) : null;
  if (tgt) X.bossLookAt(tgt.x, tgt.y);
  safe("drawArenaBackground", R.drawArenaBackground, ctx, s.boss?.kit.theme ?? "terminal", s.boss?.kit.seed ?? 7, time, opts.variant ?? (roy ? "royale" : undefined), big);
  if (roy) safe("drawRoyaleZone", X.drawRoyaleZone, ctx, s.pvp, s.t, time, sim.world);
  safe("drawObstacles", R.drawObstacles, ctx, s.obstacles ?? [], time);
  safe("drawPickups", R.drawPickups, ctx, s.pickups ?? [], time);
  safe("drawHazards", R.drawHazards, ctx, s.hazards, time);
  safe("drawMinions", R.drawMinions, ctx, s.minions, time);
  if (s.boss) safe("drawBoss", R.drawBoss, ctx, s.boss, time);
  for (const p of [...s.players].sort((a, b) => a.y - b.y)) if (!p.eliminated) safe("drawPlayer", R.drawPlayer, ctx, p, time, false);
  safe("drawBullets", R.drawBullets, ctx, s.bullets, time);
  if (opts.events) safe("drawEvents", R.drawEvents, ctx, sim.events, time, { x: 0, y: 0, w: sim.world.w, h: sim.world.h });
  sim.events.length = 0;
  if (opts.postFx) safe("drawPostFx", R.drawPostFx, ctx, time, opts.shake ?? 0, { x: 0, y: 0, w: sim.world.w, h: sim.world.h });
}

/** A boss posed on its own (no match), for the mapping and classroom slides. Regions come from the sim's geometry. */
export function stagedBoss(kit: BossKit, x: number, y: number, time: number, o: { hp?: number; pose?: BossState["pose"]["name"]; broken?: number[] } = {}): BossState {
  const b: BossState = {
    x, y, hp: kit.maxHp * (o.hp ?? 1), maxHp: kit.maxHp, phase: 1,
    limbs: kit.limbs.map((l, i) => ({ id: l.id, hp: o.broken?.includes(i) ? 0 : l.maxHp, maxHp: l.maxHp, broken: !!o.broken?.includes(i) })),
    casting: null, targetPlayer: null, enraged: false, regions: [], kit, airborne: false,
    pose: { name: o.pose ?? "idle", t: time % 2, total: 2, dir: [-1, 0] },
  };
  b.regions = bossRegions(b);
  return b;
}

/** A hero standing still (portrait-free full sprite via drawPlayer). */
export function stagedHero(kit: PlayerKit, x: number, y: number, facing: [number, number] = [1, 0]): PlayerState {
  return {
    id: "demo-hero", name: kit.repo, x, y, vx: 0, vy: 0, facing,
    hp: kit.maxHp, armor: kit.maxArmor, energy: kit.maxEnergy, alive: true, downedFor: 0, reviveProgress: 0,
    skillCd: 0, dashCd: 0, invuln: 0, buffs: [], kit,
    stats: { damage: 0, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false }, perks: [],
  };
}
