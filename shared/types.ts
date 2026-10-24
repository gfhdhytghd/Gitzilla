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
  readme?: string;                     // first ~4 KB of README (for Gemini design)
  tree?: string[];                     // up to ~120 notable paths (for Gemini design)
  fallback?: boolean;                  // true if served from the precomputed set
  dna?: CodeDNA;                       // real-code fingerprint; drives names, art and flavor (never stats)
}

// Real code pulled out of the repo so heroes and bosses are made of it. All strings are verbatim
// (trimmed) excerpts. Private repos: never send to Gemini or Hall (server enforces).
export interface CodeDNA {
  identifiers: string[];                 // ~24 real function/class names, most-referenced first
  componentSymbols: Record<string, string[]>; // component name -> up to 4 top exported/defined symbols
  heartLines: string[];                  // ~12 real lines from the heart file, each <= 40 chars
  snippets: { file: string; line: number; code: string }[]; // 6–12 striking real lines <= 48 chars (signatures, gnarliest line)
  todos: { file: string; text: string }[];   // up to 12 real TODO/FIXME/HACK/XXX comments, <= 60 chars
  commits: string[];                     // up to 10 recent commit subjects (empty offline)
  tokens: string[];                      // ~12 most frequent language keywords/operators, e.g. "fn", "=>", "def", "::"
  bigFiles: { path: string; loc: number }[]; // top 8 files by LOC
  longestFunction: { name: string; file: string; lines: number } | null;
  counts: { functions: number; classes: number; todo: number; fixme: number; hack: number; comments: number };
  maxNesting: number;                    // deepest brace/indent nesting seen
  avgLineLength: number;
  indent: "tabs" | "spaces2" | "spaces4" | "mixed";
}

// ---------- Gemini-authored designs (design/ produces; renderers consume) ----------
// Pure look + flavor. Never affects stats. Optional everywhere: renderers must fall back to seed-based art.

export type HeroArchetype = "knight" | "ranger" | "mage" | "heavy" | "engineer" | "rogue";
export type HeroHeadgear = "helmet" | "hood" | "wizard-hat" | "goggles" | "bandana" | "cat-ears" | "headphones" | "crown" | "antenna" | "beanie" | "none";
export type HeroAccessory = "cape" | "scarf" | "laptop-backpack" | "jetpack" | "sticker-shield" | "rubber-duck" | "coffee-mug" | "tail" | "none";

export interface HeroDesign {
  title: string;             // "Borrow-Checker Paladin" (<= 24 chars)
  archetype: HeroArchetype;
  headgear: HeroHeadgear;
  accessory: HeroAccessory;
  emblem: string;            // 1–2 ASCII chars on the chest, e.g. "λ", "{}", "R"
  palette: string[];         // 4 hex: primary, secondary, skin/visor, accent
  catchphrase: string;       // <= 40 chars, shown on lobby card
}

export type BossBody = "blob" | "serpent" | "spider" | "hydra" | "golem" | "swarm" | "eye" | "tree" | "machine";
export type BossMouth = "maw" | "brackets" | "beak" | "zipper" | "none";
export type BossGrowth = "spikes" | "cables" | "crystals" | "moss" | "servers" | "wings" | "horns" | "tentacles" | "gears" | "pipes";

