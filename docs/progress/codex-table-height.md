# Floor-based VR tabletop — DONE / SOURCE FROZEN

Owned deltas: height.ts + height.test.ts, projection.ts + projection.test.ts, height-debug.ts, optional XRDebugState calibration fields in types.ts, tools/xr-check.ts height assertions. No index.ts edits by Codex; claude-boss owns world-pinning and the helper callsite.

## Contract
`getTableHeightPlacement({referenceSpaceType, initialHeadY, referenceOffsetY?, userOffset?})` returns `{tableY, baseTableY, estimatedEyeHeight, heightSource}`.
- Capture raw initialHeadY ONCE per XR session, before the XR adapter's reference offset. Do not recalculate from a moving/crouching head.
- local-floor baseTableY=0.80m regardless of head y or headset brand.
- local baseTableY=0.80-estimatedEyeHeight. Plausible initial raw y0.5–2.5m is used as a runtime floor-relative eye-height estimate; near-zero/unknown/implausible poses fall back to1.6m. Local carries no floor guarantee, so the estimate cannot prove exact physical floor distance. This heuristic/limitation is documented in height.ts and the readout names the source explicitly.
- tableY=baseTableY-referenceOffsetY+userOffset. The existing XR adapter offsets local's origin by-1.6m (effective synthesized-floor coordinates), so that conversion must happen ONCE: raw local base-0.80 becomes effective tableY+0.80. Unmodified local (referenceOffsetY0) stays-0.80. No tracking-camera modification.
- Assign returned calibration fields to xr.debug; optional typed fields added, and DOM + in-XR readout show base, eye estimate, heightSource. No old Vision Pro correction text.
- XR check additionally seeds the legacy offset key and changes emulated viewer y1.6→1.1 after entry: old offsets must be ignored and crouching must not recalibrate the table.
- ▲/▼ offset is still additive/clamped; key now `kaiju.xr.tableHeightOffset.v2`. Old key is ignored; unit tests prove old offsets do not migrate.
- projection default table height now0.80m; life-scale y remains0.

## Verification
- 29 height/projection focused tests PASS.
- 69 stage25d tests /9files PASS. `/tmp/table-height-stage-tests.log`.
- root typecheck PASS. `/tmp/table-height-tsc.log`.
- Initial xr-check --height correctly fails new calibration debug assertion (`heightSource` undefined) until claude-boss replaces old getComfortTableHeight callsite. No browser page errors. Initial evidence `docs/shots/2026-10-25T09-17-30-820Z-xr-check`.
- Merged index.ts callsite by claude-boss now captures raw initial head y once per session and writes calibration debug fields; world-pinning remains its owned work.

No commits/shared-service controls.

Reference-space limitation: [WebXR reference spaces](https://www.w3.org/TR/webxr/#reference-spaces) distinguishes floor-level and local origins; local fallback is explicitly an estimate rather than measured room-floor proof.

## Final acceptance
All three requested browser checks PASS, zero browser errors, default180-frame runs:
- `npx tsx tools/xr-check.ts --height`: `docs/shots/2026-10-25T09-27-14-206Z-xr-check/summary.json`
- `npx tsx tools/xr-check.ts --height --vision-pro`: `docs/shots/2026-10-25T09-27-14-294Z-xr-check/summary.json`
- `npx tsx tools/xr-check.ts --height --local-only`: `docs/shots/2026-10-25T09-27-14-282Z-xr-check/summary.json`
Each directory includes `height-debug.png` (reviewed local screenshot), actual stage render with IWER, plus readout evidence. Ordinary and synthetic Safari local-floor base/tableY0.80m. Local raw y0 selects eye1.60m/fallback-1.6m/base-0.80m; existing offset-1.60m yields effective tableY0.80m. User+0.10m yields0.90m, survives reload. Legacy1.4m offset is ignored. Emulated head y1.60→1.10 leaves table placement unchanged.

Final merged gates: root `npm run typecheck` PASS (`/tmp/table-height-tsc-final.log`); stage25d69 tests /9files PASS (`/tmp/table-height-stage-final.log`). Browser logs `/tmp/table-height-xr.log`, `/tmp/table-height-vision.log`, `/tmp/table-height-local.log`. `git diff --check` passes for owned files. No index.ts edits by Codex, no commits or service/live changes.

Evidence boundary: actual stage in Chromium/IWER with synthetic Safari UA; no physical Vision Pro or measured real-floor hardware acceptance. A local-only session still uses the documented eye-height estimate; it cannot measure a real floor without a floor reference.
