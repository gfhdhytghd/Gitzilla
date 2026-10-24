// One app-wide procedural audio instance (client/audio), unlocked on the first tap, plus a mute toggle.
import { createAudio } from "../audio";
import { h, store } from "./util";

export const audio = createAudio();

let muted = store.get("kaiju.muted") === "1";
audio.setMuted(muted);
document.addEventListener("pointerdown", () => void audio.unlock().catch(() => {}), { capture: true });
document.addEventListener("keydown", () => void audio.unlock().catch(() => {}), { capture: true });

const btn = h("button.mute-btn", { "aria-label": "toggle sound", title: "sound (M)" });
const paint = () => (btn.textContent = muted ? "♪ off" : "♪ on");
const toggle = () => {
  muted = !muted;
  store.set("kaiju.muted", muted ? "1" : "0");
  audio.setMuted(muted);
  paint();
};
btn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggle();
});
addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "m" && !(e.target instanceof HTMLInputElement)) toggle();
});
paint();
document.body.append(btn);
