# Gitzilla: Devpost pitch video storyboard

**Specs**
- Length: 1920x1080, 30 fps, H.264 + AAC, **2:16** (68 bars at 120 BPM, 1 bar = 2 s; every cut lands on a bar).
- Teaser: optional 9:16 60 s cut (`video/out/gitzilla-teaser.mp4`).
- Output: `video/out/gitzilla-pitch.mp4`, plus 6 review frames in `video/out/frames/`.

**Sources**
- Raw captures go to `video/raw/` (gitignored). They're recorded headless by `video/capture/*.mjs`.
- Recorder: CDP screencast, desktop 1280x720 @1.5 → 1920x1080, phone 390x844 @2 → 780x1688, at 60 fps, then
  resampled to 30 fps CFR.

**Edit:** Remotion, using the `~/promo-video` install. The project is in `video/src/`, built from data in
`video/src/film.js`.

**Look:**
- The game's own aesthetic: CRT black, terminal green `#3dff8b`, hot pink `#ff3d8b`, amber `#ffd23d`.
- Fonts: Press Start 2P / Silkscreen / Unifont from `public/fonts`.
- Captions: burned in, 44–56 px, on a dark bar in the lower third, never over the HUD's vital parts.
- Title and end cards use the brand logo: the user's new PNG alongside the small pixel mark. **On hold until the
  coordinator says "logo is live".**

**Sound:**
- Music: an original chiptune at 120 BPM from `video/music/compose.py`. Square/pulse lead, triangle bass, noise
  drums, in the game's lobby style. It ducks under the voiceover.
- Voiceover: Gemini TTS, one clip per section (`video/vo/*.wav`). If TTS fails, the video ships captions-only (the
  captions carry the same text).

**Capture rules:**
- Headless only. Nothing is uploaded.
- Mock modes need no server.
- Real rooms (phone + big screen with bots, classroom) run against DEV :5175.
- Deterministic repos: pallets/flask as the boss, burntsushi/ripgrep as the hero, lodash/lodash for the autopsy.

---

## Shot list

`T` = timecode, `B` = bars. VO is the line read aloud. The caption is the burned-in text (shorter when the VO says
more).

### 0 · Cold open hook (0:00–0:08, 4 B)
| T | Picture | Caption / VO |
|---|---|---|
| 0:00 | Black. The terminal types `$ git clone github.com/pallets/flask` (genesis clone stage, 2x speed) | VO: "Your codebase is a monster." |
| 0:03 | Hard cut: the flask boss **assembles**, pixels resolving into the abyssal serpent (genesis assemble → reveal) | VO: "Now make it fight." |
| 0:05 | **Title card**: logo (new PNG + pixel mark) over the dimmed boss; subtitle "a co-op boss fight made from real GitHub repos" | ⏸ on hold for the logo |

Source: `genesis-flask-boss` (demo.html, kind=boss, layout=big).

### 1 · Genesis: repo → monster (0:08–0:24, 8 B)
| T | Picture | Caption / VO |
|---|---|---|
| 0:08 | Flask genesis at 1.5x: parse → **import graph** (components as nodes, heart pulsing) | "Paste any public repo. Gitzilla reads its real import graph…" |
| 0:12 | map stage: language DNA → archetype ("Python 100% → ABYSSAL") | "…its cycles, tests and language DNA…" |
| 0:16 | reveal: "WSGI-Ouroboros · burrows · crystal eruptions"; the threat-budget bar | "…and compiles it into a boss with 5 limbs and 6 attacks." |
| 0:20 | ripgrep **hero** genesis (graph → map → hero card "Regex Ranger · `alloc(name_long())`") | "Your own repo becomes your hero. Rust 95% → its weapon is real code." |

Sources: `genesis-flask-boss`, `genesis-rg-hero`.

