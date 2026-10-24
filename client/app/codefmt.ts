// Weapon names are tiny code expressions ("for { go serve() }", "yield from app()", "unsafe { search() }").
// Render them as monospace code with light syntax highlighting, never truncated mid-token: long names shrink instead.
import { h } from "./util";

const KEYWORDS = new Set(
  ("for while if else return yield from async await go defer unsafe let const var fn func def class new try catch throw " +
    "match case switch break continue import export public static void impl pub mut use mod lambda in of do end puts " +
    "select loop where struct enum interface type as is not and or with raise except finally sizeof template typename " +
    "goto when val fun object override suspend chan map nil null true false None True False self this super").split(" "),
);

export type TokKind = "kw" | "fn" | "id" | "str" | "num" | "op";
export function tokenize(src: string): { text: string; kind: TokKind }[] {
  const out: { text: string; kind: TokKind }[] = [];
  const re = /("[^"]*"?|'[^']*'?|`[^`]*`?)|(\d[\w.]*)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z0-9_$"'`]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const [t, str, num, word, ws] = m;
    if (str) out.push({ text: t, kind: "str" });
    else if (num) out.push({ text: t, kind: "num" });
    else if (word) {
      const next = src.slice(re.lastIndex).trimStart()[0];
      out.push({ text: t, kind: KEYWORDS.has(word) ? "kw" : next === "(" || next === "!" ? "fn" : "id" });
    } else if (ws) out.push({ text: t, kind: "op" });
    else out.push({ text: t, kind: "op" });
  }
  return out;
}

/** Inline highlighted code; names longer than `fit` chars shrink (font-size) rather than truncate. */
export function codeSpan(src: string, fit = 24): HTMLElement {
  const el = h("code.codex", { title: src });
  for (const t of tokenize(src)) el.append(t.kind === "op" && !t.text.trim() ? t.text : h(`span.t-${t.kind}`, null, t.text));
  if (src.length > fit) el.style.fontSize = `${Math.max(0.6, fit / src.length).toFixed(3)}em`;
  return el;
}

const CANVAS_COL: Record<TokKind, string> = { kw: "#ff6ac1", fn: "#3de8ff", id: "#e8fff2", str: "#ffd23d", num: "#ffb000", op: "#9aa7b4" };

/** Canvas version (share card): draws highlighted code at (x, y), shrinking the size until it fits maxW. */
export function drawCode(g: CanvasRenderingContext2D, src: string, x: number, y: number, size: number, maxW: number, family = '"VT323", monospace') {
  let s = size;
  g.font = `${s}px ${family}`;
  while (g.measureText(src).width > maxW && s > 10) g.font = `${--s}px ${family}`;
  let cx = x;
  for (const t of tokenize(src)) {
    g.fillStyle = CANVAS_COL[t.kind];
    g.fillText(t.text, cx, y);
    cx += g.measureText(t.text).width;
  }
}
