// Shared contracts. Every module imports from here; change only via the coordinator (Claude, pane wQ:p9).

// ---------- Repo analysis (analysis/ produces, sim/ + render/ consume) ----------

export interface RepoComponent {
  name: string;          // top-level component, e.g. "src/router"
  files: number;
  loc: number;
  fanIn: number;         // how many other components import it
  fanOut: number;
}

export interface RepoProfile {
  slug: string;              // "owner/name"
  description: string;
  stars: number;
  primaryLanguage: string;   // "TypeScript", "Rust", "Python", ...
  languages: Record<string, number>;   // bytes per language
  totalFiles: number;
  totalLoc: number;
  commits: number;           // approximate commit count (0 if unknown)
  contributors: number;
  ageDays: number;
  components: RepoComponent[];         // sorted by loc desc, max 8
  heart: string;                       // module with highest fan-in (file path)
  heartFanIn: number;
  edges: [number, number][];           // component index -> component index (imports)
  cycles: string[][];                  // strongly connected components with size > 1 (component names)
  maxDepth: number;                    // longest import chain between components
  testRatio: number;                   // 0..1 test files / all files
  seed: number;                        // stable 32-bit hash of slug, for procedural art
  fallback?: boolean;                  // true if served from the precomputed set
}

// ---------- Kits: what a repo becomes in the game (sim/kits.ts derives) ----------

export type WeaponKind =
  | "blaster"   // balanced single shots
  | "smg"       // fast weak shots
  | "shotgun"   // spread burst, short range
  | "cannon"    // slow heavy splash
  | "staff"     // homing orbs
  | "laser"     // short continuous beam
  | "blade";    // melee arc

export type SkillKind =
  | "firewall"  // shield bubble for self + nearby teammates
  | "fork"      // spawn a decoy clone that draws boss aggro
  | "hotfix"    // heal pulse to nearby teammates
  | "overclock" // fire-rate + speed burst
  | "rollback"; // blink back to position 2s ago, cleanse bullets nearby

export interface PlayerKit {
  repo: string;              // slug
  title: string;             // e.g. "Rust Paladin"
  weapon: WeaponKind;
  skill: SkillKind;
  maxHp: number;             // integer hearts-ish, ~5..9
  maxArmor: number;          // regenerating shield, ~3..7 (Soul Knight style)
  maxEnergy: number;         // weapon energy, ~150..250
  speed: number;             // px/s in arena units
  damageMul: number;         // 0.8..1.25
  palette: string[];         // 4 hex colors derived from language + seed
  seed: number;
}

export type BossAttackKind =
  | "ring"        // radial burst of bullets
  | "spiral"      // rotating stream
  | "fan"         // aimed cone at a target
  | "laser"       // telegraphed sweeping beam
  | "slam"        // telegraphed AoE circle under a target
  | "charge"      // dash across the arena
  | "summon"      // spawn minions (bugs)
  | "cascade";    // chain shockwave that hops between players (from cycles)

export interface BossAttack {
  id: string;            // stable id, e.g. "utils-ring"
  kind: BossAttackKind;
  name: string;          // flavor, hacky: "rm -rf /", "Merge Conflict", "Segfault Storm"
  source: string;        // component name it comes from (breaking that limb disables it)
  damage: number;
  cooldown: number;      // seconds
  telegraph: number;     // seconds of wind-up warning
  params: Record<string, number>;   // count, speed, spread, radius, ...
}

export interface BossLimb {
  id: string;
  component: string;     // component name
  maxHp: number;
  weakPoint: boolean;    // part of a cycle -> bonus damage, glows red
}

export interface BossKit {
  repo: string;
  name: string;          // e.g. "LODASH, THE MONOLITH"
  maxHp: number;         // core HP, scaled by player count
  limbs: BossLimb[];
  attacks: BossAttack[];
  enrageAt: number;      // 0..1 hp fraction
  speed: number;
  palette: string[];     // 5 hex colors
  theme: ArenaTheme;     // arena look follows the boss
  seed: number;
}

export type ArenaTheme =
  | "terminal"   // green-on-black CRT
  | "kernel"     // rusty industrial, C/Rust/Go
  | "web"        // neon, JS/TS
  | "notebook"   // ink-and-paper data lab, Python/R/Julia
  | "enterprise" // corporate beige/blue, Java/C#
  | "legacy";    // mossy ruins, old repos

// ---------- Arena geometry ----------

export const TILE = 16;
export const ARENA_W = 30 * TILE;   // 480 logical px
export const ARENA_H = 18 * TILE;   // 288 logical px

