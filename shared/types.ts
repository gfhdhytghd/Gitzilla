import type { Locale } from './i18n/locale';
import type { ClassroomPlan, ClassroomState, ClassroomReport, ClassroomCommand, InAppFile } from "./classroom";
// Shared contracts. Every module imports from here; change only via the coordinator (Claude, pane wQ:p9).

// ---------- Repo analysis (analysis/ produces, sim/ + render/ consume) ----------

export interface RepoComponent {
  name: string;          // top-level component, e.g. "src/router"
  files: number;
  loc: number;
  fanIn: number;         // how many other components import it
  fanOut: number;
  maintainers?: number;  // distinct commit authors touching this path (bus factor); 1 => fragile organ
  topMaintainers?: string[]; // up to 3 GitHub logins
  issues?: AdoptIssue[]; // open good-first-issue / help-wanted issues mapped to this component
}

// Social impact: real open issues a player can adopt (read-only GitHub API).
export interface AdoptIssue { number: number; title: string; url: string; labels: string[] }
// Social impact (stretch): publicly known vulnerabilities in the repo's declared dependencies (OSV.dev, read-only).
export interface KnownVuln { id: string; pkg: string; ecosystem: string; summary: string; fixed?: string; component?: string }

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
  busFactor?: number;                  // repo-wide: fewest people who account for >50% of commits
  repoIssues?: AdoptIssue[];           // good-first-issue/help-wanted not mapped to a component (up to 10)
  vulns?: KnownVuln[];                 // stretch: OSV.dev matches for declared dependencies
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
  weaponName?: string;       // <= 24 chars code expression, maps into PlayerKit.code.weapon.name (cosmetic)
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

// Edu (classroom PvP): every stat is earned by a real code-quality signal, shown to students as a report card.
export interface QualityStat {
  stat: "hp" | "armor" | "speed" | "damage" | "energy" | "regen" | "weakness";
  value: number;             // the resulting game value
  grade: "A" | "B" | "C" | "D" | "F";
  signal: string;            // "tests: 31% of files", "2 circular dependencies", "avg function 14 lines"
  tip: string;               // how to improve it in real code: "Break the cycle api <-> db to lose the weakness"
}

// ---------- Edu rubric + feedback (teacher uploads how repos are judged; students get feedback after the fight) ----------

// Signals the server can measure for a repo (analysis/ + sim quality). "check" = a custom yes/no rule.
export type RubricSignal = "tests" | "modularity" | "cohesion" | "documentation" | "size" | "cycles" | "tech-debt"
  | "function-length" | "readme" | "ci" | "license" | "typing" | "commits" | "check";

export interface RubricCriterion {
  id: string;
  name: string;              // teacher's wording, e.g. "Unit tests"
  weight: number;            // relative weight (normalized server-side)
  signal: RubricSignal;
  description: string;       // teacher's text for this criterion (shown to students)
  check?: { kind: "path-exists" | "path-absent" | "max-file-loc" | "min-commits" | "language"; value: string | number };
  target?: number;           // optional pass threshold in the signal's natural unit (e.g. tests 0.2 = 20% of files)
}

export interface Rubric {
  title: string;
  criteria: RubricCriterion[];
  source: "doc" | "default";   // parsed from the teacher's document, or the built-in default
  unparsed?: string[];         // doc lines the parser couldn't map (teacher reviews them)
}

export interface CriterionResult { criterionId: string; score: number; evidence: string; tip?: string } // score 0..1

