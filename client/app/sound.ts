// One app-wide procedural audio instance (client/audio), unlocked on the first tap, plus a mute toggle.
import { createAudio } from "../audio";
import { h, store } from "./util";

export const audio = createAudio();

let classroomQuiet = false;
let muted = store.get("kaiju.muted") === "1";
audio.setMuted(muted);
// Only some events grant user activation: a touch pointerdown does NOT (mouse pointerdown does), so phones need
// pointerup/touchend/click. Keep listening: iOS can re-suspend the context after app switches or calls.
const unlock = () => { if (!classroomQuiet) void audio.unlock().catch(() => {}); };
for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"])
  document.addEventListener(type, unlock, { capture: true, passive: true });

export const muteBtn = h("button.mute-btn", { "aria-label": "toggle sound", title: "sound (M)" });
const paint = () => (muteBtn.textContent = muted ? "♪ off" : "♪ on");
const toggle = () => {
  muted = !muted;
  store.set("kaiju.muted", muted ? "1" : "0");
  audio.setMuted(classroomQuiet || muted);
  paint();
};
muteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggle();
});
addEventListener("keydown", (e) => {
  if (!classroomQuiet && e.key.toLowerCase() === "m" && !(e.target instanceof HTMLInputElement)) toggle();
});
paint();
document.body.append(muteBtn);

/** Classroom phones stay silent; retain the user’s battle sound preference. */
export function setClassroomAudio(quiet: boolean) {
  classroomQuiet = quiet; audio.setMuted(quiet || muted); muteBtn.hidden = quiet;
}
