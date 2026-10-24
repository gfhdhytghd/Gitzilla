# Phone fight performance and simultaneous motion attacks

2026-10-24. Baseline deployment: b43c41d. Reported device: iPhone Air; fight stutter, heat, and movement stopping while attacking with motion controls.

Changes:
- Phone canvas rendering capped at30Hz, HUD15Hz; independent30Hz input sender and authoritative snapshot stream unchanged. Hidden/portrait ambient canvas is not copied.
- Pass resize-computed canvas scale to the FX renderer instead of forcing DOM layout during drawing. Reuse stage coordinates; avoid unchanged sensor/status text and attributes. PvP rows move only when their rank changes; boss lag bar remains time-based.
- Reuse signed-distance samples between neighbouring shader pixels. All64 sampled archetype/breath/tint/broken-limb body sprites are byte-identical to baseline. Generation total5362.7→2903.1ms (46% reduction); maximum130.7→65.9ms in the unthrottled browser comparison.
- Bounded text-sprite caches evict individual least-recently-used entries rather than clearing every cached label.
- Swing/twist/spin noise temporarily holds the last clean steering vector instead of zeroing movement. Tap/long-press gestures no longer hold steering. Repeated swings and tap steering have controller regressions.

Performance evidence (local production mock battle,390×844/DPR3,Chromium4×CPU,12s warmup+10s capture; sequential baseline/candidate runs):

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| Main-thread task time |9.753s|6.488s|
| Script time |6.353s|4.061s|
| Layouts |874|338|
| DOM mutations |7117|1840|
| Actual game draws |450|280|

Task time reduced33.5%; mutations reduced74.1%. Rendering is deliberately capped at30Hz on phones; this is a workload reduction, not a claim of increased display FPS. The mock also runs simulation in the browser. No physical iPhone temperature, power, GPU or sensor-feel measurement was available.

Validation:
- Full suite with restart:729PASS/7optionalSKIP; root and QA TypeScript and production build PASS. Root and isolated production build outputs match byte-for-byte (29files).
- Existing 2-player browser battle reaches natural autopsy with exit0; artifact docs/shots/2026-10-24T21-44-14-176Z-2263632/.
- Shader/performance raw evidence: docs/shots/2026-10-24-phone-performance/.
- Final motion acceptance:32PASS,606authoritative snapshots,906input frames,0errors; docs/shots/2026-10-24T21-48-15-986Z-motion-v3/. It requires simultaneous fire+movement input, actual server displacement and a new authoritative projectile for both tap and swing.

Harness correction: the added movement checks initially pushed spin beyond the first20s trace capture; those checks now follow the original gesture sequence. A later run exposed that three actual dashes can place the hero next to the boss, making a bullet hit before a20Hz snapshot. The harness now retreats through normal tilt controls before the six-axis projectile checks. Original failure artifacts are retained; no server state/health/readiness is injected.
