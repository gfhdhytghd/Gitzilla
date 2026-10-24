# Code flavor pass (user: "make more code elements, e.g. the weapon — go imagine")
Goal: everything you hold, shoot, pick up, or get hit by is visibly made of CODE. Pixel art stays readable first.
Every hacky label keeps a plain-language hint nearby (claude-ux is auditing for that).

## Weapons = code constructs (kit.code.weapon; codex-sim generates, Gemini may rename; renderers draw)
Base per WeaponKind, then flavored by the hero's language (examples, extend freely):
| kind | base weapon | projectile | muzzle | impact | language flavors |
|---|---|---|---|---|---|
| blaster | `printf()` Pistol | `"str"` string literals | `printf` | `\n` | JS `Promise` Blaster fires `.then()`; TS `as any` Blaster; Ruby `puts` Pistol |
| smg | `for` Loop SMG | `i++` | `loop` | `++` | Go `goroutine` SMG fires `go` / `<-ch`; Kotlin `coroutine` SMG |
| shotgun | `switch` Shotgun | `case` spray | `switch` | `break;` | C `#define` Shotgun fires macros; C++ `template<>` Blaster |
| cannon | `malloc()` Cannon | `0xDEAD` hex shells | `alloc` | `free()` explosion | Rust `unsafe{}` Cannon fires `&mut`; Zig `comptime` Cannon |
| staff | `lambda` Staff | homing `λ` orbs | `=>` | `return` | Python `yield` Staff; Haskell `>>=` Staff; Lisp `(((` Staff |
| laser | `regex` Beam | `/.*/` beam text crawling along | `match` | `$1` | Java `Stream` Beam `.map()`; C# `LINQ` Ray; SQL `JOIN` Beam |
| blade | `Ctrl+X` Katana | slash arc of `//` comments | `cut` | `rm` | `git cherry-pick` Axe; Vim `dd` Blade; PHP `die()` Saber |
Weapon SPRITES: build them out of code shapes: a pistol whose barrel is `{ }`, a semicolon-shaped dagger, a keyboard-key
cannon with keycap texture, a USB-stick staff topped with a glowing `λ`, a mechanical-switch shotgun, a regex-ring laser
emitter, a cursor-bar katana `|`. Firing pops the muzzle text; hits spark the impact text (small, fast, pooled).

## Skills / stats / items as code
- Skills: firewall = `try { } catch` bubble with braces around allies; fork = `git fork` clone with a commit-hash tag;
  hotfix = floating `+patch` diff lines in green; overclock = `sudo` aura + `!!` afterimages; rollback = `git revert`
  rewind with ghost frames and `HEAD~1`.
- HUD vocabulary (with plain hints): HP = `hp: int = 5` (hearts), armor = `try/catch` (shield), energy = `RAM 150MB`,
  dash = `--force`, revive = `systemctl restart <name>`, downed = `segfault` (exists), victory = `exit 0`, defeat = `exit 1`.
- Pickups: heart = `+1 commit` (green diff `+`), energy = coffee mug ☕ / RAM stick, armor = `test passed ✓` shield.

## Boss attacks as code disasters (keyed off attack kind + name keywords; renderers pick the visual)
- ring → `while(true)` infinite-loop rings with the loop source text circling.
- spiral → `recursion` spiral of nested `f(f(f(` calls.
- fan → `throw` spray of red Exception glyphs.
- laser → `race condition`: two beams converging; or a `grep` beam sweeping.
- slam → `Stack Overflow`: stack frames rain and pile into a column at the target.
- charge → `git push --force`: the boss rushes, leaving a red force-push trail; teammates' stuff gets "overwritten" (FX only).
- summon → `npm install`: a progress bar on the floor that births bug minions as dependencies.
- cascade → `Merge Conflict`: the arena gets split by `<<<<<<< HEAD` / `=======` / `>>>>>>>` hazard lines.
- extra flavor hazards: `memory leak` puddles that grow, `null` pits that blink, `deadlock` chains between two players.

## Arena as a code file
Floor shows faint giant source code of the BOSS repo (real heartLines/snippets) with line numbers down the left wall and
syntax colors per theme; walls built from brackets `{ }`; a git branch graph glows along the floor seams; the minimap
looks like a file tree / VS Code minimap.

## Owners
- **codex-sim** (sim/kits.ts): fill PlayerKit.code.weapon from the table (language-aware, deterministic), skill/attack
  display names consistent with this vocabulary. No stat changes.
- **claude-player**: code-shaped weapon sprites + muzzle/impact text + skill FX vocabulary above.
- **claude-boss**: projectiles per weapon (use weapon.projectiles), boss attack visuals above, pickups as code items,
  arena-as-a-code-file floor/walls/branch graph.
- **claude-ui**: HUD vocabulary with plain hints, weapon name on hero card/HUD, minimap as a file tree look (fits the
  portrait card).
- **codex-gemini**: let Gemini rename weapons (optional field in HeroDesign → map into kit.code.weapon.name), and add
  weapon names to fallback designs.