### 2 · Boss raid: phones are controllers (0:24–0:56, 16 B)
| T | Picture | Caption / VO |
|---|---|---|
| 0:24 | **Split**: phone frame (left, 780x1688 capture) + big screen (right), same real room on :5175 with 3 bots | "Everyone joins from their phone. No app, no account." |
| 0:28 | Phone joystick/attack input; on the big screen the hero moves and fires. Overlay chips: `tilt = move` `swing = attack` `twist = dash` | "Tilt to move, swing to attack, twist to dash." |
| 0:34 | Full-screen raid (`?mock=match`): sync combo ×3, LIMB BROKEN | "Break the boss's limbs: each one is a real module of the repo." |
| 0:38 | `</> Breath` telegraph and dodge | "Its attacks are its own code. Read the telegraph, dodge the breath." |
| 0:42 | Archetype quick cuts, 1 bar each: kaiju · hydra · mecha · abyssal (demo `&arch=`) | "Every repo grows a different monster." |
| 0:50 | `?mock=review` CODE REVIEW perk pads → PHASE 2 :: ENRAGED | "Mid-fight code review: vote on perks as a team." |
| 0:54 | VICTORY, "boss deleted" | — |

Sources: `raid-phone`, `raid-big`, `match`, `arch-*`, `review`.

### 3 · Adopt an organ: social impact (0:56–1:08, 6 B)
| T | Picture | Caption / VO |
|---|---|---|
| 0:56 | `?mock=autopsy`: VICTORY → camera eases into the **ADOPT AN ORGAN** card: "only 2 people maintain this" | "After the fight, the autopsy tells the truth: only two people maintain this." |
| 1:01 | Zoom on the real good-first-issues + QR | "So we hand you real good-first issues from the repo you just beat." |
| 1:05 | Squad stats + damage diff | "Beat the monster, then go help keep it alive." |

Source: `autopsy`.

### 4 · PvP royale (1:08–1:28, 10 B)
| T | Picture | Caption / VO |
|---|---|---|
| 1:08 | Royale lobby: 8 heroes with **POWER** bars | "Or fight each other: up to eight repos, battle royale." |
| 1:12 | Arena: GC SWEEP zone closing, `await fetch()` shots | "Stronger repo, stronger hero, but the garbage collector closes in on everyone." |
| 1:18 | Elimination: stack-trace KO card, "2/8 alive" | — |
| 1:22 | `?mock=royale-autopsy`: placements + `git log --royale` of eliminations, "underdog win" | "Every knockout is logged like a commit." |

Sources: `royale`, `royale-lobby`, `royale-autopsy`.

### 5 · Classroom (1:28–1:56, 14 B)
| T | Picture | Caption / VO |
|---|---|---|
| 1:28 | Teacher console (1440 view): Python preset picker → "Use this lesson"; projector join card with QR | "Teachers: pick a Python lesson and put the room code on the projector." |
| 1:34 | Phone: in-app editor, typing `print("Hello, Python!")` → ▶ Run → console output → Submit | "Students code right in the browser. Run it, submit it, no GitHub needed." |
| 1:40 | Phone feedback card: checks ✓, rubric evidence, next step | "Instant feedback against the teacher's rubric." |
| 1:44 | Teacher console: Submissions list + read-only code view; privacy toggle "Projecting: hide scores" | "The teacher reviews code privately; the projector never shows scores." |
| 1:48 | Projector: **class attack** on the shared boss, damage from every submission | "Then the whole class attacks the boss together with the code they wrote." |

Sources: `class-teacher`, `class-phone`, `class-raid` (real room on :5175, 3 students) + `?mock=raid&screen=1`.

### 6 · How it's built (1:56–2:08, 6 B)
Four tech cards slide in over dimmed arena b-roll, 1.5 B each:
1. **Real analysis**: import graph, Tarjan SCC cycles, code DNA (`analysis/`)
2. **Art direction**: Gemini-designed palettes and names, pixel sprites generated in the browser
3. **Sound**: a Web Audio chiptune engine with no audio files
4. **Runs anywhere**: one Node server, WebSockets, any phone browser, Auth0 GitHub sign-in

VO: "Under the hood: real static analysis, Gemini art direction, a Web Audio chiptune engine, and it all runs in the
browser on any phone."

