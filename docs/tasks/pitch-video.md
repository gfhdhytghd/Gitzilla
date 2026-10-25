# Devpost pitch video (user: "record and cut a promo/pitch video for Devpost, at most 5 min, prefer shorter")
Target: **~2:00–2:30**, 1920x1080 30fps MP4 (H.264 + AAC), plus a 9:16 60s teaser cut if cheap. English captions/VO.
Story (judge-first; hook in the first 5 seconds):
1. 0:00 Hook — "Your codebase is a monster. Now make it fight." GITZILLA logo + the genesis cinematic compiling a real
   repo (flask/ripgrep) into a kaiju: clone → graph → map wires ("Rust 95% → unsafe{} Cannon") → assemble → reveal.
2. Boss raid — phones as controllers (show a phone frame + the big screen side by side; tilt/swing/twist captions),
   archetypes (kaiju / hydra / mecha / abyssal), code-review perk pads, `</> breath` telegraph, pause, victory.
3. Adopt an Organ — autopsy: "only 2 people maintain this", real good-first-issues + QR → social impact.
4. PvP royale — 8 heroes, POWER bars ("stronger repo, stronger hero"), GC-sweep zone, stack-trace elimination,
   placements + git log of eliminations.
5. Classroom — teacher console vs projector, Python preset, in-app editor (type → ▶ Run → Submit, no GitHub needed),
   rubric feedback, class attack on a shared boss.
6. How it's built (10–15s) — real repo analysis (import graph, SCC cycles, DNA), Gemini art direction, Web Audio
   chiptune, Auth0 GitHub, all in the browser on any phone. End card: gitzilla.wilflin.me + GitHub URL + HackPSU.
Production:
- Capture with Playwright (headless Chromium, recordVideo or frame screenshots for crisp 1080p) against the DEV server
  :5175 or a dedicated local production server on a spare port (never restart :5173/:5175 used by others); use the
  ?mock= modes (match, review, royale, royale-autopsy, autopsy, raid/edu, genesis demo) and scripted real rooms with
  bots; deterministic seeds; desktop 1280x720@1.5 + phone 390x844 shots composited into a phone frame.
- Edit with the existing Remotion setup in ~/promo-video (src/films.js data-driven; music/compose.py makes the
  soundtrack — compose a chiptune track in Gitzilla's style; or capture the game's own WebAudio music offline).
  Pixel-style title cards matching brand/ (logo SVGs in brand/ and public/). Captions burned in, large and legible.
- Optional voiceover: Gemini TTS is available (key in ~/data/HackPSU/.env; Interactions API works — see design/ for how
  the key is read; never print it). If TTS fails, captions-only is fine.
- Do NOT touch the user's desktop/windows (headless only). Don't publish/upload anywhere. Output:
  video/out/gitzilla-pitch.mp4 (+ teaser), a storyboard/shot list at video/STORYBOARD.md, and 6 representative frame
  PNGs in video/out/frames/ for coordinator review. Keep raw captures under video/raw (gitignored).
- Check: watch your own output (sample frames every ~5s with ffmpeg and LOOK), fix pacing/legibility, total ≤ 2:45.
