// Host pause overlay shared by the fight (MatchState.paused) and classroom raids (ClassroomState.paused):
// terminal card "$ kill -STOP gitzilla / ^Z / [1]+ Stopped …", host ▶ RESUME (+ leave / end match), and a
// "$ fg %1 3·2·1" countdown from resumeAt (server epoch ms; falls back to 3s from receipt if clocks disagree).
import { setPausedAudio } from "./sound";
import { h, vibrate } from "./util";
import { t } from "../i18n";

export type PauseInfo = { by: string; since: number; resumeAt: number | null } | null | undefined;

export interface PauseOverlay {
  el: HTMLElement;
  /** Feed every state update. `byName` = display name of the host who paused ("you" for yourself). */
  apply(p: PauseInfo, byName: string, isHost: boolean): void;
  /** Call every frame (or ~10 Hz); returns true while the game should stay frozen. */
  tick(): boolean;
  readonly active: boolean;
  dispose(): void;
}

export function createPauseOverlay(opts: { onResume(): void; onLeave(): void; onNewRoom(): void; hostHint?: string; waitHint?: string; onChange?(paused: boolean): void;
  /** classroom: plain words for a projector ("Paused by your teacher"), Resume only (no leave / new room in a lesson) */
  classroom?: boolean }): PauseOverlay {
  const by = h("div.pz-line.dim"), count = h("div.pz-count"), hint = h("div.pz-hint");
  const host = h("div.pz-host", { hidden: true },
    h("button.btn.btn-big.btn-start", { "data-testid": "resume-match", onclick: () => opts.onResume() }, opts.classroom ? "▶ Resume (P)" : "▶ RESUME"),
    opts.classroom ? null : h("div.pz-host-row", null,
      h("button.btn", { "data-testid": "pause-leave", onclick: () => opts.onLeave() }, "⏏ leave"),
      h("button.btn", { "data-testid": "pause-new-room", onclick: () => opts.onNewRoom() }, "end match · new room")));
  const el = h("div.pause-ov", { "data-testid": "paused-overlay", hidden: true },
    h("div.term-window.pz-win", null,
      h("div.term-title", null, h("span.dots", null, "● ● ●"), " gitzilla"),
      h("div.term-body", null,
        opts.classroom ? h("div.pz-line.pz-classroom", null, "⏸ Paused by your teacher") : h("div.pz-line", null, h("span.prompt", null, "$ "), "kill -STOP gitzilla"),
        opts.classroom ? null : h("div.pz-line.pz-stopped", null, "^Z"),
        by, count, hint, host)));
  let state: PauseInfo = null;
  let resumeLocalEnd = 0;
  let shown = false;
  const setShown = (on: boolean) => {
    if (on === shown) return;
    shown = on;
    el.hidden = !on;
    setPausedAudio(on);
    if (on) vibrate(20);
    opts.onChange?.(on);
  };
  const frozen = () => !!state && (state.resumeAt === null || performance.now() < resumeLocalEnd);
  return {
    el,
    get active() {
      return frozen();
    },
    apply(p, byName, isHost) {
      const was = state;
      state = p ?? null;
      if (state?.resumeAt != null && was?.resumeAt !== state.resumeAt) {
        const skew = state.resumeAt - Date.now();
        resumeLocalEnd = performance.now() + (skew > 0 && skew < 4500 ? skew : 3000);
      }
      if (!state) return setShown(false);
      if (state.resumeAt === null || performance.now() < resumeLocalEnd) setShown(true);
      // English source in the DOM; the i18n catalog has an exact row for "you" and a {0} pattern for names.
      // Generic role names are localized first so the pattern yields a fully translated line.
      if (opts.classroom) by.textContent = "The clock is frozen for the whole class.";
      else by.textContent = byName === "you"
        ? "[1]+  Stopped    gitzilla    (suspended by you)"
        : `[1]+  Stopped    gitzilla    (suspended by ${byName === "the host" || byName === "the teacher" ? t(byName) : byName})`;
      host.hidden = !isHost || state.resumeAt !== null;
      hint.textContent = state.resumeAt !== null ? "" : isHost ? opts.hostHint ?? "everyone is frozen · nothing can hit you" : opts.waitHint ?? "waiting for the host to resume…";
    },
    tick() {
      if (state && state.resumeAt !== null) {
        const left = Math.max(0, resumeLocalEnd - performance.now());
        count.textContent = opts.classroom ? (left > 0 ? `Resuming in ${Math.ceil(left / 1000)}…` : "Resuming…") : left > 0 ? `$ fg %1   ${Math.ceil(left / 1000)}` : "$ fg %1";
        if (left <= 0) setShown(false); // don't wait for the server's next update to drop the card
      } else count.textContent = "";
      return frozen();
    },
    dispose() {
      if (shown) setPausedAudio(false);
      el.remove();
    },
  };
}
