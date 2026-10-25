# Repo suggestions: a bigger pool, shuffled, plus live rising repos from GitHub

User: "Don't always show the same few recommended projects. Show more, and fetch some new/rising projects from GitHub in real time."

## Contract (shared/types.ts): `RepoSuggestion`, `SuggestionsResponse`, `GET /api/suggestions?n=8&lang=<optional>`

## Server (codex-repo)
- **Curated pool.** Grow it to ~80 well-known public repos across ≥ 12 languages and a range of sizes: small, medium, huge, CLI tools, games, ML, web frameworks, languages and compilers. Keep it as data in analysis/ or data/. Mark the 15 with pre-analyzed fallbacks (`fallback: true`).
- **Trending.**
  - Live GitHub search through the server's GITHUB_TOKEN, e.g. `created:>{30 days ago} stars:>200 sort:stars` plus a per-language "pushed recently, fast-rising" query.
  - Exclude forks, archived repos, repos with a huge tarball (size > ~200 MB), and empty, NSFW-looking or non-code repos (e.g. awesome-lists, pure docs). Keep descriptions plain text.
  - Cache: 1 h TTL, single-flight, served stale on error; never block a request on GitHub.
  - With no token, or if rate-limited, return curated only and `trendingAt: null`.
- **Response.** A shuffled mix: about 2/3 curated and 1/3 trending, de-duplicated, with no repo repeated across 3 consecutive requests from the same session if possible. `n` is clamped to 4–16, and `lang` filters.
- Keep `/api/fallbacks` for the existing callers.
- Tests: mock the GitHub search, cover the cache/TTL, the filters, the mix ratio and the offline fallback.
- No tokens reach the client.

## UI (claude-ui)
- The lobby hero chips and the boss picker use `/api/suggestions`. Show 8 chips with a language dot, ★ stars (compact, e.g. 12.3k) and a small "🔥 new" badge on trending ones. Add a "↻ more" button that fetches a fresh mix.
- A tooltip or long-press shows the description.
- In PvP, still hide suggestions (own repo only).
- Phone layout: two rows, horizontally scrollable, no overflow.
