# Gitzilla art direction

Server-only, dependency-free Gemini REST module. Import the six main functions from `./index.ts`:

```ts
const base = playerKitFromProfile(profile);
const kit = applyHeroDesign(base, await designHero(profile, base));
```

`designHero` and `designBoss` always return usable, validated appearance/flavor objects. No key and provider errors silently produce deterministic seed art. Hero application changes `design/title/palette` and an optional `code.weapon.name`; boss application changes `design/name/palette/theme/attacks[].name`. Returned kits preserve balance and source IDs. Boss requests include architecture and attack/limb identity but no HP, damage, cooldowns, or player count.

Hero designs include optional `weaponName` (at most 24 characters), a complete code expression in the hero's language that uses a real repo identifier and conveys the weapon construct. Gemini sees the actual symbol pool, signature and current code weapon vocabulary. Validation rejects prose labels, wrong-language constructs, unknown/substituted identifiers, string-only references, malformed delimiters and overlength expressions; it never slices off syntax. Examples: `await fetch(router)`, `unsafe { search() }`, `yield from app()`. Invalid/omitted model names retain sim's deterministic code name. Legacy/incomplete kits have a small expression fallback; absent/oversized source uses an honest seed literal. The syntax checks do not execute source. `applyHeroDesign` also excludes prose at its name-only boundary and preserves glyphs/FX/stats; old kits never get partial weapon objects. `HeroDesignWithWeapon` is now a compatibility alias for shared HeroDesign.

Flavor lines are complete and short: Gemini taunts≤60 characters, hero catchphrases≤40. Display text clamps at whole word/code-token boundaries with `…`, keeping quotes/calls/brackets balanced. Already-clipped cached prose is repaired; complete source excerpts are retained. Weapon expressions still use their separate complete-expression validation and are never sliced.

Real `profile.dna` now participates in both Gemini prompts and deterministic offline art. Exact identifiers inspire the hero title/catchphrase, tokens become the chest emblem, component symbols/`kit.code.limbSymbols` become limb and attack names, heart code joins the intro, and TODOs/commit subjects become taunts. The bounded source view also includes snippets. Profiles without DNA still work; `kit.code` supplies available cosmetic excerpts.

Boss names use 12 title templates per sim-selected archetype: thunderjaws and dorsal kings for kaiju, many maws and wingstorms for hydra, warframes and rocket fists for mecha, coils and crystal maws for abyssal. The heart path, longest function or a distinctive identifier supplies the subject (directory traversal code inspires `DIRS`). Generic and repo-name subjects are excluded, including names embedded in identifiers; TODO words/tokens supply further source-backed candidates. Source, longest-function data, age, cycles and seed choose the phrase deterministically, independently of squad size. The bundled acceptance test requires distinct saved epithets across every fallback boss and rejects repo-name repetition in the title suffix. Runtime validation applies the same rule to model/cache names, repairing only a colliding name with the source-derived fallback while keeping the remaining model art.

`BossKit.archetype` is authoritative. Design follows the simulation's chosen preset and never chooses movement, attacks, pose timing or airborne windows. The five supplied [boss references](../docs/design-refs/BOSS-README.md) inspire four distinct directions: teal/cyan upright kaiju with bracket fins; gold multi-headed winged hydra; silver/red-visor mecha with vents and missile panels; and black crystalline abyssal serpent with red/cyan veins. These are original creatures, not copied sprites or film character names. Phase 3 adds crystalline corruption and glowing veins to every archetype. Prompts describe the selected preset's animation vocabulary, while the renderer follows `BossState.pose`.

Fallback names, epithets, terminal intros, TODO/commit taunts, palettes and growths fit that archetype. Actual heart code remains in the intro and actual symbols power each creature's core. Body hints are constrained in both the model schema and runtime validation: hydra → `hydra`, mecha → `machine`, abyssal → `serpent`; kaiju allows local armor variants such as rooted bark or rock scales. Source traits can decorate a kaiju but cannot turn the sim's mecha into a hydra. A boss-only art-recipe fingerprint includes the archetype, invalidating older upright-only artwork and isolating different presets for the same source. Hero artwork/code names stay stable. The sim-owned attack/limb name reconciliation remains active at validation/application boundaries.