export interface BossDesign {
  name: string;              // "FLASK, THE MICRO-HORROR"
  epithet: string;           // one-line lore
  body: BossBody;
  eyes: number;              // 1..12
  mouth: BossMouth;
  growths: BossGrowth[];     // 1..3
  palette: string[];         // 5 hex: body dark, body light, glow, accent, eye
  theme: ArenaTheme;
  intro: string[];           // 2–4 terminal lines for the summon cinematic
  taunts: string[];          // 3–6 short lines the boss "says" during the fight
  attackNames: Record<string, string>;  // BossAttack.id -> flavor name (<= 22 chars)
  limbNames: Record<string, string>;    // BossLimb.id -> creature-part name, e.g. "Router Claw"
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
  design?: HeroDesign;       // Gemini look; when present its title/palette override the defaults
  code?: {                   // from CodeDNA, cosmetic only
    tokens: string[];        // projectile glyphs come from these (real keywords of the repo's language)
    signature: string;       // signature move name, a real identifier, e.g. "parse_args()"
    snippet: string;         // one real line shown on the hero card / weapon skin
    identifiers: string[];
  };
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
  heart: string;         // analyzed heart file path (flavor, autopsy)
  seed: number;
  design?: BossDesign;   // Gemini look/flavor; name/palette/theme/attack names already merged into the kit
  code?: {               // from CodeDNA, cosmetic only; renderers paint real code onto the monster
    heartLines: string[];      // scroll inside the heart core
    snippets: string[];        // carved into the body / limbs
    todos: string[];           // bug minions carry these labels; taunts may quote them
    commits: string[];         // taunt material
    tokens: string[];          // boss projectile glyphs
    limbSymbols: Record<string, string[]>; // BossLimb.id -> real symbols of that component
  };
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
  perks: string[];           // perk ids picked at code review
}

export interface BossState {
  x: number; y: number;
  hp: number; maxHp: number;
  phase: 1 | 2 | 3;          // 3 = last stand, protects heart
  limbs: { id: string; hp: number; maxHp: number; broken: boolean }[];
  casting: { attackId: string; t: number; total: number; target: [number, number] | null } | null;
  targetPlayer: string | null;
  enraged: boolean;
  // Hit regions in absolute arena px, owned by sim. Renderer anchors limb art here.
  // id = limb id, or "heart" for the core.
  regions: { id: string; x: number; y: number; r: number }[];
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
  | { type: "hit"; target: "boss" | string; limb?: string; amount: number; x: number; y: number; combo?: number;
      crit?: boolean; direction?: [number, number]; impact?: number; hitStop?: number; source?: string }
  | { type: "telegraph"; attackId: string; name: string; targetPlayer: string | null }
  | { type: "limbBroken"; limb: string; by: string }
  | { type: "downed"; player: string }
  | { type: "revived"; player: string; by: string }
  | { type: "skill"; player: string; skill: SkillKind }
  | { type: "phase"; phase: 1 | 2 | 3 }
  | { type: "pickup"; player: string; kind: Pickup["kind"]; x: number; y: number }
  | { type: "obstacleBroken"; id: number; label: string; x: number; y: number }
  | { type: "perk"; player: string; perk: string }
  | { type: "victory" } | { type: "defeat" };

// Cover: destructible blocks named after real files of the boss repo. Block bullets (both sides).
export interface Obstacle { id: number; x: number; y: number; w: number; h: number; hp: number; maxHp: number; label: string }
// Soul Knight drops from broken limbs, minions and blocks.
export interface Pickup { id: number; kind: "energy" | "heart" | "armor"; x: number; y: number }
// "Code review" at a phase change: sim pauses boss ~5s, 3 pads appear; each player picks by walking onto one.
export interface PerkPad { id: string; name: string; desc: string; x: number; y: number; r: number }
export interface PerkOffer { endsAt: number; pads: PerkPad[]; picked: Record<string, string> } // playerId -> pad id

export interface MatchState {
  t: number;                 // seconds since fight start
  status: "countdown" | "fighting" | "victory" | "defeat";
  players: PlayerState[];
  boss: BossState;
  bullets: Bullet[];
  hazards: Hazard[];
  minions: Minion[];
  events: GameEvent[];       // events produced since the previous snapshot
  obstacles: Obstacle[];
  pickups: Pickup[];
  perkOffer: PerkOffer | null;
}

// ---------- Network protocol (server/ <-> client/app) ----------

export type Role = "player" | "screen";   // screen = spectator big screen

export interface LobbyPlayer {
  id: string; name: string; repo: string | null;
  bot?: boolean;
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
  | { t: "setBots"; count: number }         // owner only: AI teammates to fill the squad (0..7)
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
