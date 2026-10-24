# Repo Kaiju procedural audio

`index.ts` exports `createAudio()`. Runtime dependencies and sound assets: **none**. All sound is synthesized into cached mono PCM buffers, then played by WebAudio. Open `/client/audio/demo.html` on the development server to audition every theme, phase, weapon, event, skill, the modem intro, keyboard clack, and an eight-player stress burst.

```ts
import { createAudio } from '../audio';
const audio = createAudio(); // one per app, retained across screens
audio.music('lobby'); // remembers the selection; silent until unlocked

// Call directly in a gesture handler. Resume is invoked before the first await.
document.addEventListener('pointerdown', () => {
  void audio.unlock().catch(console.warn);
}, { capture: true });

// On each new authoritative snapshot, once (never every render frame):
audio.music(state.status === 'victory' || state.status === 'defeat'
  ? state.status : state.boss?.kit.theme ?? 'notebook',
  state.boss?.phase ?? Math.min(3, state.pvp?.round ?? 1) as 1 | 2 | 3,
  { intro: state.mode !== 'edu' }); // classroom PvP has no boss or modem summon
audio.onEvents(state.events, selfId);

audio.onFire(self.kit.weapon); // on a new local shot, not held-fire every render
audio.onDash(); // on a local dash beginning
audio.setMuted(true);
audio.setVolume(0.6); // 0..1, default .6
```

The first move from lobby/no music to an arena in phase 1 automatically plays the modem-handshake sting. Phase events update the active arena arrangement; victory/defeat events select the end-state loop. Repeated `music(theme, phase)` calls with the same selection preserve the playhead. Phase 2 adds kick/snare/hat and 12% tempo; phase 3 adds 24% tempo, sample-and-hold, five-bit quantization, packet stutters, and a music-only distortion node. Lobby/victory/defeat ignore the phase argument.

For classroom PvP (no boss), use notebook music with `{intro:false}` as the optional third argument. This also cancels a queued modem sting before unlock. `lesson` events play a quiet, low-priority notification; `perk.correct === true` plays a positive quiz chime and `false` plays a gentle retry cue. Absent `correct` keeps the ordinary perk jingle. These work through existing `onEvents`, including hero-vs-hero hit/source emphasis. The demo includes CLASSROOM PvP, lesson, quiz-correct and quiz-retry buttons.

Each arena has its own scale, tempo and instrument in `synth.ts`: terminal minor pentatonic/narrow pulse; kernel Phrygian/saw; web Lydian/micro-pulse; notebook Dorian/FM bell; enterprise major/octave organ; legacy harmonic minor/plucked triangle. Four-bar buffers loop sample-accurately with short silent boundaries. Track changes crossfade. There are no music timers or AudioWorklet dependencies.

Extra helpers: `audio.onUi()` for a keyboard-clack UI action; `audio.onBossIntro()` for an explicit custom intro (deduplicated against the automatic sting for 2.5 seconds); `audio.dispose()` when permanently unmounting the app, to close the AudioContext and release buffers. Do not dispose on an ordinary game→autopsy screen transition. Mute stops active SFX and fades/stops music, retaining the selected theme for unmute. Calls before unlock are safe: music remembers the latest selection, transient combat SFX are dropped.

The pure mapping is `eventToSfx` / `eventsToSfx` in `events.ts`. Crits use optional `hit.crit === true`; attacker emphasis uses optional `hit.source`. Plain hit events still play normal damage, self hurt is recognized by `target`, and `combo >= 2` adds a rising combo accent. Large damage alone is not treated as a crit. `by`, `player`, and `targetPlayer` identify personal limb breaks, revives, skills, downs and targeted warnings. Pickup events choose distinct energy/heart/armor blips; obstacle breaks crunch and shatter; perks play a major-key "merge approved" jingle. Existing `onEvents` handles these automatically, including self emphasis for pickups and perks.

SFX have per-category cooldowns and a 12-voice priority cap; warnings and match transitions can steal incidental hit/fire voices. Every route feeds the master compressor and a final peak-bounded shaper before the user volume. The phase-3 distortion sits only on music; telegraphs stay legible. Cached crushed hits use quantized/sample-held PCM, not a deprecated ScriptProcessor.

Tests: `npx vitest run client/audio`. They verify the pure event mapping, personal emphasis, all skill variants, deterministic finite PCM, unique musical identities, phase tempo and loop boundaries. Human sound quality, device speakers, iOS audio routing and background/resume behavior still need listening on devices.

Browser/DSP smoke (using the existing Playwright devDependency): start the dev server, then `npx tsx tools/audio-smoke.ts`. It exercises every audition control, checks lazy gesture unlock, observes actual PCM with an instrumented output analyser, checks phase durations, mute/unmute/volume/cleanup, and captures desktop/phone screenshots plus JSON under `docs/shots/<timestamp>-audio/`. This is browser rendering/DSP evidence, not a human listening test or a physical iOS test.