Private or credentialed analyses must stay room-local. The server already excludes credentialed selections from Gemini refinement. Direct callers can enforce the same behavior with `designHero(profile, kit, { credentialed: true })` or `designBoss(profile, kit, { private: true })`. Either flag returns local DNA-derived art **before** consulting shared jobs/memory, bundled files, disk caches, credentials, network, or `onResult` callbacks. Do not pass a token into this API. Private DNA-derived designs must not be exported to Hall or persisted by callers. Shared profiles have no visibility field, so callers must retain their request's credentialed/private status.

Key lookup: `process.env.GEMINI_API_KEY`, root `.env`, parent `.env`; dotenv accepts `GEMINI_API_KEY` and `GEMINI-API-KEY`. Keys only enter the `x-goog-api-key` header. Primary transport is `POST /v1beta/interactions` with `model`, string `input`, `store:false`, and top-level `response_format:{type:'text',mime_type:'application/json',schema}`. It accepts only `status:'completed'` and reads text from current `steps[type=model_output].content`, with compatibility for earlier `outputs[]`. Reasoning, input/tool blocks, incomplete responses and malformed JSON are excluded. This follows Google's [structured output guide](https://ai.google.dev/gemini-api/docs/structured-output) and [Interactions REST reference](https://ai.google.dev/api/interactions-api).

Primary model: `GEMINI_MODEL` or `gemini-3.8-flash`, then `gemini-3.1-flash-lite`. If both Interactions attempts fail, the same models may use legacy `generateContent` with its original structured-output fields. Authentication/quota errors back off Gemini for two minutes and move directly to DeepSeek. Then DeepSeek's existing JSON path and deterministic fallback keep the game playable. Each request includes response decoding under an abort deadline:8 seconds in the lobby,60 seconds during explicit precomputation. No SDK or new dependencies.

Public lookup order: memory, `.cache/design/`, checked-in `data/design/` (seed and DNA fingerprint checked through `manifest.json`), Gemini, DeepSeek, fallback. Successful live designs are cached with `${slug}:${seed}:${kind}:v2:${sourceFingerprint}`; all squad sizes reuse the same boss design. Source DNA/kit excerpts changing invalidate art even when slug/seed are unchanged. Hero keys include the weapon kind, language and glyph/FX vocabulary; renaming alone does not reroll art, and the hero-only recipe leaves boss names unchanged. Legacy v1 entries are ignored. Concurrent identical lookups share one request. Failed requests are not cached. Bundled designs are reusable offline; use `--force` to generate fresh provider output. The manifest records the actual source/model and Gemini API used, without credentials.

```sh
npx tsx design/precompute.ts                   # Every data/fallback repo
npx tsx design/precompute.ts --offline         # No network, credentials optional
npx tsx design/precompute.ts --force           # Bypass disk/bundled reads
npx tsx design/precompute.ts --force --offline --require-dna  # Fail if source snapshots are not ready
npx tsx design/precompute.ts --force --require-dna --require-gemini  # Fresh Gemini only; stop before overwriting a repo on fallback
npx tsx design/precompute.ts --force pallets/flask facebook/react burntsushi/ripgrep
npx tsc --noEmit -p design/tsconfig.json        # Focused design check
npx vitest run design/
```

Offline mode explicitly disables both Gemini and DeepSeek. `--require-gemini` requires fresh Gemini provenance for both designs before writing each repo; it never relabels fallback output.

Precomputation writes `<owner>__<repo>.hero.json`, `.boss.json`, and a provenance manifest under `data/design/`. A `fallback` source means seed art, not a successful Gemini generation. See `docs/progress/codex-gemini.md` for exact server integration, live verification results, and example JSON.

The JSON Schema mirrors shared enums and requires every attack/limb ID; runtime validation also repairs individual fields. Primary API reference: https://ai.google.dev/api/interactions-api; legacy compatibility: https://ai.google.dev/api/generate-content.

Boss attacks retain a distinct assigned real identifier per attack: source component symbols first, then unused global symbols. Fallbacks allocate the same identifiers as sim; cached/model validation and direct application repair wrong/missing prefixes before lobby publication. A model may retain its short art suffix after the correct source prefix. Attack-name bounds allow64 characters so source calls are not cut; hero weapon expressions remain limited to24. Limb suffixes are distinct, while noncolliding custom limb names survive. Only public boss name-map fields were normalized in bundled assets for this correction; art and combat budgets are unchanged.

Fallback boss disaster suffixes use sim's seeded per-kind phrase pools, with balanced cycling and the first fallback laser named `</> Breath`. Validation/application also normalize legacy pooled suffixes, so cache/model outputs cannot restore a single repeated default phrase. Heart attacks continue the same kind cycle; numeric combat fields never change.
