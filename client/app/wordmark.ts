// The hand-drawn GITZILLA wordmark (public/gitzilla-wordmark*.png/.webp, transparent; source brand/gitzilla-logo.png):
// bubble graffiti GIT (mint) + ZILLA (pink), a skull and a pixel sparkle dotting the i's. Raster art, so it's served
// at 1x/2x through srcset; everything else in the UI keeps the pixel font. The pixel kaiju mark (mark.ts) sits beside it.
import { h } from "./util";

export const WORDMARK_W = 833, WORDMARK_H = 299;
const SRCSET = "/gitzilla-wordmark-sm.png 416w, /gitzilla-wordmark.png 833w";

/**
 * `<picture>` wordmark. `width` = CSS width it is laid out at (drives `sizes`, so phones fetch the 416px file);
 * `enter` = tiny drop-in bounce; `sparkle` = the i's pixel sparkle twinkles (both off under prefers-reduced-motion).
 */
export function wordmark(opts: { width: string; enter?: boolean; sparkle?: boolean; className?: string } = { width: "320px" }): HTMLElement {
  const img = h("img.wm-img", {
    src: "/gitzilla-wordmark-sm.png", srcset: SRCSET, sizes: opts.width, width: WORDMARK_W, height: WORDMARK_H,
    alt: "GITZILLA", draggable: "false", decoding: "async",
  });
  const pic = h("picture", null, h("source", { type: "image/webp", srcset: "/gitzilla-wordmark.webp 833w", sizes: opts.width }), img);
  return h(
    `span.wm${opts.enter ? ".wm-enter" : ""}${opts.className ? "." + opts.className : ""}`,
    { translate: "no", style: `--wm-w:${opts.width}` },
    pic,
    // twinkle over the drawn sparkle (dot of the i in ZILLA) and a smaller one on the skull (dot of the i in GIT)
    ...(opts.sparkle ? [h("i.wm-spark", { "aria-hidden": "true" }), h("i.wm-spark.wm-spark-2", { "aria-hidden": "true" })] : []),
  );
}

let cached: Promise<HTMLImageElement | null> | null = null;
/** Decoded full-size wordmark for canvas drawing (share card); null if it can't load. */
export function wordmarkImage(): Promise<HTMLImageElement | null> {
  return (cached ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/gitzilla-wordmark.png";
  }));
}
