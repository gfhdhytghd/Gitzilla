# Gitzilla art direction

Server-only, dependency-free Gemini REST module. Import the six main functions from `./index.ts`:

```ts
const base = playerKitFromProfile(profile);
const kit = applyHeroDesign(base, await designHero(profile, base));
```

`designHero` and `designBoss` always return usable, validated appearance/flavor objects. No key and provider errors silently produce deterministic seed art. Hero application changes `design/title/palette` and an optional `code.weapon.name`; boss application changes `design/name/palette/theme/attacks[].name`. Returned kits preserve balance and source IDs. Boss requests include architecture and attack/limb identity but no HP, damage, cooldowns, or player count.

Hero designs include optional `weaponName` (at most 24 characters), a complete code expression in the hero's language that uses a real repo identifier and conveys the weapon construct. Gemini sees the actual symbol pool, signature and current code weapon vocabulary. Validation rejects prose labels, wrong-language constructs, unknown/substituted identifiers, string-only references, malformed delimiters and overlength expressions; it never slices off syntax. Examples: `await fetch(router)`, `unsafe { search() }`, `yield from app()`. Invalid/omitted model names retain sim's deterministic code name. Legacy/incomplete kits have a small expression fallback; absent/oversized source uses an honest seed literal. The syntax checks do not execute source. `applyHeroDesign` also excludes prose at its name-only boundary and preserves glyphs/FX/stats; old kits never get partial weapon objects. `HeroDesignWithWeapon` is now a compatibility alias for shared HeroDesign.

Real `profile.dna` now participates in both Gemini prompts and deterministic offline art. Exact identifiers inspire the hero title/catchphrase, tokens become the chest emblem, component symbols/`kit.code.limbSymbols` become limb and attack names, heart code joins the intro, and TODOs/commit subjects become taunts. The bounded source view also includes snippets. Profiles without DNA still work; `kit.code` supplies available cosmetic excerpts.

Fallback boss surnames use a pool of 16 base phrases plus code-specific, cycle, age, TODO, and commit-vibe phrases. The heart path, longest function or a distinctive identifier supplies the subject (directory traversal code inspires `DIRS`). Generic and repo-name subjects are excluded, including names embedded in identifiers; TODO words/tokens supply further source-backed candidates. Source, longest-function data, age, cycles and seed choose the phrase deterministically, independently of squad size. The bundled acceptance test requires distinct saved epithets across every fallback boss and rejects repo-name repetition in the title suffix.

Private or credentialed analyses must stay room-local. The server already excludes credentialed selections from Gemini refinement. Direct callers can enforce the same behavior with `designHero(profile, kit, { credentialed: true })` or `designBoss(profile, kit, { private: true })`. Either flag returns local DNA-derived art **before** consulting shared jobs/memory, bundled files, disk caches, credentials, network, or `onResult` callbacks. Do not pass a token into this API. Private DNA-derived designs must not be exported to Hall or persisted by callers. Shared profiles have no visibility field, so callers must retain their request's credentialed/private status.

Key lookup: `process.env.GEMINI_API_KEY`, root `.env`, parent `.env`; dotenv accepts `GEMINI_API_KEY` and `GEMINI-API-KEY`. Keys only enter the `x-goog-api-key` header. Primary model: `GEMINI_MODEL` or `gemini-3.8-flash`; one retry: `gemini-3.1-flash-lite`. Each attempt has an 8-second abort deadline, including response decoding. No SDK or new dependencies.

Public lookup order: memory, `.cache/design/`, checked-in `data/design/` (seed and DNA fingerprint checked through `manifest.json`), Gemini, fallback. Successful live designs are cached with `${slug}:${seed}:${kind}:v2:${sourceFingerprint}`; all squad sizes reuse the same boss design. Source DNA/kit excerpts changing invalidate art even when slug/seed are unchanged. Hero keys include the weapon kind, language and glyph/FX vocabulary; renaming alone does not reroll art, and the hero-only recipe leaves boss names unchanged. Legacy v1 entries are ignored. Concurrent identical lookups share one request. Failed requests are not cached. Bundled fallback assets are deliberately reusable offline; use `--force` to refresh them with Gemini after provider access is restored.

```sh
npx tsx design/precompute.ts                   # Every data/fallback repo
npx tsx design/precompute.ts --offline         # No network, credentials optional
npx tsx design/precompute.ts --force           # Bypass disk/bundled reads
npx tsx design/precompute.ts --force --offline --require-dna  # Fail if source snapshots are not ready
npx tsx design/precompute.ts --force pallets/flask facebook/react burntsushi/ripgrep
npx tsc --noEmit -p design/tsconfig.json        # Focused design check
npx vitest run design/index.test.ts
```

Precomputation writes `<owner>__<repo>.hero.json`, `.boss.json`, and a provenance manifest under `data/design/`. A `fallback` source means seed art, not a successful Gemini generation. See `docs/progress/codex-gemini.md` for exact server integration, live verification results, and example JSON.

The JSON Schema mirrors shared enums and requires every attack/limb ID; runtime validation also repairs individual fields. API reference: https://ai.google.dev/api/generate-content.