// ---------- Input (client/input produces, server/sim consumes) ----------

export interface InputFrame {
  seq: number;
  move: [number, number];    // -1..1 each, magnitude <= 1
  aim: [number, number] | null;  // unit vector; null => auto-aim (Soul Knight style)
  fire: boolean;             // held
  dash: boolean;             // edge-triggered (true for one frame)
  skill: boolean;            // edge-triggered
  source: "keyboard" | "motion" | "touch";
}

// ---------- Simulation state (sim/ produces, render/ consumes) ----------

export interface PlayerState {
  id: string;
  name: string;
  x: number; y: number;
  vx: number; vy: number;
  facing: [number, number];
  hp: number; armor: number; energy: number;
  alive: boolean;
  downedFor: number;         // seconds since downed (revive window)
  reviveProgress: number;    // 0..1
  skillCd: number;           // seconds remaining
  dashCd: number;
  invuln: number;            // seconds remaining
  buffs: string[];           // active skill ids, e.g. "firewall"
  kit: PlayerKit;
  stats: { damage: number; bestCombo: number; limbsBroken: number; revives: number; killingBlow: boolean };
}

export interface BossState {
  x: number; y: number;
  hp: number; maxHp: number;
  phase: 1 | 2 | 3;          // 3 = last stand, protects heart
  limbs: { id: string; hp: number; maxHp: number; broken: boolean }[];
  casting: { attackId: string; t: number; total: number; target: [number, number] | null } | null;
  targetPlayer: string | null;
  enraged: boolean;
  kit: BossKit;
}

export interface Bullet {
  id: number;
  owner: "boss" | string;    // player id or "boss"
  kind: string;              // weapon kind or boss attack kind; renderer picks glyph
  x: number; y: number; vx: number; vy: number;
  r: number;
}

export interface Hazard {
  id: number;
  kind: "slam" | "laser" | "cascade" | "firewall";
  x: number; y: number;
  r: number;                 // radius (or beam half-width)
  angle: number;             // laser direction
  t: number; total: number;  // progress; active when t >= telegraph
  armed: boolean;
}

export interface Minion { id: number; x: number; y: number; hp: number; kind: string }

export type GameEvent =
  | { type: "hit"; target: "boss" | string; limb?: string; amount: number; x: number; y: number; combo?: number }
  | { type: "telegraph"; attackId: string; name: string; targetPlayer: string | null }
  | { type: "limbBroken"; limb: string; by: string }
  | { type: "downed"; player: string }
  | { type: "revived"; player: string; by: string }
  | { type: "skill"; player: string; skill: SkillKind }
  | { type: "phase"; phase: 1 | 2 | 3 }
  | { type: "victory" } | { type: "defeat" };

export interface MatchState {
  t: number;                 // seconds since fight start
  status: "countdown" | "fighting" | "victory" | "defeat";
  players: PlayerState[];
  boss: BossState;
  bullets: Bullet[];
  hazards: Hazard[];
  minions: Minion[];
  events: GameEvent[];       // events produced since the previous snapshot
}

// ---------- Network protocol (server/ <-> client/app) ----------

export type Role = "player" | "screen";   // screen = spectator big screen

export interface LobbyPlayer {
  id: string; name: string; repo: string | null;
  status: "empty" | "analyzing" | "ready" | "error";
  error?: string;
  kit: PlayerKit | null;
}

export interface LobbyState {
  room: string;
  ownerId: string;
  players: LobbyPlayer[];
  boss: { repo: string | null; status: "empty" | "analyzing" | "ready" | "error"; error?: string; kit: BossKit | null };
  phase: "lobby" | "match" | "autopsy";
}

export type ClientMsg =
  | { t: "hello"; room: string; role: Role; name: string; resume?: string }
  | { t: "setRepo"; repo: string }
  | { t: "setBoss"; repo: string }          // owner only
  | { t: "start" }                          // owner only, needs >=1 ready player (4+ recommended)
  | { t: "input"; frame: InputFrame }
  | { t: "rematch" };                       // owner only

export type ServerMsg =
  | { t: "welcome"; you: string; token: string; lobby: LobbyState }
  | { t: "lobby"; lobby: LobbyState }
  | { t: "snapshot"; state: MatchState; ack: number }
  | { t: "autopsy"; result: Autopsy }
  | { t: "error"; message: string };

export interface Autopsy {
  victory: boolean;
  duration: number;
  boss: { repo: string; limbs: { component: string; broken: boolean; damageTaken: number }[]; heart: string };
  players: { id: string; name: string; repo: string; stats: PlayerState["stats"] }[];
  mvp: string | null;
}
