// Small shared slide effects: typed text, the bundled homepage QR and a pixel "ring" pulse.
import { h } from "../../app/util.ts";
import qrSvg from "../qr-home.svg?raw";
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

/** The homepage QR (https://gitzilla.wilflin.me), generated once from server/qr.ts and bundled: no network needed. */
export const HOME_URL = "https://gitzilla.wilflin.me";
export function homeQr(cls = "qr"): HTMLElement {
  return h(`div.${cls}`, { role: "img", "aria-label": `QR code for ${HOME_URL}`, html: qrSvg });
}

/** Expanding pixel ring at (x, y) inside host (a "haptic" pulse). */
export function ring(host: HTMLElement, x: number, y: number, color = "var(--cyan)") {
  const r = h("i.ring", { style: `left:${x}px;top:${y}px;--c:${color}` });
  host.append(r);
  setTimeout(() => r.remove(), 900);
}

