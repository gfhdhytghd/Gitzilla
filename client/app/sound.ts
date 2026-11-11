// One app-wide procedural audio instance (client/audio), unlocked on the first tap, plus a mute toggle.
import { createAudio } from "../audio";
import { h, store } from "./util";

export const audio = createAudio();

// Classroom: phones never play; a big screen ("screen") plays only while its gate is open (the class attack).
let classroom: "off" | "phone" | "screen" = "off", classroomGate = false;
const classroomQuiet = () => classroom === "phone" || (classroom === "screen" && !classroomGate);
let muted = store.get("kaiju.muted") === "1";
audio.setMuted(muted);
// Only some events grant user activation: a touch pointerdown does NOT (mouse pointerdown does), so phones need
// pointerup/touchend/click. Keep listening: iOS can re-suspend the context after app switches or calls.
const unlock = () => { if (classroom !== "phone") void audio.unlock().catch(() => {}); };
for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"])
  document.addEventListener(type, unlock, { capture: true, passive: true });

export const muteBtn = h("button.mute-btn", { "aria-label": "toggle sound", title: "sound (M)" });
const paint = () => (muteBtn.textContent = muted ? "♪ off" : "♪ on");
const toggle = () => {
  muted = !muted;
  store.set("kaiju.muted", muted ? "1" : "0");
  apply();
  paint();
};
muteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggle();
});
addEventListener("keydown", (e) => {
  if (classroom === "off" && e.key.toLowerCase() === "m" && !(e.target instanceof HTMLInputElement)) toggle();
});
paint();
document.body.append(muteBtn);

/** For the Settings sheet (phones have no floating mute button outside the fight deck). */
export const isMuted = () => muted;
export function setMuted(next: boolean) {
  if (next !== muted) toggle();
}

let matchPaused = false;
function apply() { audio.setMuted(matchPaused || classroomQuiet() || muted); }
/** Host pause: everything goes quiet; the user's own mute preference is kept. */
export function setPausedAudio(paused: boolean) {
  matchPaused = paused;
  apply();
}

/** Classroom phones stay silent (no mute button either); a big screen keeps its mute button and sounds only while
 *  `gate` is open. The user's own mute preference and the host pause always win. "off" when leaving the classroom. */
export function setClassroomAudio(mode: "off" | "phone" | "screen", gate = false) {
  if (mode === classroom && gate === classroomGate) return;
  classroom = mode; classroomGate = gate; apply(); muteBtn.hidden = mode === "phone";
}