export interface StudentFeedback {
  playerId: string; name: string; repo: string;
  rubricScore: number;                 // 0..100, weighted
  results: CriterionResult[];
  strengths: string[];                 // 1–3, grounded in real files/numbers
  improvements: { text: string; file?: string }[];  // 1–3 concrete next steps
  match: { rank: number; kos: number; damage: number; roundWins: number; quiz?: string }; // how they played
  summary: string;                     // 2–3 sentence friendly teacher-style note
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
  quality?: QualityStat[];   // edu mode only: stats come from code quality (not equal budget), each with its reason
  pvpPower?: { score: number; parts: { label: string; value: number; weight: number }[] }; // PvP royale: repo power 0–100 (parts 0–100, weights sum 1)
  code?: {                   // from CodeDNA, cosmetic only
    tokens: string[];        // projectile glyphs come from these (real keywords of the repo's language)
    signature: string;       // signature move name, a real identifier, e.g. "parse_args()"
    snippet: string;         // one real line shown on the hero card / weapon skin
    identifiers: string[];
    weapon?: {               // the weapon as a code construct, e.g. "goroutine SMG" firing "go"/"<-ch"
      name: string;          // <= 24 chars, a real-looking code expression, e.g. "for { go serve() }"
      projectiles: string[]; // 1–4 short literal glyph strings the bullets are made of
      muzzle: string;        // flash text when firing, e.g. "fork()", "yield"
      impact: string;        // hit spark text, e.g. "Err", "0xDEAD", "panic!"
    };
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
  fragile?: boolean;     // single-maintainer component -> cracked glowing organ, takes critical hits
  maintainers?: number;
  issues?: AdoptIssue[]; // "Adopt this organ" in the autopsy
  parasites?: KnownVuln[]; // stretch: vulns living in this organ
}

// Boss archetypes: distinct silhouette + movement + attack/animation presets (inspired by docs/design-refs/boss-*.png;
// never copies of Toho designs). The sim picks one deterministically from real repo traits (see sim/kits.ts).
export type BossArchetype =
  | "kaiju"    // classic upright saurian, glowing crystalline dorsal fins, stomp-walk, tail sweep, '</>' breath
  | "hydra"    // multi-headed winged dragon (cyclic repos): hovers, wing gusts, each head fires its own beam, dive
  | "mecha"    // armored machine kaiju (systems languages / heavy infra): rocket fists, eye lasers, missile barrages, jet hop
  | "abyssal"; // black crystalline serpent-dragon with glowing veins (huge/old repos): coils, burrows, crystal eruptions

// What the boss body is doing right now; the sim drives it, renderers animate it (so art and gameplay stay in sync).
export type BossPose = "idle" | "walk" | "windup" | "attack" | "recover" | "fly" | "dive" | "burrow" | "emerge"
  | "stagger" | "roar" | "enrage" | "death";

export interface BossKit {
  repo: string;
  archetype: BossArchetype;
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
  eliminated?: boolean;      // pvp royale: knocked out for good -> spectating
  killedBy?: string | null;
}

export interface BossState {
  x: number; y: number;
  hp: number; maxHp: number;
  phase: 1 | 2 | 3;          // 3 = last stand, protects heart
  limbs: { id: string; hp: number; maxHp: number; broken: boolean }[];
  casting: { attackId: string; t: number; total: number; target: [number, number] | null } | null;
  targetPlayer: string | null;
  enraged: boolean;
  pose: { name: BossPose; t: number; total: number; dir: [number, number]; head?: number }; // head = which head acts (hydra)
  airborne: boolean;         // hydra in flight / abyssal burrowed: changes what can be hit (sim decides)
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

export interface PvpState {
  round: number; rounds: number;            // best-of rounds
  roundEndsAt: number;                      // match time (s) when the round ends
  scores: Record<string, { kos: number; downs: number; damage: number; roundWins: number }>;
  leader: string | null;
  // mode "pvp" = last-one-standing royale for 2–8 players (no respawns). edu keeps rounds/respawns.
  royale?: {
    alive: string[];                       // player ids still in
    placements: Record<string, number>;    // id -> final place (1 = winner); filled as players are eliminated
    zone: { cx: number; cy: number; r: number; targetR: number; shrinkStart: number; shrinkEnd: number; dps: number } | null;
                                           // "GC sweep": outside the circle you take dps; shrinks over [shrinkStart, shrinkEnd] (match time, s)
    winner: string | null;
    eliminations?: { player: string; by: string | null; at: number; placement: number; reason: "weapon" | "zone" | "left" | "timeout" }[];
  };
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
  | { type: "perk"; player: string; perk: string; correct?: boolean }
  | { type: "lesson"; concept: Concept; ref?: string; facts?: Record<string, string | number> } // edu: real data for the card
  | { type: "victory" } | { type: "defeat" };

// Cover: destructible blocks named after real files of the boss repo. Block bullets (both sides).
export interface Obstacle { id: number; x: number; y: number; w: number; h: number; hp: number; maxHp: number; label: string }
// Soul Knight drops from broken limbs, minions and blocks.
export interface Pickup { id: number; kind: "energy" | "heart" | "armor"; x: number; y: number }
// "Code review" at a phase change: sim pauses boss ~5s, 3 pads appear; each player picks by walking onto one.
export interface PerkPad { id: string; name: string; desc: string; x: number; y: number; r: number;
  answer?: string;           // edu quiz: the answer text on this pad (a real component/file/name)
  correct?: boolean;         // edu quiz: revealed after the offer ends (sim may omit until then)
}
export interface PerkOffer { endsAt: number; pads: PerkPad[]; picked: Record<string, string>; // playerId -> pad id
  quiz?: { question: string; explain: string; concept: string }; // edu mode: pads are answers; explain shown after
}

// ---------- Education mode ----------
export type GameMode = "battle" | "edu" | "pvp";
// Concepts the lesson engine knows; sim/server tag events with them so the client can teach in context.
export type Concept = "dependency-graph" | "fan-in" | "fan-out" | "heart-module" | "circular-dependency" | "coupling"
  | "component" | "cascade" | "dead-code" | "tech-debt" | "test-coverage" | "recursion" | "stack-overflow" | "race-condition"
  | "memory-leak" | "merge-conflict" | "force-push" | "dependency-hell" | "null-pointer" | "infinite-loop" | "refactor"
  | "bus-factor" | "good-first-issue" | "open-source-maintenance" | "supply-chain" | "vulnerability"
  | "code-quality" | "modularity" | "cohesion" | "documentation" | "code-size";

// Accessibility (social impact #4): per-player, client-side; sent to nobody.
export type MotionProfile = "standard" | "seated" | "tap-only"; // seated = small tilt/nod enough; tap-only = no motion

export interface MatchState {
  t: number;                 // seconds since fight start
  status: "countdown" | "fighting" | "victory" | "defeat";
  // Host pause: while set, the server does not step the match (every timer freezes). resumeAt = server time (ms epoch)
  // when a requested resume takes effect (3s countdown), null while fully paused.
  paused?: { by: string; since: number; resumeAt: number | null } | null;
  mode: GameMode;
  players: PlayerState[];
  boss: BossState | null;    // null in edu (classroom PvP): heroes fight each other
  heroScale: number;         // 1 in battle; 2 in edu (bigger, higher-detail heroes)
  pvp: PvpState | null;      // edu only
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

// ---------- Genesis: the visible code -> character pipeline ----------
// Streamed while a repo is analyzed, then kept so the client can replay the "compile" cinematic.

export type GenesisStage = "clone" | "parse" | "graph" | "dna" | "map" | "design" | "ready";

export interface GenesisProgress {
  stage: GenesisStage;
  pct: number;               // 0..1 within the whole pipeline
  paths?: string[];          // a few real file paths just processed (clone/parse), <= 8 per update
  note?: string;             // e.g. "resolving 1,204 imports"
}

// One visible mapping step: a real fact about the repo becoming part of the character.
export interface TraceStep {
  from: string;              // "language: Rust 78%", "heart: src/core.js (fan-in 41)", "TODO x12"
  to: string;                // "weapon: unsafe{} Cannon", "core: pulsing heart", "minions: 12 bugs"
  part: "class" | "weapon" | "skill" | "stats" | "palette" | "limb" | "heart" | "weakpoint" | "eyes" | "minions"
      | "attack" | "theme" | "name" | "glyphs" | "cape" | "scars";
  ref?: string;              // component / limb / attack id / file this step refers to
}

export interface Genesis {
  slug: string;
  languages: Record<string, number>;
  metrics: { files: number; loc: number; functions: number; todos: number; contributors: number; commits: number; ageDays: number; testRatio: number };
  components: { name: string; loc: number; files: number }[];
  edges: [number, number][];
  cycles: string[][];
  heart: string; heartFanIn: number;
  sampleFiles: string[];     // ~40 real paths for the file-tile storm
  snippets: string[];        // a few real lines for the code-rain
  trace: TraceStep[];        // ordered: the story of how this repo became this hero/boss
  budget: { label: string; value: number }[]; // equal stat budget split, e.g. hp 2, armor 1, speed 1, damage 1
}

export interface LobbyPlayer {
  id: string; name: string; repo: string | null;
  bot?: boolean;
  controlsReady?: boolean;     // false = a phone that still has to tap "enable motion" this session
  progress?: GenesisProgress;  // while status === "analyzing"
  genesis?: Genesis;           // once ready
  rubricPreview?: CriterionResult[]; // edu: measured pre-fight scores for the current teacher rubric
  status: "empty" | "analyzing" | "ready" | "error";
  error?: string;
  kit: PlayerKit | null;
}

export interface LobbyState {
  locale?: Locale;
  room: string;
  ownerId: string;
  players: LobbyPlayer[];
  boss: { repo: string | null; status: "empty" | "analyzing" | "ready" | "error"; error?: string; kit: BossKit | null;
          progress?: GenesisProgress; genesis?: Genesis };
  phase: "lobby" | "match" | "autopsy";
  mode: GameMode;            // owner toggles; default "battle"
  classroom?: ClassroomState; // staged cooperative classroom; no motion controls
  rubric?: Rubric;           // edu: the teacher's grading rubric (visible to everyone in the room)
}

export type ClientMsg =
  | { t: "classroomLanguage"; locale: Locale }
  | { t: "classroomPlan"; plan: ClassroomPlan }
  | { t: "classroomControl"; action: ClassroomCommand }
  | { t: "classroomSubmit"; repo: string; ref?: string }
  | { t: "classroomSubmitCode"; files: InAppFile[] }   // in-app editor submission (≤ 20 files, ≤ 200 KB total)
  | { t: "classroomReview"; playerId: string; score: number; note: string }
  | { t: "hello"; room: string; role: Role; name: string; resume?: string }
  | { t: "setRepo"; repo: string }
  | { t: "setBoss"; repo: string }          // owner only
  | { t: "setBots"; count: number }         // owner only: AI teammates to fill the squad (0..7)
  | { t: "setMode"; mode: GameMode }        // owner only, lobby only
  | { t: "controls"; ready: boolean; mode: MotionProfile }  // phone reports: motion permission granted & sensors live (or touch chosen)
  | { t: "setRubric"; rubric: Rubric }      // owner only, edu, lobby (after previewing POST /api/rubric/parse)
  | { t: "pause"; paused: boolean }        // owner only, during a match: true = pause now, false = resume after 3s
  | { t: "leave" }                          // leave for good: free the slot, transfer ownership, forget the resume token
  | { t: "start" }                          // owner only, needs >=1 ready player (4+ recommended)
  | { t: "input"; frame: InputFrame }
  | { t: "rematch" };                       // owner only

export type ServerMsg =
  | { t: "classroom"; state: ClassroomState; reports: Record<string, ClassroomReport>; errors?: Record<string, string> }
  | { t: "welcome"; you: string; token: string; lobby: LobbyState }
  | { t: "lobby"; lobby: LobbyState }
  | { t: "snapshot"; state: MatchState; ack: number }
  | { t: "autopsy"; result: Autopsy }
  | { t: "feedback"; items: StudentFeedback[] }  // edu, after the match: a student gets only their own; owner/screen get all
  | { t: "error"; message: string };

export interface Autopsy {
  mode: GameMode;
  victory: boolean;          // battle: squad beat the boss; edu: always false, read `ranking`
  ranking?: { id: string; name: string; repo: string; kos: number; damage: number; roundWins: number; quality: QualityStat[] }[];
  duration: number;
  boss: { repo: string; limbs: { component: string; broken: boolean; damageTaken: number;
    fragile?: boolean; maintainers?: number; issues?: AdoptIssue[]; parasites?: KnownVuln[] }[]; heart: string;
    busFactor?: number; repoIssues?: AdoptIssue[] } | null;   // null in edu PvP
  players: { id: string; name: string; repo: string; stats: PlayerState["stats"] }[];
  mvp: string | null;
}
