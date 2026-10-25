// A small in-app code editor for the classroom (no dependencies): file tabs, line numbers, Python syntax colours,
// Tab = 4 spaces (indents a selection), Shift+Tab dedents, Enter keeps the indent (+4 after ':'), draft autosave per
// room+step in localStorage, reset to starter. A transparent <textarea> sits on top of a highlighted <pre>, so native
// selection, IME, undo and the phone keyboard all keep working. Read-only mode doubles as the teacher's code viewer.
import type { InAppFile } from "../../shared/classroom.ts";
import "./code-editor.css";

// ---------- Python tokenizer (line-based, keeps triple-quoted string state across lines) ----------

export type Tok = { t: "kw" | "builtin" | "str" | "com" | "num" | "def" | "deco" | "op" | "self" | "txt"; s: string };

const KW = new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case".split(" "));
const BUILTIN = new Set("print input len range int float str bool list dict set tuple enumerate zip sorted sum min max abs round open type isinstance map filter any all reversed format".split(" "));

/** Tokenize one line. `inStr` = the open triple quote carried in from the previous line ('"""' / "'''" / null). */
export function tokenizeLine(line: string, inStr: string | null): { toks: Tok[]; inStr: string | null } {
  const toks: Tok[] = [];
  let i = 0;
  const push = (t: Tok["t"], s: string) => { if (s) toks.push({ t, s }); };
  if (inStr) {
    const end = line.indexOf(inStr);
    if (end < 0) return { toks: [{ t: "str", s: line }], inStr };
    push("str", line.slice(0, end + 3));
    i = end + 3;
    inStr = null;
  }
  let prevWord = "";
  while (i < line.length) {
    const c = line[i];
    const rest = line.slice(i);
    if (c === "#") { push("com", rest); break; }
    // strings, with optional prefixes (f, r, b, rb, fr…)
    const sm = rest.match(/^([rRbBuUfF]{0,2})("""|'''|"|')/);
    if (sm) {
      const q = sm[2], start = sm[1].length + q.length;
      if (q.length === 3) {
        const end = rest.indexOf(q, start);
        if (end < 0) { push("str", rest); return { toks, inStr: q }; }
        push("str", rest.slice(0, end + 3)); i += end + 3; prevWord = ""; continue;
      }
      let j = start;
      while (j < rest.length && rest[j] !== q) j += rest[j] === "\\" ? 2 : 1;
      push("str", rest.slice(0, Math.min(rest.length, j + 1))); i += j + 1; prevWord = ""; continue;
    }
    const nm = rest.match(/^(?:0[xXoObB][\da-fA-F_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?j?)/);
    if (nm && !/\w/.test(line[i - 1] ?? "")) { push("num", nm[0]); i += nm[0].length; prevWord = ""; continue; }
    if (c === "@" && /^\s*$/.test(line.slice(0, i))) { const d = rest.match(/^@[\w.]+/)!; push("deco", d[0]); i += d[0].length; continue; }
    const wm = rest.match(/^[A-Za-z_À-￿][\wÀ-￿]*/);
    if (wm) {
      const w = wm[0];
      push(prevWord === "def" || prevWord === "class" ? "def" : KW.has(w) ? "kw" : BUILTIN.has(w) && line[i + w.length] === "(" ? "builtin" : w === "self" ? "self" : "txt", w);
      prevWord = w; i += w.length; continue;
    }
    if (/[=+\-*/%<>!&|^~:]/.test(c)) { push("op", c); i++; continue; }
    // plain text run (spaces, brackets, commas…)
    const pm = rest.match(/^[^#"'A-Za-z_\d@=+\-*/%<>!&|^~:À-￿]+/);
    const s = pm ? pm[0] : c;
    push("txt", s); i += s.length;
    if (s.trim()) prevWord = "";
  }
  return { toks, inStr };
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

export function highlight(src: string, language: string | undefined): string {
  if (language !== "python") return esc(src);
  let inStr: string | null = null;
  return src.split("\n").map((line) => {
    const r = tokenizeLine(line, inStr);
    inStr = r.inStr;
    return r.toks.map((t) => (t.t === "txt" ? esc(t.s) : `<span class="tk-${t.t}">${esc(t.s)}</span>`)).join("");
  }).join("\n");
}

// ---------- editing helpers (pure, tested) ----------

export interface Edit { text: string; start: number; end: number }

const lineStart = (s: string, i: number) => s.lastIndexOf("\n", i - 1) + 1;

/** Enter: newline + the current line's indent, +4 after a trailing ':' (ignoring comments/spaces). */
export function newlineEdit(text: string, start: number, end: number): Edit {
  const ls = lineStart(text, start);
  const line = text.slice(ls, start);
  const indent = line.match(/^[ \t]*/)![0];
  const code = line.replace(/#.*$/, "").trimEnd();
  const extra = code.endsWith(":") ? "    " : "";
  const ins = "\n" + indent + extra;
  return { text: text.slice(0, start) + ins + text.slice(end), start: start + ins.length, end: start + ins.length };
}

/** The smallest edit turning `before` into `after`: replace before[from..to) with `insert`. */
export function changedRange(before: string, after: string): { from: number; to: number; insert: string } {
  const max = Math.min(before.length, after.length);
  let a = 0;
  while (a < max && before[a] === after[a]) a++;
  let b = 0;
  while (b < max - a && before[before.length - 1 - b] === after[after.length - 1 - b]) b++;
  return { from: a, to: before.length - b, insert: after.slice(a, after.length - b) };
}

/** Backspace in leading spaces (no selection, only spaces between line start and caret): back to the previous
 *  4-column stop, like Tab in reverse (8 → 4, 6 → 4, 3 → 0). null = let the browser do a normal Backspace. */
export function backspaceEdit(text: string, start: number, end: number): Edit | null {
  if (start !== end) return null;
  const ls = lineStart(text, start);
  const col = start - ls;
  if (col < 2 || !/^ +$/.test(text.slice(ls, start))) return null;
  const at = ls + Math.floor((col - 1) / 4) * 4;
  return { text: text.slice(0, at) + text.slice(start), start: at, end: at };
}

/** Tab / Shift+Tab: insert 4 spaces at the caret, or (de)indent every selected line. */
export function tabEdit(text: string, start: number, end: number, dedent: boolean): Edit {
  const multi = text.slice(start, end).includes("\n");
  if (!dedent && !multi) {
    const col = start - lineStart(text, start);
    const ins = " ".repeat(4 - (col % 4));
    return { text: text.slice(0, start) + ins + text.slice(end), start: start + ins.length, end: start + ins.length };
  }
  const ls = lineStart(text, start);
  const le = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const block = text.slice(ls, le).split("\n");
  let firstDelta = 0, total = 0;
  const out = block.map((l, i) => {
    if (dedent) {
      const n = Math.min(4, l.match(/^ */)![0].length);
      if (i === 0) firstDelta = -n;
      total -= n;
      return l.slice(n);
    }
    if (i === 0) firstDelta = 4;
    total += 4;
    return "    " + l;
  }).join("\n");
  const nt = text.slice(0, ls) + out + text.slice(le);
  return { text: nt, start: Math.max(ls, start + firstDelta), end: multi ? end + total : Math.max(ls, end + firstDelta) };
}

// ---------- the editor ----------

export interface CodeEditor {
  el: HTMLElement;
  files(): InAppFile[];
  setFiles(files: InAppFile[], opts?: { keepActive?: boolean }): void;
  /** Restore the starter files (and clear the saved draft). */
  reset(): void;
  setReadOnly(ro: boolean): void;
  /** Path of the file to run: the first .py outside tests/ (falls back to the active file). */
  entry(): string | null;
  dispose(): void;
}

export interface CodeEditorOpts {
  starter: InAppFile[];
  language?: "python";
  /** localStorage key for the draft (per room + step); omit for no autosave (read-only viewer). */
  storageKey?: string;
  /** Used when there is no saved draft yet: e.g. the student's code from the previous step of the same lesson.
   *  Only paths that exist in the starter are taken; README.md always comes from the new step's starter. */
  seed?: InAppFile[] | null;
  readOnly?: boolean;
  onChange?(files: InAppFile[]): void;
  label?: string;
}

const clone = (f: InAppFile[]) => f.map((x) => ({ path: x.path, content: x.content }));

function loadDraft(key: string | undefined, starter: InAppFile[]): InAppFile[] | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { files: InAppFile[] };
    // keep the starter's file list (teacher may have changed it); take saved content for paths that still exist
    const byPath = new Map(saved.files.map((f) => [f.path, f.content]));
    return starter.map((f) => ({ path: f.path, content: byPath.get(f.path) ?? f.content }));
  } catch {
    return null;
  }
}

/** Starter with code carried over from `seed` for matching paths (not README), or null if nothing carries over. */
export function seeded(starter: InAppFile[], seed: InAppFile[] | null | undefined): InAppFile[] | null {
  if (!seed?.length) return null;
  const byPath = new Map(seed.map((f) => [f.path, f.content]));
  let any = false;
  const out = starter.map((f) => {
    const prev = byPath.get(f.path);
    if (prev === undefined || /(^|\/)readme(\.md)?$/i.test(f.path) || prev === f.content) return { ...f };
    any = true;
    return { path: f.path, content: prev };
  });
  return any ? out : null;
}

/** The saved draft for a key (used to carry a student's code into the next step). */
export function savedDraft(key: string): InAppFile[] | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { files: InAppFile[] }).files : null;
  } catch {
    return null;
  }
}

export function createCodeEditor(opts: CodeEditorOpts): CodeEditor {
  const starter = clone(opts.starter);
  let files = loadDraft(opts.storageKey, starter) ?? seeded(starter, opts.seed) ?? clone(starter);
  let active = 0;
  let readOnly = !!opts.readOnly;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const el = document.createElement("div");
  el.className = "ce" + (readOnly ? " ce-ro" : "");
  const tabs = document.createElement("div");
  tabs.className = "ce-tabs";
  tabs.setAttribute("role", "tablist");
  const body = document.createElement("div");
  body.className = "ce-body";
  const gutter = document.createElement("pre");
  gutter.className = "ce-gutter";
  gutter.setAttribute("aria-hidden", "true");
  const scroller = document.createElement("div");
  scroller.className = "ce-scroll";
  const hl = document.createElement("pre");
  hl.className = "ce-hl";
  hl.setAttribute("aria-hidden", "true");
  const ta = document.createElement("textarea");
  ta.className = "ce-input";
  for (const [k, v] of Object.entries({ spellcheck: "false", autocapitalize: "off", autocomplete: "off", autocorrect: "off", wrap: "off", "aria-label": opts.label ?? "code editor", "data-testid": "code-editor-input" })) ta.setAttribute(k, v);
  const code = document.createElement("div");
  code.className = "ce-code";
  code.append(hl, ta);
  // one scroller: the gutter is sticky on the left, the code layer is sized to its content (no inner scrolling)
  const row = document.createElement("div");
  row.className = "ce-row";
  row.append(gutter, code);
  scroller.append(row);
  body.append(scroller);
  el.append(tabs, body);

  const save = () => {
    if (!opts.storageKey || readOnly) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(opts.storageKey!, JSON.stringify({ files, at: Date.now() })); } catch { /* storage full/blocked: editing still works */ }
    }, 300);
  };

  const paint = () => {
    const src = files[active]?.content ?? "";
    // trailing newline keeps the last empty line visible in the <pre>
    hl.innerHTML = highlight(src, opts.language) + "\n";
    const n = src.split("\n").length;
    if (gutter.childElementCount !== n || gutter.dataset.n !== String(n)) {
      gutter.dataset.n = String(n);
      gutter.textContent = Array.from({ length: n }, (_, i) => String(i + 1)).join("\n") + "\n";
    }
  };

  const renderTabs = () => {
    tabs.replaceChildren(...files.map((f, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ce-tab" + (i === active ? " on" : "");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(i === active));
      b.textContent = files.length === 1 ? f.path : f.path.split("/").pop() || f.path;
      b.title = f.path;
      b.onclick = () => { active = i; show(); };
      return b;
    }));
  };

  const show = () => {
    ta.value = files[active]?.content ?? "";
    ta.readOnly = readOnly;
    el.classList.toggle("ce-ro", readOnly);
    renderTabs();
    paint();
    scroller.scrollTop = scroller.scrollLeft = 0;
  };

  const commit = () => {
    if (!files[active]) return;
    files[active].content = ta.value;
    paint();
    save();
    opts.onChange?.(clone(files));
  };

  const apply = (e: Edit) => {
    ta.focus();
    // replace only the changed range through execCommand so it is one native undo step, and Ctrl+Z puts the caret
    // back there (replacing the whole value left everything selected after undo: the next key wiped the file)
    const r = changedRange(ta.value, e.text);
    ta.setSelectionRange(r.from, r.to);
    const ok = r.insert ? document.execCommand?.("insertText", false, r.insert) : document.execCommand?.("delete");
    if (!ok || ta.value !== e.text) ta.value = e.text;
    ta.setSelectionRange(e.start, e.end);
    commit();
  };

  ta.addEventListener("input", commit);
  // the textarea never scrolls itself (it is as big as the text); keep it pinned if the browser tries
  ta.addEventListener("scroll", () => { ta.scrollTop = 0; ta.scrollLeft = 0; });
  ta.addEventListener("keydown", (ev) => {
    if (readOnly || ev.isComposing) return;
    if (ev.key === "Tab" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      apply(tabEdit(ta.value, ta.selectionStart, ta.selectionEnd, ev.shiftKey));
    } else if (ev.key === "Enter" && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      apply(newlineEdit(ta.value, ta.selectionStart, ta.selectionEnd));
    } else if (ev.key === "Backspace" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      const e = backspaceEdit(ta.value, ta.selectionStart, ta.selectionEnd);
      if (e) { ev.preventDefault(); apply(e); }
    }
  });
  // Focusing the textarea (as wide as the longest line) can make the browser scroll it sideways to reveal the element
  // itself, hiding the first columns next to the gutter (seen on iPhone). While the caret fits in the first screen,
  // keep the scroller at the left edge; on really long lines the browser keeps following the caret, and a sideways
  // swipe to read a line is left alone (no caret event).
  let measure: CanvasRenderingContext2D | null | undefined;
  const caretX = () => {
    measure ??= document.createElement("canvas").getContext("2d");
    if (!measure) return Infinity;
    const cs = getComputedStyle(ta);
    measure.font = cs.font;
    return parseFloat(cs.paddingLeft) + measure.measureText(ta.value.slice(lineStart(ta.value, ta.selectionEnd), ta.selectionEnd)).width;
  };
  const pinLeft = () => {
    if (!scroller.scrollLeft || document.activeElement !== ta) return;
    if (caretX() + 16 <= scroller.clientWidth - gutter.offsetWidth) scroller.scrollLeft = 0;
  };
  const pinSoon = () => { requestAnimationFrame(pinLeft); setTimeout(pinLeft, 150); };   // after the browser's own reveal
  for (const type of ["focus", "pointerup", "keyup", "input"]) ta.addEventListener(type, pinSoon);
  // soft keyboards (Android reports key "Unidentified"; iOS may skip keydown): the same dedent from beforeinput.
  // A keydown that already handled Backspace was prevented, so this doesn't fire twice.
  ta.addEventListener("beforeinput", (ev) => {
    if (readOnly || ev.isComposing || ev.inputType !== "deleteContentBackward") return;
    const e = backspaceEdit(ta.value, ta.selectionStart, ta.selectionEnd);
    if (e) { ev.preventDefault(); apply(e); }
  });

  show();

  return {
    el,
    files: () => clone(files),
    setFiles(next, o) {
      const path = files[active]?.path;
      files = clone(next);
      active = o?.keepActive ? Math.max(0, files.findIndex((f) => f.path === path)) : 0;
      show();
    },
    reset() {
      files = clone(starter);
      if (opts.storageKey) try { localStorage.removeItem(opts.storageKey); } catch { /* ignore */ }
      show();
      opts.onChange?.(clone(files));
    },
    setReadOnly(ro) { readOnly = ro; show(); },
    entry() {
      const py = files.find((f) => /\.py$/i.test(f.path) && !/(^|\/)tests?\//i.test(f.path) && !/(^|\/)test_[^/]*\.py$/i.test(f.path));
      return py?.path ?? files[active]?.path ?? null;
    },
    dispose() { clearTimeout(saveTimer); el.remove(); },
  };
}
