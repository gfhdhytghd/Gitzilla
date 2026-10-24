IN PROGRESS: the tenant is configured and the code is tested. Waiting on (1) one real browser login to confirm the GitHub token works with Auth0 dev keys and (2) codex-net wiring. Not blocked.

## USER ACTION
1. **Test the real login (2 min).** The standalone harness is running. If it isn't, start it with `npx tsx auth/demo.ts`. Open **http://localhost:5174**, click *Connect GitHub*, and approve. You should see your `@login`, "token on server: **yes**", and your repo list, including private repos marked 🔒. Tell the coordinator whether it says yes or no.
2. **Recommended: your own GitHub OAuth App.** Without it, GitHub's consent screen says "Auth0" while asking for full `repo` access. If step 1 shows "token: no", this step is required.
   - Go to https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**.
   - Application name: `Gitzilla`
   - Homepage URL: `https://gitzilla.wilflin.me`
   - Authorization callback URL: `https://dev-gw4sxogh75t0p48l.us.auth0.com/login/callback` (exactly this)
   - Leave "Enable Device Flow" off → **Register application** → **Generate a new client secret**.
   - Then either (a) add `AUTH0_GITHUB_CLIENT_ID=…` and `AUTH0_GITHUB_CLIENT_SECRET=…` to `repo-kaiju/.env` and tell claude-auth "github keys in .env" then run `npx tsx auth/setup-github.ts` (patches the connection via the Auth0 CLI without printing the secret), or (b) paste them yourself in the Auth0 Dashboard → Authentication → Social → **github** → Client ID / Client Secret → Save. Keep the "repo" permission checked.

# claude-auth — Connect GitHub via Auth0 (Gitzilla)

## Status
- [x] `auth/index.ts` — login/callback/logout, sealed cookie session, `/api/me`, `/api/me/repos`, GitHub token lookup. Zero new deps.
- [x] `auth/index.test.ts` — 7 tests (seal/unseal, returnTo sanitizing, dotenv parse, full login→callback→session→repos→logout flow with mocked Auth0/GitHub, bad state). `npx vitest run auth/` PASS.
- [x] `auth/demo.ts` — standalone harness on :5174 that runs against the real tenant (dev-only callback).
- [x] Tenant `dev-gw4sxogh75t0p48l.us.auth0.com` (Free plan) configured via CLI, see below.
- [x] `.env` (repo root, gitignored, mode 600): `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_MGMT_CLIENT_ID`, `AUTH0_MGMT_CLIENT_SECRET`, `AUTH0_COOKIE_SECRET`. The auth module reads them itself (root `.env`, then `../.env`; `process.env` wins), so no dotenv dependency is needed.
- [x] Live checks: the M2M client-credentials token works against the Management API (unknown user → 404 as expected). `/auth/login` → Auth0 `/authorize` → 302 to `github.com/login/oauth/authorize` with `scope=read:user,repo`, for both `http://localhost:5173` and `https://gitzilla.wilflin.me` origins. The session cookie gets `Secure` on https / `X-Forwarded-Proto: https`.
- [ ] Real browser login confirming the IdP token (USER ACTION 1)
- [ ] codex-net wiring into server/main.ts (handoff below), then a check on the dev server http://localhost:5175 (never 5173). The coordinator deploys to live.

## Tenant config (Free-plan check)
Checked against the skill's `feature-audit-pricing`. Free includes unlimited social connections and 1,000 M2M tokens/month. Token Vault on Free has a count limit of 2 and needs refresh tokens, the token-exchange grant and Connected Accounts, so I skipped it. No custom domain, no add-ons, no extra tenant.
- App **Gitzilla** (regular_web) `9S1HfsyFTCXD9X3J87YzTUlDhoFhhVu6`: grant `authorization_code` only, `client_secret_post`.
  - Callbacks: `http://localhost:5173/auth/callback`, `https://gitzilla.wilflin.me/auth/callback`, `http://localhost:5174/auth/callback` (demo harness), `http://localhost:5175/auth/callback` (shared dev server).
  - Logout URLs: the same three origins, each + `/auth/logged-out`.
  - Web origins: `http://localhost:5173`, `https://gitzilla.wilflin.me`, `http://localhost:5175`.
  - Ports: 5173 = stable live server (coordinator only; never test against it), 5175 = shared dev server (use this for playtests), 5174 = `auth/demo.ts`.
  - The live worktree `../gitzilla-live/.env` is a symlink to `repo-kaiju/.env`. The auth module reads `<root>/.env`, so the live server gets the AUTH0_* config once it's wired.
