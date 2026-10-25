DONE (headset `required` pairPanel) — `pairPanel(app, { required })` renders the headset card: a big 3-step card (① sign in with GitHub here → ② on your phone open host/r/ROOM signed in as @login + big room code → ③ tap "<the phone's exact button text>") with a live status line: "Sign in first…" → "Waiting for your phone…" → "📱 Phone connected ✓ · choose controls on your phone" → "📱 Phone connected ✓ · ready to fight" (from `LobbyPlayer.paired` + `controlsReady`), plus a disconnect button. All copy is in en/zh/es/fr. WebKit `?device=headset` on :5175: 6/6 PASS, 0 page errors (`docs/shots/2026-10-25T08-21-17-605Z-pair-headset/`).
- **API for take-ui:** `required?: boolean | (() => boolean)`. When omitted it defaults to `globalThis.__kaijuDevice === "headset"` or `?device=headset`, so it already works with device.ts's playtest hook. Pass `required: () => getDevice() === "headset"` once device.ts exports a sync getter. The existing lobby mount (`pairPanel(app)`) picks it up with no lobby change. For the game/XR pre-entry overlay, use `pairPanel(app, { compact: true, required: true })`. The compact variant doesn't move itself.
- **Placement:** in the lobby the required card moves itself above `.lobby-grid`, full width (max 1180px). Inside the 300px you-panel column the big type wrapped a word or two per line, so I moved it. Elsewhere it moves to the top of its parent.
- **Vision Pro styling:**
  - Unifont at an integer 2× (32px) for body text, Press Start 2P at 3× (24px) for headings, the URL at 32px and the room code at 40px.
  - Near-white on #05080a. The current step is amber with a pulsing number, done steps are green ✓, and essential text is never dim grey.
  - Touch targets are at least 64–72px, with generous padding. Animations are off under reduced motion.
- **Verified** (1280×720 @2×, the default Vision Pro Safari window):
  - Signed out: step 1 is current and Connect GitHub shows. Signed in: step 2 is current with the URL, @login and code, and the status says waiting. The card sits above the grid at more than 900px wide, with 32px body text.
  - A real iPhone 15 controller links and the status reads "choose controls". After the phone picks touch, it reads "ready to fight". Headset disconnect goes back to waiting, and the phone gets the unlinked card.
  - zh card checked. Desktop without the flag keeps the normal small panel. Screenshots inspected.
- **Not mine (take-ui):** hiding the headset's own motion prompt and keyboard readiness, the start gating, and 3D on by default. The lobby squad card already showed "📱 waiting for controls" for the headset seat during my run. Not tested on a real Vision Pro.

DONE (TDZ re-check, take-ui report) — In `createControllerScreen` the `subscribeMotionPermission(...)` call runs after `controlsCard`, `paintSensor`, `paintControls` and `paint`, so its immediate callback can't hit the TDZ. The current file has it at pair.ts:380, after the definitions at :272/:274/:282/:311. I moved it before the first passing e2e run (07:26Z); take-ui's report described the pre-fix file. Re-ran the real display + iPhone 15 WebKit e2e on :5175 (actual main.ts, controller-link.ts and pair.ts, no stubs): 11/11 PASS, 0 page errors, no client edits during the run. Evidence: `docs/shots/2026-10-25T07-38-39-238Z-pair-controller/` (summary.json + pair-e2e.mts).

DONE (pair-controller end cards) — the replaced / unlinked / error end cards now offer "link this phone again" and "play on this phone instead" (plus "back to start"). One minimal main.ts edit, coordinator-requested: `createControllerScreen` gets `relink` (close link → new controller link) and `playHere` (close link → normal `joinPlayer()`). WebKit E2E on :5175: 11/11 PASS, 0 page errors (`docs/shots/2026-10-25T07-36-56-149Z-pair-controller/`).
- **New E2E steps:**
  - The replaced card shows both buttons. Relink takes the controls back, the other phone becomes "replaced", and the relinked phone keeps receiving its seat's snapshots.
  - The display "disconnect" in the lobby shows the unlinked card (es), and relink re-binds (display shows "Phone connected ✓" again).
  - After a second unlink, "play on this phone instead" goes through the name gate and joins the lobby as a normal player.
