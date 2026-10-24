# Gitzilla — build brief (read fully before coding)

**Context:** HackPSU, a 24-hour hackathon. Ship a fun, working demo fast. Skip defensive hardening, auth, rate limits, exhaustive validation, and rare edge cases. A crash in a weird case is fine, but the happy path must be solid. No over-engineering.

Design doc: `../repo-kaiju.md`. Shared contracts: `shared/types.ts`. **Don't edit `shared/` yourself.** If you need a contract change, write it under "Contract requests" in your progress file and work around it in the meantime. The coordinator merges contract changes.

## Game in one paragraph

This is a 2D pixel-art co-op boss fight in the style of a **Soul Knight boss room**. 1–8 players (4+ is the target) each pilot a small chibi hero generated from **their own GitHub repo**. The room owner picks a **Boss repo**, which becomes a huge, weird, AI-controlled monster in a single-screen arena (30×18 tiles of 16 px = 480×288 logical px, scaled up with integer nearest-neighbor scaling). Players move, shoot (auto-aim at the nearest target when no aim is given, as in Soul Knight), dash through bullets, and use one skill. The boss fires bullet-hell patterns (rings, spirals, fans, telegraphed lasers and slams, charges, minion summons), breaks into phases, and enrages at low HP. Boss limbs are the repo's top components and can be broken separately: breaking a limb disables the attacks sourced from it. Circular dependencies are glowing weak points. Downed players can be revived by a teammate standing next to them. The match ends in victory or defeat, followed by an autopsy screen.

## Art direction: pixel art with a code/hacker flavor

- Pixel art everywhere: nearest-neighbor scaling, a limited palette per entity, 1 px dark outlines, no anti-aliasing, no gradients except dithering.
- Hacky/code flavor:
  - Projectiles are glyphs: `{}`, `;`, `0/1`, `</>`, `#`, `*`, `=>`.
  - Hits flash glitch/RGB-split.
  - Damage numbers are styled like `-12 ERR`.
  - The HUD is a terminal: monospace pixel font, `$ ` prompts, a blinking cursor.
  - Boss telegraphs appear as red stack-trace text, e.g. `FATAL: rm -rf / in 0.8s`.
  - Scanlines plus a light CRT vignette on the arena.
  - Background tiles hint at circuit boards, code-text floor engravings, and git-graph lines.
- **Players look like Soul Knight heroes**: cute 16×16–20×20 chibi knights, rangers, and mages. Their look is derived from their repo: the language decides class and palette, the seed decides helmet, hair, and cape, and the weapon kind decides the held weapon sprite. Players must read clearly as "the good guys".
- **The Boss must look weird and boss-like**: big (about 96–160 px), asymmetric, procedurally assembled from the repo graph. Its parts:
  - **Body mass:** one blob per component, sized by LOC.
  - **Heart:** a pulsing core.
  - **Tentacles:** dependency edges, drawn as bezier pixel chains that sway.
  - **Knots:** cycles, glowing red.
  - **Eyes:** count from contributors (capped).
  - **Scars:** from commit count.

  Boss sprites use a separate generator and a separate asset/palette set from the players. Its look must never be confused with a player's.
- **The arena theme follows the Boss** (`BossKit.theme`). It sets the floor tiles, walls, props, and palette: terminal, kernel, web, notebook, enterprise, or legacy.

### Visual maxxing (the user explicitly asked: push the visuals hard)

This is a demo for judges, so the visuals carry the project. Expect juice everywhere:

- **Screen and hit feedback:** screen shake on big hits, hit-stop frames (40–60 ms freeze), white hit flashes, knockback squash and stretch.
- **Particles and trails:** pixel particles (sparks, code-glyph debris, smoke), trailing afterimages on dashes, muzzle flashes, shell or glyph casings.
- **Lighting:** dynamic glow via additive blend layers, with the boss heart, lasers, and bullets lighting the floor around them.
- **Boss telegraphs:** pulsing warning zones with marching-ants borders, a red stack-trace overlay, and screen-edge danger vignettes.
- **Boss intro:** a cinematic card on summon (letterbox bars, a name card typed like a terminal, `git clone` progress bar ASCII, camera zoom).
- **Big moments:** limb breaks explode into glyph shrapnel plus a slow-mo beat. The phase change glitches the whole screen. The victory sequence plays the boss `segfault`/BSOD death.
- **Ambient life:** animated floor details (blinking LEDs, flowing data in circuit traces, flickering monitors), idle animations for heroes, and a breathing, swaying boss.
- **Lobby:** must already look gorgeous, with animated hero portraits spinning up as repos are analyzed, and a boss silhouette reveal.

Keep 60 fps on a mid phone: cache sprites, pool particles, and avoid per-frame `getImageData`.

## Controls

- **Desktop (no motion sensors, or a fine pointer):** WASD/arrows to move, mouse to aim, hold left click or J to fire, Space or K to dash, E or L for the skill. With no mouse movement, aim auto-locks onto the nearest target.
- **Phone (DeviceMotion available):**
  - Tilt to move. Calibrate the neutral pose at start.
  - Auto-aim.
  - Thrust the phone forward, or hold a finger anywhere on the screen, to fire.
  - Swing sideways to dash.
  - Shake for the skill.
  - Request iOS permission on the first tap.
- **Fallback:** if motion permission is denied, show a virtual joystick and buttons.

## Architecture