### 7 · End card (2:08–2:16, 4 B)
- Logo, large (on hold).
- **gitzilla.wilflin.me**
- github.com/gfhdhytghd/Gitzilla
- "Built in 24 h at HackPSU"
- Music resolves on the final chord; fade to black over 1 B.
- VO: "Gitzilla. Your codebase is a monster. Come fight it."

---

## Voiceover script (≈230 words, about 1:45 of speech in 2:16)
Lines are as above, one clip per section: `vo/00-hook`, `vo/01-genesis`, `vo/02-raid`, `vo/03-organ`, `vo/04-royale`,
`vo/05-class`, `vo/06-built`, `vo/07-end`. Each section's VO starts half a bar after its cut.

## Teaser (9:16, 60 s, if cheap)
- **Layout:** 1080x1920. The phone capture is full height; big-screen clips sit in the top half with captions in the
  bottom third.
- **Order:** hook (6 s) → genesis (10 s) → raid with phone (14 s) → royale (10 s) → classroom (12 s) → end card
  (8 s).

## Review frames (`video/out/frames/`)
1. `01-hook.png` (0:04)
2. `02-genesis.png` (0:17)
3. `03-raid-split.png` (0:29)
4. `04-organ.png` (1:01)
5. `05-royale.png` (1:14)
6. `06-classroom.png` (1:49)

## Status
- [x] Storyboard
- [x] Captures: `video/capture/shots.mjs`.
  - Mock gameplay is frame-stepped on Playwright's paused clock, so it plays at a smooth 30 fps in 1080p. Live it
    only managed about 20 fps.
  - The phone + big screen raid and the classroom are real rooms on :5175. The phone is driven by synthetic
    tilt/swing/twist sensors.
- [x] Music: `video/music/compose.py` (120 BPM chiptune, 68 bars + tail).
- [x] Voiceover: Gemini TTS (`video/vo/tts.mjs`, voice "Puck"). Each line was checked by Gemini transcription,
  and so was the final mix.
- [x] Remotion edit: `video/src/` (`film.js` = timeline). It runs on the `~/promo-video` install through the
  `video/node_modules` symlink.
- [x] Render + watch + fix, two passes:
  - The royale clip ran into the mock's post-match lobby.
  - The organ zoom cropped the card.
  - Arrow and ✓ glyphs are missing from Press Start 2P, so they became `=>`.
  - The student editor scrolled sideways, so the classroom was re-shot.
  - The classroom split now shows the student's screen zoomed in.
- **Output:** `video/out/gitzilla-pitch.mp4`, 2:16, 1920x1080, 30 fps, H.264 CRF 18 + AAC 192k, -14 LUFS.
  Review frames are in `video/out/frames/`.
- [x] v2:
  - Captures run on the public origin: `--host-rules` maps gitzilla.wilflin.me to :5175.
  - The class attack was re-shot with 2 of 4 submissions, so the boss survives the hit. With 4 of 4, the 60 HP
    preset boss died on the first attack and the shot showed only its dissolve.
  - Added review frame `07-class-attack.png`.
- [ ] 9:16 teaser: not made.

**Changes from the shot list above**
- Royale order is arena → POWER lobby → GC sweep → `git log --eliminations`.
- Classroom split: the right panel shows the student's own screen zoomed in (type → ▶ Run → output → feedback) so
  the code is readable. The projector appears right before (join QR) and after (class attack).

## Rebuild
```sh
cd video
node capture/shots.mjs all          # needs DEV :5175 for raid-split / classroom; ~15 min (stepped takes)
(cd music && python3 compose.py)    # score.wav
node vo/tts.mjs && node tools/captions.mjs
npx remotion render src/index.jsx Pitch out/gitzilla-pitch-raw.mp4 --concurrency=12 --crf=16 --audio-bitrate=320k
ffmpeg -i out/gitzilla-pitch-raw.mp4 -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 48000 -c:a aac -b:a 192k -movflags +faststart out/gitzilla-pitch.mp4
```
