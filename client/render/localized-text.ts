// Native glyphs for translated labels that the tiny ASCII pixel fonts cannot represent.
// Rasterize once and share the same metrics with layout; no per-frame text painting.
const font = '16px "Unifont", monospace';
const widths = new Map<string, number>();
let measure: CanvasRenderingContext2D | null = null;
export function nativeTextWidth(text: string, scale = 1): number {
  let width = widths.get(text);
  if (width === undefined) {
    if (!measure && typeof document !== 'undefined') measure = document.createElement('canvas').getContext('2d');
    if (measure) { measure.font = font; width = Math.ceil(measure.measureText(text).width); }
    else width = Array.from(text).length * 16;
    if (widths.size >= 600) widths.delete(widths.keys().next().value!);
    widths.set(text, width);
  }
  return width * scale;
}
export function nativeTextSprite(text: string, color: string, outline: string | null, scale = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas'), pad = outline ? 1 : 0;
  canvas.width = Math.max(1, nativeTextWidth(text, scale) + 2 * pad);
  canvas.height = 18 * scale + 2 * pad;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${16 * scale}px "Unifont", monospace`; ctx.textBaseline = 'top';
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 2; ctx.strokeText(text, pad, pad); }
  ctx.fillStyle = color; ctx.fillText(text, pad, pad);
  return canvas;
}
