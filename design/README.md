# Repo Kaiju art direction

Server-only, dependency-free Gemini REST module. Import the six main functions from `./index.ts`:

```ts
const base = playerKitFromProfile(profile);
const kit = applyHeroDesign(base, await designHero(profile, base));
```

`designHero` and `designBoss` always return usable, validated appearance/flavor objects. No key and provider errors silently produce deterministic seed art. Hero application changes only `design/title/palette`; boss application changes only `design/name/palette/theme/attacks[].name`. Returned kits preserve balance and source IDs. Boss requests include architecture and attack/limb identity but no HP, damage, cooldowns, or player count.

Key lookup: `process.env.GEMINI_API_KEY`, root `.env`, parent `.env`; dotenv accepts `GEMINI_API_KEY` and `GEMINI-API-KEY`. Keys only enter the `x-goog-api-key` header. Primary model: `GEMINI_MODEL` or `gemini-3.8-flash`; one retry: `gemini-3.1-flash-lite`. Each attempt has an 8-second abort deadline, including response decoding. No SDK or new dependencies.

Lookup order: memory, `.cache/design/`, checked-in `data/design/` (seed checked through `manifest.json`), Gemini, fallback. Successful live designs are cached with `${slug}:${seed}:${kind}:v1`; all squad sizes reuse the same boss design. Concurrent identical lookups share one request. Failed requests are not cached. Bundled fallback assets are deliberately reusable offline; use `--force` to refresh them with Gemini after provider access is restored.

```sh
npx tsx design/precompute.ts                   # Every data/fallback repo
npx tsx design/precompute.ts --offline         # No network, credentials optional
npx tsx design/precompute.ts --force           # Bypass disk/bundled reads
npx tsx design/precompute.ts --force pallets/flask facebook/react burntsushi/ripgrep
npx tsc --noEmit -p design/tsconfig.json        # Root tsconfig does not yet include design/
npx vitest run design/index.test.ts
```

Precomputation writes `<owner>__<repo>.hero.json`, `.boss.json`, and a provenance manifest under `data/design/`. A `fallback` source means seed art, not a successful Gemini generation. See `docs/progress/codex-gemini.md` for exact server integration, live verification results, and example JSON.

The JSON Schema mirrors shared enums and requires every attack/limb ID; runtime validation also repairs individual fields. API reference: https://ai.google.dev/api/generate-content.
