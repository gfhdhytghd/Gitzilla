// Late-bound renderer + input modules. Other agents build client/render/* and client/input/* in parallel;
// import.meta.glob resolves to {} while a file doesn't exist, so the app runs on placeholders until they land.
import type {
  ArenaTheme, BossKit, BossState, Bullet, GameEvent, Hazard, InputFrame, Minion, Obstacle, PerkOffer, Pickup, PlayerKit, PlayerState,
} from "../../shared/types";
import * as ph from "./placeholders";
// Essential input is eager: a failed optional chunk must never leave phones on a placeholder.
import { createInput as realCreateInput } from "../input";

export interface View { x: number; y: number; w: number; h: number }

export interface Renderers {
  drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerState, time: number, isYou: boolean): void;
  playerPortrait(kit: PlayerKit, size: number): HTMLCanvasElement;
  drawBoss(ctx: CanvasRenderingContext2D, b: BossState, time: number): void;
  bossPortrait(kit: BossKit, size: number): HTMLCanvasElement;
  drawArenaBackground(ctx: CanvasRenderingContext2D, theme: ArenaTheme, seed: number, time: number): void;
  drawBullets(ctx: CanvasRenderingContext2D, bullets: Bullet[], time: number): void;
  drawHazards(ctx: CanvasRenderingContext2D, hazards: Hazard[], time: number): void;
  drawMinions(ctx: CanvasRenderingContext2D, minions: Minion[], time: number): void;
  /** `view` = visible window in logical px (portrait camera); omitted = whole arena. */
  drawEvents(ctx: CanvasRenderingContext2D, events: GameEvent[], time: number, view?: View): void;
  drawPostFx(ctx: CanvasRenderingContext2D, time: number, shake: number, view?: View): void;
  // round 2 (claude-boss arena): placeholders until exported
  drawObstacles(ctx: CanvasRenderingContext2D, obstacles: Obstacle[], time: number): void;
  drawPickups(ctx: CanvasRenderingContext2D, pickups: Pickup[], time: number): void;
  drawPerkPads(ctx: CanvasRenderingContext2D, offer: PerkOffer | null, players: PlayerState[], time: number): void;
}

export interface InputHandle {
  mode: "keyboard" | "motion" | "touch";
  needsPermission: boolean;
  readonly sensorStatus?: "on" | "waiting" | "off";
  requestPermission(): Promise<boolean>;
  calibrate(): void;
  sample(): InputFrame;
  dispose(): void;
}

export type CreateInput = (opts: {
  canvas: HTMLCanvasElement;
  toArena: (clientX: number, clientY: number) => [number, number];
  getSelf: () => { x: number; y: number } | null;
}) => InputHandle;

/** Optional extras some renderer modules export; no-ops until they land. */
export interface Extras {
  playerPortraitFrame(time: number, seed?: number): number;
  playerPortraitAt(kit: PlayerKit, size: number, frame: number): HTMLCanvasElement;
  notePlayerShot(playerId: string): void;
  trackPlayers(ps: PlayerState[]): void;
  bossLookAt(x: number, y: number): void;
}
export const X: Extras = {
  playerPortraitFrame: () => 0,
  playerPortraitAt: (kit, size) => R.playerPortrait(kit, size),
  notePlayerShot: () => {},
  trackPlayers: () => {},
  bossLookAt: () => {},
};

/** Mutable table: starts as placeholders, real implementations are patched in by loadModules(). */
export const R: Renderers = { ...ph };
export const createInput: CreateInput = realCreateInput;
export const loaded = { player: false, boss: false, arena: false, input: true };

const playerMod = import.meta.glob("../render/player/index.ts");
const bossMod = import.meta.glob("../render/boss/index.ts");
const arenaMod = import.meta.glob("../render/arena/index.ts");

async function pull(glob: Record<string, () => Promise<unknown>>, names: (keyof Renderers)[], flag: keyof typeof loaded) {
  const load = Object.values(glob)[0];
  if (!load) return;
  try {
    const m = (await load()) as Record<string, unknown>;
    let any = false;
    for (const n of names) {
      if (typeof m[n] === "function") {
        (R as unknown as Record<string, unknown>)[n] = m[n];
        any = true;
      }
    }
    loaded[flag] = loaded[flag] || any;
    for (const n of ["playerPortraitFrame", "notePlayerShot", "trackPlayers", "bossLookAt"] as const)
      if (typeof m[n] === "function") (X as unknown as Record<string, unknown>)[n] = m[n];
    if (flag === "player" && typeof m.playerPortrait === "function") {
      const pp = m.playerPortrait as (k: PlayerKit, s: number, f?: number) => HTMLCanvasElement;
      X.playerPortraitAt = (kit, size, frame) => pp(kit, size, frame);
    }
  } catch (e) {
    console.warn(`[kaiju] ${flag} renderer failed to load, using placeholder`, e);
  }
}

let loading: Promise<void> | null = null;
export function loadModules(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    await Promise.all([
      pull(playerMod, ["drawPlayer", "playerPortrait"], "player"),
      pull(bossMod, ["drawBoss", "bossPortrait"], "boss"),
      pull(arenaMod, ["drawArenaBackground", "drawBullets", "drawHazards", "drawMinions", "drawEvents", "drawPostFx", "drawObstacles", "drawPickups", "drawPerkPads"], "arena"),
      pull(bossMod, ["drawObstacles", "drawPickups", "drawPerkPads"], "boss"),
    ]);
  })();
  return loading;
}

/** Wrap a renderer call so one bad frame in someone else's module can't kill the loop. */
const errCount: Record<string, number> = {};
export function safe<T extends unknown[]>(name: string, fn: (...a: T) => void, ...args: T) {
  try {
    fn(...args);
  } catch (e) {
    errCount[name] = (errCount[name] ?? 0) + 1;
    if (errCount[name] < 4) console.error(`[kaiju] ${name} threw`, e);
  }
}