- **Flaky runs:**
  - Two failed runs happened while other agents saved `main.ts` (07:35:45Z) and `game.ts`/`view25d.ts` (07:37:31Z) on the shared dev server. A Vite full reload of both pages mid-test fits that; I didn't confirm it from logs.
  - Two runs with no overlapping edits passed 11/11: 07:35:18Z and 07:36:56Z.
  - One more failure at 07:33Z, during the relink step, didn't line up with any edit I checked. The diagnostics I added afterwards never caught it again.
- Joining as a player mid-match is refused by the server ("match in progress"), which is expected. So play-here is tested in a lobby-phase room.

DONE (pair-controller visuals) — phone-as-controller UI (GitHub-linked, no QR/codes): `client/app/pair.ts` + `pair.css` + `pair-copy.ts` (en/zh/es/fr) + `pair-copy.test.ts`, minimal lobby mount. take-ui owns the logic (`controller-link.ts`, main.ts routing); codex-net owns the server. WebKit E2E on :5175 PASS 9/9, 0 page errors. Screenshots: `docs/shots/2026-10-25T07-28-18-361Z-pair-controller/`.

## Pair controller — visuals (2026-10-25)
**Files (mine):** `client/app/pair.ts`, `client/app/pair.css`, `client/app/pair-copy.ts`, `client/app/pair-copy.test.ts`. Lobby mount in `client/app/lobby.ts` (4 lines: import, `const pair = pairPanel(app)`, `pair.el` after `youCard` in the you-panel, `pair.update(app)` at the top of `render()`, `pair.destroy()` in destroy). No net/shared/server/main.ts/game.ts edits. QR/code work was never started, so nothing to drop.

**Exports**
- `pairPanel(app, { onUnlink?, compact? }) → { el, update(app), destroy() }`. Display side, "📱 Use your phone as the controller". It renders only for a `role:"player"` seat that's GitHub-enabled, not a bot, not edu, and not on a phone. States, via `data-state`:
  - `signed`: "Open host/r/ROOM on your phone, signed in as @login", a big room code and "copy link".
  - `signin`: a "Connect GitHub" button that goes to `/auth/login?returnTo=<here>`.
  - `paired`: "📱 Phone connected ✓" with a "disconnect" button that sends `pairEnd` on `app.conn`.
- `createControllerOffer({ room, seat, user?, onConnect, onSkip }) → { el, setBusy, setError, destroy }`. The phone's one-tap card. It fetches `/api/me` for the avatar and login, and shows a takeover note when `seat.paired`.
- `createControllerScreen({ room, link, onDisconnect?, relink?, playHere? }) → { el, destroy }`. It consumes take-ui's `ControllerLink`: `onMessage` for lobby/snapshot, `onState` for open/connecting/replaced/kicked/unlinked/error.
  - Shows the hero portrait, name, title and repo, with HP/armor/energy bars.
  - "Look at your big screen 👀", plus a phase line: waiting / FIGHT! / DOWNED / VICTORY / DEFEAT.
  - The controls card (client/input permission, touch, sensitivity, training) shows in the lobby or until controls are ready. During the fight there's a sensor pill and ⟲ recalibrate.
  - A stick pad over client/input's touch surface, with a knob that follows `frame.move`.
  - Big DASH / SKILL buttons whose cooldown fill rises from the bottom; a press is OR'ed into the next frame.
  - Haptics and a red edge flash on hits; a vibration pattern on downed, revived, limb broken, victory and defeat.
  - Sends `input` at 30 Hz only while the match is live, and `controls` on every permission change and welcome.
  - End cards for unlinked, replaced, kicked and error.

