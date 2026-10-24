# Boss archetypes v1 — varied bosses with their own behavior + animation presets (user: "现在全是哥斯拉，参考我发的其他图，
# 做多变一点，boss 的行为和动画也预设一下")
References: docs/design-refs/boss-1..5.png + BOSS-README.md. Inspiration only — no tracing/copying Toho sprites/names.
Contract (committed): BossKit.archetype, BossState.pose {name,t,total,dir,head?}, BossState.airborne.

## Archetypes (selection is deterministic from REAL repo traits, so the boss still "is" the codebase)
| archetype | look (ref) | chosen when (sim/kits.ts, tune so the 15 fallback repos spread over all four) |
|---|---|---|
| kaiju | classic upright saurian, tall glowing crystalline dorsal fins, long tail (boss-1, boss-4) | default |
| hydra | 2–3 heads on long necks, wings, golden scale palette (boss-2) | many circular deps (cycles ≥ 2) or very high fan-out |
| mecha | armored machine kaiju, red visor eyes, panels/rivets, jet vents (boss-3) | systems languages (C/C++/Rust/Go/Zig) with deep import chains, or infra-heavy repos |
| abyssal | black crystalline serpent-dragon with glowing red/cyan veins, coils (boss-5) | very large or very old repos (LOC / ageDays), or huge TODO debt |
Each keeps the code identity: heart core with real heartLines, carved symbols, bracket-shaped fins/crystals, TODO bugs.

## Behavior + animation presets (same total threat budget for every archetype — style changes, difficulty doesn't)
| archetype | movement | signature attacks (map onto existing BossAttackKind) | poses to animate |
|---|---|---|---|
| kaiju | slow stomp-walk toward the squad's center (screen shake per step), turns to face target | `</> breath` (laser, fins light tail→head as telegraph), tail sweep (fan/ring behind it), stomp quake (slam), charge | idle sway, walk (2-step stomp), windup (fins charging), attack, recover, roar (phase change), stagger (limb break), enrage, death (topple + segfault) |
| hydra | hovers/flies in arcs, lands to rest; airborne = only heads + wings hittable | each head fires its own beam in turn (laser with `head` index), wing gust (fan push), dive bomb (charge → slam), heads spit spirals | fly loop, land, per-head windup/attack (pose.head), wing flap, dive, stagger, roar, death (heads drop one by one) |
| mecha | grounded, short jet hops to reposition, turret-like turning | rocket fist (charge-like projectile), eye laser sweep (laser), missile barrage (summon/ring of homing glyph missiles), shoulder cannon (fan) | idle servo twitch, hop (jets), windup (vents glow), attack, recover (steam), overheat stagger, enrage (panels open), death (explodes into code) |
| abyssal | coils/slithers; burrows under the floor and emerges elsewhere (burrowed = untargetable, telegraphed emerge point) | crystal eruption lines from the ground (cascade/slam), tail lash (fan), vein pulse ring (ring), emerge strike (charge from below) | coil idle, slither, burrow/emerge, vein glow windup, attack, stagger, enrage (veins flare red), death (shatter) |
Phase 3 for ALL archetypes borrows boss-5's look: dark crystalline corruption creeping over the body + glowing veins.

## Owners
- **codex-sim**: archetype selection (+ trace reason for genesis), per-archetype movement + attack deck mapping inside the
  equal threat budget, the pose state machine (emit pose name/t/total/dir/head every tick, airborne windows with clear
  telegraphs), hit regions per archetype via shared/kaiju-anatomy.ts (ask claude-boss to extend it to per-archetype
  anchors, incl. heads/wings). Bot balance sweep must stay in the 55–70% / 150–210s band for each archetype. Tests.
- **claude-boss**: 4 archetype bodies + all poses animated from BossState.pose (no animation logic that contradicts the
  sim), per-archetype FX (breath, missiles, crystal eruptions, wing gusts), phase-3 corruption overlay; extend
  shared/kaiju-anatomy.ts → `bossAnchors(kit)` per archetype (keep kaijuAnchors as an alias). Gallery: `?arch=` +
  `?pose=` filmstrips. Screenshot big screen + phone camera and LOOK.
- **codex-gemini**: Gemini/fallback designs pick names/epithets/taunts that fit the archetype.
- **codex-genesis**: a trace step "why this archetype" (e.g. "4 import cycles → three heads").
- **claude-genesis / claude-ui**: make sure intro cinematic, boss panel portrait and autopsy show the archetype well.
