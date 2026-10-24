// Teacher rubric editor (upload/paste a grading doc → parsed criteria → tweak → "use this rubric") and the student's
// lobby card "how you'll be judged" (criteria + a pre-fight estimate from their real report card).
// Parsing happens server-side (rubric/ by codex-rubric via POST /api/rubric/parse); this file only edits the result.
import type { CriterionResult, QualityStat, Rubric, RubricCriterion, RubricSignal } from "../../shared/types.ts";
import { h } from "../app/util.ts";
import { richText } from "./feed.ts";
import { SIGNALS, SIGNAL_ORDER, estimateFromQuality, localDefaultRubric, scoreColor, targetText, weightPercents, weightedScore } from "./rubric-data.ts";
import "./edu.css";
import "./rubric.css";

export type ParseInput = { text: string; filename?: string } | { file: File };
export type ParseFn = (input: ParseInput) => Promise<Rubric>;

// rubric/ (codex-rubric) is pure TS; when it exists the client can parse locally if the server endpoint is missing.
const localRubric = import.meta.glob("../../rubric/index.ts") as Record<string, () => Promise<{ parseRubric?: (text: string, filename?: string) => Rubric; defaultRubric?: () => Rubric }>>;
const loadLocal = async () => (Object.values(localRubric)[0] ? await Object.values(localRubric)[0]() : null);

