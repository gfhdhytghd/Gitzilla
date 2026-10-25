# More varied heroes and bosses

User: "Boss/hero need to vary more: more base designs, more colours/element variations, more combinations."

Goal: any two repos should look clearly different at a glance, both in the lobby and in the fight, while each still reads as its language class and boss archetype. Everything stays deterministic: same repo → same look.

## Measure first (codex-gemini, tooling)
- New `tools/variety-sheet.ts`. Render every hero and boss for the 15 data/fallback repos, plus ~30 synthetic profiles (varied languages, sizes, cycle counts, component counts), into contact sheets (PNG) with the existing renderers in headless Chromium.
- Score variety:
  - pairwise perceptual distance: dHash plus a colour-histogram distance;
  - per-class/archetype "look-alike" clusters;
  - palette entropy.
- Output `docs/variety/summary.json` and the sheets.
- Re-run after the art changes to show the before/after scores.
- No product-file edits.

## Heroes (claude-player, look: client/render/player/)
More bases and combinations driven by repo traits through a seeded RNG:
- 3+ body silhouettes per class.
- Headgear, cape/coat, and shoulder/armour sets.
- Weapon skins per weapon kind.
- Palette families: a primary and accent pair from the language colour plus complementary or triad shifts.
- Trims and patterns: stripes, circuit lines, runes.
- Small "element" accents, e.g. a fire/ice/void/electric aura picked from repo traits, such as test ratio, age or stars.
- Keep pixel crispness, animation frames, and portrait/billboard/voxel compatibility.

## Bosses (claude-boss, look: client/render/boss/)
- More base body plans beyond kaiju/hydra/mecha/abyssal, e.g. serpent/wyrm, insectoid/arachnid, golem, and a floating eye/cluster for small repos.
- Per-archetype variants: horns, spines, plates, tails, heads.
- An element theme with palette and FX tint, chosen from repo traits: e.g. kernel → molten, web → neon, notebook → arcane, enterprise → chrome.
- Limb meshes picked per component.
- Keep layout/hitbox mapping (limbs, heart, weak points), the 3D voxel path and the XR HUD intact. Archetype choice is sim/ (codex-sim); if new archetypes need sim/contract changes, ask the coordinator first.

## Acceptance
- variety-sheet scores improve meaningfully: min pairwise distance up and look-alike clusters down.
- No two of the 15 fallback bosses share base + palette.
- Galleries plus lobby/fight screenshots look good.
- Tests are green.