- App **Gitzilla Server (M2M)** `TV7RPaUbC6Xec2P396z95n6kE9r7YPuW`: client grant `cgr_JDX3kWLwVtL2TdFA` on the Management API with `read:users read:user_idp_tokens` only.
- Connection **github** `con_eH7WbBKkVA3S6KxO`: strategy github, `read_user` + `repo` (scope `read:user,repo`), enabled only for Gitzilla. It's on Auth0 dev keys for now (see USER ACTION 2). I disabled `google-oauth2` and `Username-Password-Authentication` for both Gitzilla apps, so the login is GitHub-only. The Default App is untouched.
- **M2M quota:** one Management token is cached in memory until 5 min before it expires (24h), and concurrent requests share one in-flight fetch. Each user's GitHub token is fetched once per sign-in and kept in server memory, so it's roughly 1 M2M token per server start or day.

## Design decisions (why)
- **No `@auth0/auth0-server-js`.** The skill's server-js reference fits plain `node:http`, but it's a building block that still needs a hand-written cookie adapter, and the brief prefers zero new deps. The OIDC code flow + PKCE is ~60 lines with `fetch` + `node:crypto`, so I hand-rolled it in the same shape (transaction cookie + stateless encrypted session cookie, like its `CookieTransactionStore` + `StatelessStateStore`).
- **GitHub token via Management API, not Token Vault.** Token Vault needs refresh tokens, the token-exchange grant, connected accounts, and a plan that has it. The Management API "IdP access token" path (`GET /api/v2/users/{id}` → `identities[].access_token`, scope `read:user_idp_tokens`) works on every tenant, including Free, with only a client grant on a separate M2M app, so it's the fastest. The token is cached in server memory per user (GitHub OAuth-app tokens don't expire) and never leaves the server.
- **Session** = AES-256-GCM sealed cookie `rk_session` (`{userId, login, avatar}`, 7 days), `HttpOnly; SameSite=Lax`, plus `Secure` when the request is https (TLS socket or `X-Forwarded-Proto: https` from the tunnel). Stateless, so it survives `tsx watch` restarts. The key comes from `AUTH0_COOKIE_SECRET`.
- **Callback origin** is the origin the browser used (tunnel-aware). Registered callbacks: `http://localhost:5173` and `https://gitzilla.wilflin.me` (+ `localhost:5174` demo, `localhost:5175` dev). A login started from a LAN IP is bounced to `PUBLIC_URL` first.
- With no AUTH0_* env configured: `/api/me` → `{enabled:false,user:null}`, `/auth/*` → 503, and `getSession`/`getGithubToken` → null. Pasting a link still works.

## Handoff → codex-net (server/main.ts)
```ts
import { handleAuthRoute, getSession, getGithubToken } from '../auth/index.ts';

// in server.on('request'), FIRST thing inside the async IIFE (before the `/api/` 404 catch-all):
if (await handleAuthRoute(req, res)) return;   // /auth/login|callback|logout|logged-out, GET /api/me, GET /api/me/repos
```
Private repos — the ws `connection` handler already gets the upgrade `request` (cookies included). Resolve the token when the player's `setRepo` arrives, server-side only:
```ts
wss.on('connection', (ws, request) => { /* keep `request` per client */ });
// on setRepo for that client:
const token = await getGithubToken(request);          // string | null; never send to client / Gemini / logs
analyzeRepo(msg.repo, token ? { token } : undefined); // codex-repo's new option
```
`getSession(request)` → `{ userId, login, avatar } | null` if you want to show the GitHub login/avatar (e.g. default the name to `login`).
Also add `"auth"` to tsconfig.json `include` (coordinator), so `npm run typecheck` covers it. Vitest already picks up `auth/index.test.ts`.

## Handoff → claude-ui (lobby)
Endpoints (same origin, cookie auth, no tokens exposed):
- `GET /api/me` → `{ enabled: boolean, user: { userId, login, avatar } | null }`. Hide the button when `enabled` is false.
- `GET /api/me/repos` → `200 [{ name, full_name, private, language, stars, pushed_at }]`, most recently pushed first (owned + collaborator + org, up to 300). `401` → show "Connect GitHub" again; `502` → GitHub error, show a retry.
- Sign in: full-page navigate to `/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`. Afterwards you land back on the same `/r/ABCD` URL. On failure it returns with `?auth_error=<message>`; show it as a toast.
- Switch account: `/auth/login?switch=1&returnTo=…` (forces the Auth0 login prompt; GitHub may still remember its own session).
- Sign out: navigate to `/auth/logout?returnTo=${encodeURIComponent(location.pathname)}`.
- Navigating away drops the ws. The lobby rejoins with the localStorage resume token in `client/app/net.ts`, which already works, so the player keeps their slot.

UI sketch for the repo picker in the lobby card:
- Signed out: a `[ Connect GitHub ]` button next to the paste-link input.
- Signed in: `avatar` (16 px, pixelated) + `@login` + a small "sign out" link. Below that, a scrollable terminal list with one row per repo: `full_name`, a 🔒 if `private`, a `language` chip, `★stars`, and the relative `pushed_at`. Add a filter box on top.
- Clicking a row sends the existing `{ t: "setRepo", repo: full_name }`. The server attaches the token itself.

## Contract requests
None. The token stays server-side; `setRepo` is unchanged.
