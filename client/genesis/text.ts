// Crisp text overlay for the Genesis cinematic. The art lives on a low-res pixel canvas; text (real paths,
// real code, captions) is drawn on a device-resolution canvas on top so lowercase code stays readable.

export type Font = "term" | "pix" | "small";
const FAMILY: Record<Font, string> = {
  term: '"VT323", ui-monospace, monospace',
  pix: '"Press Start 2P", ui-monospace, monospace',
  small: '"Silkscreen", "Press Start 2P", monospace',
};
// Visual tweak per family so equal "logical size" reads about the same height.
const SCALE: Record<Font, number> = { term: 1.25, pix: 0.62, small: 0.8 };

export interface TextOpts {
  size?: number;            // logical px (cap height-ish)
  min?: number;             // minimum CSS px
  color?: string;
  align?: CanvasTextAlign;
  base?: CanvasTextBaseline;
  alpha?: number;
  font?: Font;
  glow?: string | null;     // shadow glow color
  maxW?: number;            // logical px; text is ellipsized to fit
  bg?: string;              // chip background
}

export class TextLayer {
  ctx: CanvasRenderingContext2D;
  /** CSS px per logical px. */
  k = 1;
  dpr = 1;
  ox = 0; oy = 0;           // logical offset (screen shake)
  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  begin(k: number, dpr: number) {
    this.k = k; this.dpr = dpr;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  px(size: number, font: Font = "term", min = 10): number {
    return Math.max(min, Math.round(size * SCALE[font] * this.k));
  }

  /** Logical height of a line of text at this size. */
  lineH(size: number, font: Font = "term", min = 10): number {
    return (this.px(size, font, min) * (font === "term" ? 0.92 : 1.25)) / this.k;
  }

  setFont(size: number, font: Font = "term", min = 10) {
    this.ctx.font = `${this.px(size, font, min)}px ${FAMILY[font]}`;
  }

  /** Width in logical px. */
  measure(str: string, size = 8, font: Font = "term", min = 10): number {
    this.setFont(size, font, min);
    return this.ctx.measureText(str).width / this.k;
  }

  fit(str: string, maxW: number, size = 8, font: Font = "term", min = 10): string {
    if (this.measure(str, size, font, min) <= maxW) return str;
    let lo = 0, hi = str.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.measure(str.slice(0, mid) + "…", size, font, min) <= maxW) lo = mid; else hi = mid - 1;
    }
    return lo > 0 ? str.slice(0, lo) + "…" : "";
  }

  text(str: string, x: number, y: number, o: TextOpts = {}): number {
    if (!str) return 0;
    const c = this.ctx;
    const size = o.size ?? 8, font = o.font ?? "term", min = o.min ?? 10;
    if (o.maxW !== undefined) str = this.fit(str, o.maxW, size, font, min);
    if (!str) return 0;
    this.setFont(size, font, min);
    c.textAlign = o.align ?? "left";
    c.textBaseline = o.base ?? "top";
    const X = (x + this.ox) * this.k, Y = (y + this.oy) * this.k;
    const w = c.measureText(str).width;
    c.globalAlpha = o.alpha ?? 1;
    if (o.bg) {
      const h = this.px(size, font, min);
      const left = o.align === "center" ? X - w / 2 : o.align === "right" ? X - w : X;
      const top = o.base === "middle" ? Y - h * 0.55 : Y - h * 0.08;
      c.fillStyle = o.bg;
      c.fillRect(Math.round(left - 4), Math.round(top), Math.round(w + 8), Math.round(h * 1.06));
    }
    if (o.glow) { c.shadowColor = o.glow; c.shadowBlur = Math.max(4, this.px(size, font, min) * 0.5); }
    c.fillStyle = o.color ?? "#d9ffe9";
    c.fillText(str, X, Y);
    c.shadowBlur = 0;
    c.globalAlpha = 1;
    return w / this.k;
  }
}