**Handoff → claude-ui (game.ts / XR pre-entry overlay):** don't import from main.ts; mount it like this:
```ts
import { pairPanel } from "./pair";
// in createGame, next to the other overlay children (e.g. right after `lateQr` is created), desktop/XR only:
const pair = pairPanel(app, { compact: true });
overlay.append(pair.el);            // or the XR pre-entry overlay root
// in the screen's update(app):  pair.update(app);
// in destroy():                 pair.destroy();
```
It hides itself on phones, spectator screens, edu and once paired→ it shows the small "Phone connected ✓" line instead. If that's too much during the fight, toggle `pair.el.hidden` when `latest.status === "fighting"`; it's meant for waiting/countdown and the XR "enter" screen.

**main.ts end-card hooks:** done (see the top entry). `relink` and `playHere` are passed from `showController`.

**Verification**
- `npm run typecheck`: PASS (0 errors).
- `npx vitest run client/app auth`: 51 PASS (6 files), including 3 new copy tests: four locales per key, placeholder parity, and the exact server takeover text.
- WebKit E2E on DEV http://localhost:5175 (never 5173): script `docs/shots/…-pair-controller/pair-e2e.mts`, `summary.json` PASS.
  - **Identity:** both devices carry the same fixture Auth0 session. It's a sealed `rk_session` for `github|970001` / `@gz-tester`, minted with the dev cookie key from `.env` and never printed. No real GitHub login.
  - **Display:** desktop Safari 1440. Signed-in panel shows the room URL and @login; signed-out panel shows Connect GitHub.
  - **Linking:** the iPhone 15 gets the offer, then one tap opens the controller screen and the display panel flips to "Phone connected ✓".
  - **Raid:** the display owner starts a raid against expressjs/express. A phone drag moved the hero right on the server (x 64 → 127). The phone DASH starts a cooldown, matching the display HUD's 1.6 s dash.
  - **Resume and takeover:** reloading the phone resumes the binding with no offer. A second phone (zh) gets the takeover offer; the first phone shows "Another phone took over the controls".
  - **Unlink:** after the second phone disconnects, the display loses `paired`. A signed-out phone joins as a normal player with no offer.
- I looked at the screenshots: offer card, lobby and fight controller screens, zh controller, takeover end card, display lobby panel (signed / sign-in / paired), and the display fight.
- **Not verified:** a real iPhone or Vision Pro, real DeviceMotion, a real GitHub sign-in, and an expired session.

DONE — Auth0 "Connect GitHub" is shipped and wired (scope frozen by the coordinator).
Summary:
- `auth/index.ts`: OIDC code flow + PKCE, AES-GCM `HttpOnly` session cookie (`Secure` on https), `/auth/login|callback|logout|logged-out`, `GET /api/me`, `GET /api/me/repos` (+ PvP fields from codex-net), `getSession` / `getGithubToken` for the ws upgrade. Zero deps.
- Tenant `dev-gw4sxogh75t0p48l.us.auth0.com` (Free plan): app "Gitzilla", M2M "Gitzilla Server" (`read:users read:user_idp_tokens`), GitHub connection (`read:user repo`). Secrets are only in gitignored `.env` (live worktree symlinks it).
- Verified: auth tests pass. On the dev server http://localhost:5175, `/api/me` → `{enabled:true}` and `/auth/login` → Auth0 authorize with a `localhost:5175` callback → GitHub (`scope=read:user,repo`). The real M2M token works against the Management API.
- Not verified by me: a full human GitHub sign-in (it needs a browser login). See USER ACTION.

## USER ACTION (optional but recommended)
1. **Smoke a real login:** on http://localhost:5175 (dev), join a room, click *Connect GitHub*, approve, and confirm that your repos (incl. 🔒 private) appear. Or use the standalone harness: `npx tsx auth/demo.ts` → http://localhost:5174. If the repo list returns 401 "No GitHub token", do step 2.
2. **Own GitHub OAuth App**, so GitHub's consent says "Gitzilla" instead of "Auth0" (required if step 1 gets no token):
   - Go to https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**.
   - Application name: `Gitzilla`
   - Homepage URL: `https://gitzilla.wilflin.me`
   - Authorization callback URL: `https://dev-gw4sxogh75t0p48l.us.auth0.com/login/callback` (exactly this)
   - **Register application** → **Generate a new client secret**.
   - Then either add `AUTH0_GITHUB_CLIENT_ID=…` / `AUTH0_GITHUB_CLIENT_SECRET=…` to `repo-kaiju/.env` and run `npx tsx auth/setup-github.ts` (patches the connection via the Auth0 CLI without printing the secret), or paste them in Auth0 Dashboard → Authentication → Social → **github** and Save (keep "repo" checked).