/** Default parser: POST the doc to the server (codex-net), falling back to rubric/ in the browser for text. */
export function serverParse(opts: { room?: string; token?: string } = {}): ParseFn {
  return async (input) => {
    const isFile = "file" in input;
    const name = isFile ? input.file.name : input.filename ?? "rubric.md";
    const type = isFile ? input.file.type || (/\.pdf$/i.test(name) ? "application/pdf" : "text/markdown") : "text/markdown";
    const qs = new URLSearchParams({ filename: name, ...(opts.room ? { room: opts.room } : {}) });
    let res: Response | null = null;
    try {
      res = await fetch(`/api/rubric/parse?${qs}`, {
        method: "POST",
        headers: { "content-type": type, ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
        body: isFile ? input.file : input.text,
      });
    } catch {
      res = null;
    }
    if (res?.ok) return (await res.json()) as Rubric;
    if (!res || res.status === 404) {
      const local = await loadLocal();
      if (local?.parseRubric && (!isFile || !/pdf/.test(type))) return local.parseRubric(isFile ? await input.file.text() : input.text, name);
    }
    throw new Error(res ? (await res.text().catch(() => "")) || `parse failed (${res.status})` : "can't reach the server");
  };
}

/** The server's default rubric when rubric/ is available in the bundle, else the built-in mirror. */
export async function defaultRubric(): Promise<Rubric> {
  const local = await loadLocal().catch(() => null);
  return local?.defaultRubric?.() ?? localDefaultRubric();
}

const KEYWORDS: [RegExp, RubricSignal][] = [
  [/test|coverage|pytest|junit/i, "tests"],
  [/readme/i, "readme"],
  [/doc|comment|explain/i, "documentation"],
  [/function|method/i, "function-length"],
  [/modular|coupl|architect|structure|separation/i, "modularity"],
  [/circular|cycle/i, "cycles"],
  [/todo|fixme|debt|hack/i, "tech-debt"],
  [/\bci\b|pipeline|github actions|workflow/i, "ci"],
  [/licen[cs]e/i, "license"],
  [/type|typescript|annotation|mypy/i, "typing"],
  [/commit|history|git/i, "commits"],
  [/size|lines of code|loc\b/i, "size"],
];
export const guessSignal = (line: string): RubricSignal => KEYWORDS.find(([re]) => re.test(line))?.[1] ?? "check";

const clone = (r: Rubric): Rubric => JSON.parse(JSON.stringify(r));
const uid = () => `c${Math.random().toString(36).slice(2, 8)}`;

export interface RubricEditor {
  el: HTMLElement;
  /** The rubric currently in use in the room (LobbyState.rubric); shows "in use" when the draft matches. */
  setCurrent(r: Rubric | null | undefined): void;
  draft(): Rubric;
  dispose(): void;
}

export function createRubricEditor(opts: { current?: Rubric | null; parse?: ParseFn; onUse(r: Rubric): void; room?: string; token?: string }): RubricEditor {
  const parse = opts.parse ?? serverParse({ room: opts.room, token: opts.token });
  let current: Rubric | null = opts.current ?? null;
  let draft: Rubric = clone(current ?? localDefaultRubric());
  let touched = false;
  if (!current) defaultRubric().then((d) => { if (!touched) { draft = clone(d); render(); } });
  let status: { text: string; kind: "" | "busy" | "err" | "ok" } = { text: "", kind: "" };

  const el = h("div.rb-editor");
  const fileInput = h("input", { type: "file", accept: ".md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf", hidden: true }) as HTMLInputElement;
  const paste = h("textarea.rb-paste", { rows: 4, placeholder: "…or paste the grading criteria here, e.g.\nTesting (30%): unit tests for the main modules\nDocumentation — 20 pts: README with setup steps\nNo file over 300 lines" }) as HTMLTextAreaElement;

  const run = async (input: ParseInput, label: string) => {
    status = { text: `$ parsing ${label}…`, kind: "busy" };
    render();
    try {
      const r = await parse(input);
      draft = clone(r);
      draft.criteria.forEach((c) => (c.id ||= uid()));
      touched = true;
      const n = draft.criteria.length, u = draft.unparsed?.length ?? 0;
      status = { text: `✓ found ${n} criteri${n === 1 ? "on" : "a"}${u ? ` · ${u} line${u === 1 ? "" : "s"} to check below` : ""}`, kind: "ok" };
    } catch (e) {
      status = { text: `✗ ${(e as Error).message}. Try a .md/.txt file or paste the text.`, kind: "err" };
    }
    render();
  };
  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f) run({ file: f }, f.name);
    fileInput.value = "";
  });

  const drop = h(
    "div.rb-drop",
    {
      ondragover: (e: Event) => { e.preventDefault(); drop.classList.add("over"); },
      ondragleave: () => drop.classList.remove("over"),
      ondrop: (e: Event) => {
        e.preventDefault();
        drop.classList.remove("over");
        const f = (e as DragEvent).dataTransfer?.files?.[0];
        if (f) run({ file: f }, f.name);
      },
    },
    h("div.rb-drop-title", null, "Drop your grading doc here"),
    h("div.rb-drop-sub", null, ".md · .txt · .pdf, or ", h("button.rb-link", { type: "button", onclick: () => fileInput.click() }, "choose a file")),
    fileInput,
    paste,
    h("button.btn.rb-parse", { type: "button", onclick: () => paste.value.trim() && run({ text: paste.value, filename: "pasted.md" }, "pasted text") }, "$ parse text"),
  );

  const same = () => !!current && JSON.stringify(current) === JSON.stringify(draft);

  function render() {
    const pct = weightPercents(draft.criteria);
    const rows = draft.criteria.map((c, i) => criterionRow(c, pct[i], i));
    el.replaceChildren(...([
      h("div.rb-head", null,
        h("div", null, h("div.rb-kicker", null, "HOW REPOS ARE JUDGED"), h("input.rb-title", { value: draft.title, "aria-label": "rubric title", oninput: (e: Event) => { draft.title = (e.target as HTMLInputElement).value; touched = true; foot(); } })),
        h("span.rb-source", null, draft.source === "doc" ? "from your document" : "default rubric")),
      drop,
      status.text ? h(`div.rb-status.${status.kind || "info"}`, null, status.text) : null,
      h("div.rb-criteria", null, ...rows),
      h("button.rb-add", { type: "button", onclick: () => { draft.criteria.push({ id: uid(), name: "New criterion", weight: 10, signal: "check", description: "" }); touched = true; render(); } }, "+ add criterion"),
      draft.unparsed?.length
        ? h("div.rb-unparsed", null,
            h("div.rb-unparsed-title", null, `Lines I couldn't map to a measurement (${draft.unparsed.length}). Add them as criteria or ignore them:`),
            ...draft.unparsed.map((line, i) => h("div.rb-uline", null,
              h("span", null, line),
              h("button.rb-link", { type: "button", onclick: () => { draft.criteria.push({ id: uid(), name: line.replace(/^[-*#\d.)\s]+/, "").slice(0, 60), weight: 10, signal: guessSignal(line), description: line }); draft.unparsed!.splice(i, 1); touched = true; render(); } }, "+ add"),
              h("button.rb-link.dim", { type: "button", onclick: () => { draft.unparsed!.splice(i, 1); touched = true; render(); } }, "ignore"))))
        : null,
      footer,
    ].filter(Boolean) as HTMLElement[]));
    foot();
  }

  const footer = h("div.rb-foot");
  function foot() {
    const ok = draft.criteria.length > 0 && draft.criteria.some((c) => c.weight > 0);
    footer.replaceChildren(
      h("button.btn.btn-primary", { type: "button", disabled: !ok || same(), onclick: () => { const r = clone(draft); opts.onUse(r); current = r; foot(); } }, same() ? "✓ in use" : "$ use this rubric"),
      h("button.btn.btn-ghost", { type: "button", onclick: async () => { draft = clone(await defaultRubric()); touched = false; status = { text: "", kind: "" }; render(); } }, "reset to default"),
      h("span.rb-foot-note", null, ok ? "Students see this on their lobby card as “how you'll be judged”." : "Add at least one criterion with weight > 0."),
    );
  }

  function criterionRow(c: RubricCriterion, pct: number, i: number): HTMLElement {
    const info = SIGNALS[c.signal];
    const changed = () => { touched = true; render(); };
    const unit = info.unit;
    const shownTarget = c.target === undefined ? "" : unit === "%" ? String(Math.round((c.target <= 1 ? c.target * 100 : c.target) * 10) / 10) : String(c.target);
    return h(
      "div.rb-row",
      null,
      h("div.rb-row-top", null,
        h("input.rb-name", { value: c.name, "aria-label": "criterion name", oninput: (e: Event) => { c.name = (e.target as HTMLInputElement).value; touched = true; foot(); } }),
        h("span.rb-pct", null, `${pct}%`),
        h("button.rb-del", { type: "button", title: "remove", onclick: () => { draft.criteria.splice(i, 1); changed(); } }, "×")),
      h("div.rb-row-mid", null,
        h("input.rb-weight", { type: "range", min: 0, max: 100, step: 5, value: Math.round(c.weight), "aria-label": `weight of ${c.name}`, onchange: (e: Event) => { c.weight = Number((e.target as HTMLInputElement).value); changed(); } }),
        (() => {
          const sel = h("select.rb-signal", { "aria-label": "what is measured", onchange: (e: Event) => { c.signal = (e.target as HTMLSelectElement).value as RubricSignal; if (c.signal !== "check") delete c.check; changed(); } },
            ...SIGNAL_ORDER.map((s) => h("option", { value: s, selected: s === c.signal }, SIGNALS[s].label))) as HTMLSelectElement;
          return sel;
        })(),
        c.check
          ? h("span.rb-check", null, targetText(c))
          : unit
            ? h("label.rb-target", null, "target ",
                h("input", { type: "number", min: 0, step: unit === "%" ? 1 : 1, value: shownTarget, placeholder: "—", onchange: (e: Event) => {
                  const v = (e.target as HTMLInputElement).value;
                  if (v === "") delete c.target;
                  else c.target = unit === "%" ? Number(v) / 100 : Number(v);
                  changed();
                } }),
                unit === "%" ? "%" : ` ${unit}`)
            : null),
      h("div.rb-desc", null, h("span.dim", null, `measures ${info.what}. `), c.description ? h("span", null, ...richText(c.description)) : null),
    );
  }

  render();
  return {
    el,
    setCurrent(r) {
      current = r ?? null;
      if (current && !touched) draft = clone(current);
      render();
    },
    draft: () => clone(draft),
    dispose: () => el.remove(),
  };
}

// ---------- student: how you'll be judged ----------

export function createJudgedCard(opts: { rubric: Rubric; quality?: QualityStat[]; preview?: CriterionResult[] | null; compact?: boolean }): HTMLElement {
  const { rubric } = opts;
  const pct = weightPercents(rubric.criteria);
  const est = opts.preview?.length
    ? rubric.criteria.map((c) => {
        const r = opts.preview!.find((x) => x.criterionId === c.id);
        return { criterionId: c.id, score: r ? r.score : null, evidence: r?.evidence ?? "measured after the fight" };
      })
    : estimateFromQuality(rubric, opts.quality);
  const total = weightedScore(rubric, est);
  const exact = !!opts.preview?.length;
  return h(
    `div.rb-judged${opts.compact ? ".compact" : ""}`,
    null,
    h("div.rb-judged-head", null,
      h("div", null, h("div.rb-kicker", null, "HOW YOU'LL BE JUDGED"), h("div.rb-judged-title", null, rubric.title)),
      total !== null ? h("div.rb-judged-score", { style: `--c:${scoreColor(total)}`, title: exact ? "your score right now" : "estimate from your report card" }, String(total), h("small", null, exact ? "/100 now" : "/100 est.")) : null),
    h("div.rb-judged-rows", null, ...rubric.criteria.map((c, i) => {
      const e = est.find((x) => x.criterionId === c.id)!;
      const sc = e.score === null ? null : Math.round(e.score * 100);
      return h("div.rb-jrow", { style: `--c:${sc === null ? "#3a4d48" : scoreColor(sc)};--p:${sc ?? 0}%` },
        h("div.rb-jtop", null, h("span.rb-jname", null, c.name), h("span.rb-jw", null, `${pct[i]}%`), h("span.rb-jsc", null, sc === null ? "–" : String(sc))),
        h("div.rb-jbar"),
        opts.compact ? null : h("div.rb-jev", null, ...richText(e.evidence), targetText(c) ? h("span.dim", null, ` · ${targetText(c)}`) : null));
    })),
    h("p.rb-judged-note", null, exact
      ? "This is your score right now. Push a fix to GitHub and summon your repo again to update it before the fight."
      : "An estimate from your report card. The real score comes after the fight. Push a fix and summon your repo again to raise it."),
  );
}