- A single Node server on **port 5173** serves the client (Vite middleware in dev, `dist/` in production) and the WebSocket at `/ws` on the same port. HTTPS is optional via env (`HTTPS_KEY` and `HTTPS_CERT`).
- The server is authoritative: the sim runs at 30 Hz, snapshots go out at 20 Hz, and clients interpolate.
- Every client renders the arena. Phones play in landscape. `?screen=1` is a spectator big screen that shows the QR code in the lobby.
- URLs: `/` is the landing page (create a room); `/r/<ROOM>` joins a room.

## Ownership (one owner per directory — don't edit others' dirs)

| Dir | Owner | Scope |
| --- | --- | --- |
| `shared/` | coordinator | contracts |
| `server/` | codex-net | http + vite middleware + ws, rooms, lobby, owner rules, wiring analysis and sim, autopsy |
| `analysis/` | codex-repo | `analyzeRepo(slug) → RepoProfile`, GitHub tarball + import graph, cache, `data/fallback/*.json` precomputed set (at least 10 famous repos) |
| `sim/` | codex-sim | `kits.ts` (profile→PlayerKit/BossKit, balance), `match.ts` (authoritative step), `bossAi.ts`, headless bot balance tests |
| `client/input/` | codex-input | keyboard/mouse + DeviceMotion gesture recognizer + touch fallback → `InputFrame` |
| `client/render/player/` | claude-player | Soul Knight-style player sprite generator + player animations |
| `client/render/boss/`, `client/render/arena/` | claude-boss | boss sprite generator + animation, arena tilesets per theme, bullets/FX/glitch |
| `client/app/`, `index.html`, `client/style.css` | claude-ui | landing, lobby, game screen, HUD, autopsy, net client, interpolation, render loop composition |

### Renderer interfaces (claude-player / claude-boss export these; claude-ui composes them)

```ts
// client/render/player/index.ts
export function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerState, time: number, isYou: boolean): void;
export function playerPortrait(kit: PlayerKit, size: number): HTMLCanvasElement;  // lobby card
// client/render/boss/index.ts
export function drawBoss(ctx: CanvasRenderingContext2D, b: BossState, time: number): void;
export function bossPortrait(kit: BossKit, size: number): HTMLCanvasElement;
// client/render/arena/index.ts
export function drawArenaBackground(ctx: CanvasRenderingContext2D, theme: ArenaTheme, seed: number, time: number): void;
export function drawBullets(ctx: CanvasRenderingContext2D, bullets: Bullet[], time: number): void;
export function drawHazards(ctx: CanvasRenderingContext2D, hazards: Hazard[], time: number): void;
export function drawMinions(ctx: CanvasRenderingContext2D, minions: Minion[], time: number): void;
export function drawEvents(ctx: CanvasRenderingContext2D, events: GameEvent[], time: number): void; // damage numbers, glitch flashes, particles (keeps its own particle list)
export function drawPostFx(ctx: CanvasRenderingContext2D, time: number, shake: number): void; // scanlines, vignette
```

All draw functions work in **logical arena pixels** (480×288). The caller applies the integer scale and `imageSmoothingEnabled = false`. Generate sprites procedurally with offscreen canvases, and cache them by seed. No external image assets are needed, but you may add small hand-authored pixel arrays.

### Sim interface (codex-sim exports; codex-net calls)

```ts
// sim/index.ts
export function playerKitFromProfile(p: RepoProfile): PlayerKit;
export function bossKitFromProfile(p: RepoProfile, playerCount: number): BossKit;
export function createMatch(players: { id: string; name: string; kit: PlayerKit }[], boss: BossKit): Match;
export interface Match { step(dt: number, inputs: Map<string, InputFrame>): void; snapshot(): MatchState; autopsy(): Autopsy; readonly over: boolean }
```

### Analysis interface (codex-repo exports)

```ts
// analysis/index.ts
export function analyzeRepo(slugOrUrl: string): Promise<RepoProfile>; // < 15 s typical; falls back to data/fallback when the network or rate limit fails
export function listFallbackRepos(): string[];
```

### Input interface (codex-input exports)

```ts
// client/input/index.ts
export function createInput(opts: { canvas: HTMLCanvasElement; toArena: (clientX: number, clientY: number) => [number, number]; getSelf: () => { x: number; y: number } | null }): {
  mode: "keyboard" | "motion" | "touch";
  needsPermission: boolean; requestPermission(): Promise<boolean>; calibrate(): void;
  sample(): InputFrame;  // call once per client tick
  dispose(): void;
};
```

## Balance targets (codex-sim owns; others shouldn't hard-code numbers)

- Every repo gets the **same total stat budget**: size only shifts where the strength sits.
- With 4 average players, the fight lasts about 2.5–3.5 minutes, and a team playing decently wins about 60–70% of the time.
- Boss HP is roughly `base × (0.6 + 0.4 × playerCount)`, and attack frequency rises gently with playerCount.
- Every boss attack is dodgeable: a telegraph of at least 0.6 s, and bullet speeds a phone-tilt player can handle (slower than a hardcore Soul Knight).
- Write a headless bot test that simulates 1, 4, and 8 players across the fallback bosses and prints the win rate and duration.

## Process

- TypeScript, ES modules. Run `npm run typecheck`, `npm test`, and `npm run dev` (server on 5173).
- Keep a progress log at `docs/progress/<your-name>.md`: what's done, what's next, contract requests. Update it as you go so it survives context compaction.
- **Don't git commit** (the coordinator commits). Don't run `npm install` for new deps without noting it in your progress file; prefer zero new deps.
- When you're done, write `DONE` at the top of your progress file, with a summary.
