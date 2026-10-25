// Small shared slide effects: typed text, pixel confetti, QR images (server /api/qr, fetched once so a later Wi-Fi drop
// keeps showing it) and a pixel "ring" pulse.
import { h } from "../../app/util.ts";
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

const CONFETTI = ["#3dff8b", "#ff3d8b", "#ffd23d", "#3de8ff", "#b18cff"];
/** Square pixel confetti bursting from (x, y) in stage px; removes itself. */
export function confetti(host: HTMLElement, x: number, y: number, n = 26) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 220, s = 8 + ((Math.random() * 3) | 0) * 4;
    const p = h("i.confetti", { style: `left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:${CONFETTI[i % CONFETTI.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 120}px;--r:${(Math.random() * 720 - 360) | 0}deg;animation-delay:${(Math.random() * 80) | 0}ms` });
    host.append(p);
    setTimeout(() => p.remove(), 1500);
  }
}

const qrCache = new Map<string, Promise<string | null>>();
/** Object URL for a QR of `text`, or null when the server can't be reached. */
export function qrUrl(text: string): Promise<string | null> {
  let hit = qrCache.get(text);
  if (!hit) {
    hit = fetch(`/api/qr?text=${encodeURIComponent(text)}`).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null);
    qrCache.set(text, hit);
  }
  return hit;
}
export function qrImage(text: string, cls = "qr"): HTMLElement {
  const box = h(`div.${cls}`);
  void qrUrl(text).then((src) => box.replaceChildren(src ? h("img", { src, alt: `QR code for ${text}` }) : h("div.qr-off", null, "QR offline")));
  return box;
}

/** Expanding pixel ring at (x, y) inside host (a "haptic" pulse). */
export function ring(host: HTMLElement, x: number, y: number, color = "var(--cyan)") {
  const r = h("i.ring", { style: `left:${x}px;top:${y}px;--c:${color}` });
  host.append(r);
  setTimeout(() => r.remove(), 900);
}