# claude-auth — Connect GitHub via Auth0 (Gitzilla)

## Status
- [x] `auth/index.ts` — login/callback/logout, sealed cookie session, `/api/me`, `/api/me/repos`, GitHub token lookup. Zero new deps.
- [x] `auth/index.test.ts` — 7 tests (seal/unseal, returnTo sanitizing, dotenv parse, full login→callback→session→repos→logout flow with mocked Auth0/GitHub, bad state). `npx vitest run auth/` PASS.
- [x] `auth/demo.ts` — standalone harness on :5174 that runs against the real tenant (dev-only callback). It's stopped now; start it on demand.
- [x] Tenant `dev-gw4sxogh75t0p48l.us.auth0.com` (Free plan) configured via CLI, see below.
- [x] `.env` (repo root, gitignored, mode 600): `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_MGMT_CLIENT_ID`, `AUTH0_MGMT_CLIENT_SECRET`, `AUTH0_COOKIE_SECRET`. The auth module reads them itself (root `.env`, then `../.env`; `process.env` wins), so no dotenv dependency is needed.
- [x] Live checks: the M2M client-credentials token works against the Management API (unknown user → 404 as expected). `/auth/login` → Auth0 `/authorize` → 302 to `github.com/login/oauth/authorize` with `scope=read:user,repo`, for both `http://localhost:5173` and `https://gitzilla.wilflin.me` origins. The session cookie gets `Secure` on https / `X-Forwarded-Proto: https`.
- [ ] Real browser login confirming the IdP token (USER ACTION 1, optional)
- [x] codex-net wired it into server/main.ts + rooms.ts. Checked on the dev server http://localhost:5175 (never 5173). The coordinator deploys to live.

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
- `GET /api/me/repos` → `200 [{ name, full_name, private, language, stars, pushed_at, fork, permission: 'admin'|'maintain'|'push'|'read', pvpEligible }]`, sorted by stars, then most recently pushed (owned + collaborator + org, up to 300). `?pvp=1` returns only `pvpEligible` rows; the eligibility rules are in `server/pvp-access.ts` (codex-net, coordinator-authorized). `401` → show "Connect GitHub" again; `502` → GitHub error, show a retry.
- Sign in: full-page navigate to `/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`. Afterwards you land back on the same `/r/ABCD` URL. On failure it returns with `?auth_error=<message>`; show it as a toast.
- Switch account: `/auth/login?switch=1&returnTo=…` (forces the Auth0 login prompt; GitHub may still remember its own session).
- Sign out: navigate to `/auth/logout?returnTo=${encodeURIComponent(location.pathname)}`.
- Navigating away drops the ws. The lobby rejoins with the localStorage resume token in `client/app/net.ts`, which already works, so the player keeps their slot.

UI sketch for the repo picker in the lobby card:
- Signed out: a `[ Connect GitHub ]` button next to the paste-link input.
- Signed in: `avatar` (16 px, pixelated) + `@login` + a small "sign out" link. Below that, a scrollable terminal list with one row per repo: `full_name`, a 🔒 if `private`, a `language` chip, `★stars`, and the relative `pushed_at`. Add a filter box on top.
- Clicking a row sends the existing `{ t: "setRepo", repo: full_name }`. The server attaches the token itself.

## Co-owned changes
- codex-net (coordinator-authorized) extended `auth/index.ts` + tests: added the `fork` / `permission` / `pvpEligible` fields to the repo rows and the `?pvp=1` filter, using `server/pvp-access.ts` and the authenticated `/user` ID. No tenant/config changes. `npx vitest run auth/`: 9/9 PASS after their change.

## Contract requests
None. The token stays server-side; `setRepo` is unchanged.
