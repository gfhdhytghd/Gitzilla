// Small shared slide effects: typed text, the bundled homepage QR and a pixel "ring" pulse.
import { h } from "../../app/util.ts";
import qrPng from "../assets/qr-home.png";
import type { Life } from "../core.ts";

/** Types each line into its own row with a block cursor; ms = 0 shows them at once (calm). */
export async function typeLines(el: HTMLElement, lines: string[], life: Life, ms = 36) {
  el.replaceChildren();
  const cursor = h("span.cursor", null, "█");
  for (const line of lines) {
    const row = h("div.typed");
    el.append(row);
    if (!ms) { row.textContent = line; continue; }
    row.append(cursor);
    for (let i = 1; i <= line.length; i++) {
      row.textContent = line.slice(0, i);
      row.append(cursor);
      await life.sleep(ms);
      if (!life.alive) return;
    }
    await life.sleep(220);
  }
}

/** The homepage QR (https://gitzilla.wilflin.me): a bundled 1036 px black-on-white PNG (37 modules × 28 px, quiet
 *  zone included, generated from server/qr.ts and decoded to verify). A plain <img>: no inline SVG, nothing inherited,
 *  no filter, blend or overlay on top, so no browser can paint it solid. */
export const HOME_URL = "https://gitzilla.wilflin.me";
/** QR slides call this: the stage's CRT scanline/vignette overlay is switched off while they show, so nothing sits
 *  on top of the code. */
export function clearOverQr(el: HTMLElement, life: Life) {
  const ds = el.closest(".ds");
  ds?.classList.add("qr-clear");
  life.add(() => ds?.classList.remove("qr-clear"));
}
export function homeQr(cls = "qr"): HTMLElement {
  return h(`div.qr-box.${cls}`, null, h("img.qr-img", { src: qrPng, alt: `QR code for ${HOME_URL}`, width: 1036, height: 1036, draggable: "false" }));
}

/** Expanding pixel ring at (x, y) inside host (a "haptic" pulse). */
export function ring(host: HTMLElement, x: number, y: number, color = "var(--cyan)") {
  const r = h("i.ring", { style: `left:${x}px;top:${y}px;--c:${color}` });
  host.append(r);
  setTimeout(() => r.remove(), 900);
}

