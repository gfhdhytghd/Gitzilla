// After an edu match: each student's feedback screen (score ring, per-criterion bars with evidence + tips,
// strengths, next steps linking to the real files on GitHub, how they played) and the teacher's class view
// (sortable table, drill-down, CSV/Markdown export, projector summary). Data: ServerMsg feedback (StudentFeedback[]).
import type { Rubric, StudentFeedback } from "../../shared/types.ts";
import { h } from "../app/util.ts";
import type { EduVariant } from "./feed.ts";
import { richText } from "./feed.ts";
import {
  type SortKey, biggestGains, classSummary, feedbackCsv, feedbackMarkdown, githubFileUrl, scoreColor, sortFeedback, weightPercents,
} from "./rubric-data.ts";
import "./edu.css";
import "./rubric.css";
import { fetchFeedbackExport } from "./transport.ts";

/** Segmented pixel ring (20 blocks) with the score in the middle. */
export function scoreRing(score: number, size = 96, label = "/100"): HTMLElement {
  const segs = 20, on = Math.round((Math.max(0, Math.min(100, score)) / 100) * segs), r = 40, c = 2 * Math.PI * r;
  const col = scoreColor(score);
  const svg = `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
    ${Array.from({ length: segs }, (_, i) => `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${i < on ? col : "#1a2a26"}" stroke-width="12"
      stroke-dasharray="${c / segs - 2.2} ${c - c / segs + 2.2}" stroke-dashoffset="${-(i * c) / segs}" transform="rotate(-90 50 50)"/>`).join("")}
  </svg>`;
  return h("div.fb-ring", { style: `--c:${col};--s:${size}px;--digits:${Math.max(2, String(score).length)}`, role: "img", "aria-label": `score ${score} out of 100` }, h("div.fb-ring-svg", { html: svg }), h("div.fb-ring-num", null, String(score), h("small", null, label)));
}

const fileLink = (repo: string, file: string | undefined, text?: string) => {
  if (!file) return null;
  const url = githubFileUrl(repo, file);
  return url ? h("a.fb-file", { href: url, target: "_blank", rel: "noopener" }, text ?? file) : h("code", null, file);
};

/** One student's feedback (their phone after the match, or the teacher's drill-down). */
export function createFeedbackView(f: StudentFeedback, rubric: Rubric, opts: { variant?: EduVariant; you?: boolean } = {}): HTMLElement {
  const pct = weightPercents(rubric.criteria);
  const gains = biggestGains(f, rubric);
  return h(
    `div.fb-view.v-${opts.variant ?? "desktop"}`,
    null,
    h("div.fb-top", null,
      scoreRing(f.rubricScore, opts.variant === "phone" ? 84 : 104),
      h("div.fb-top-text", null,
        h("div.rb-kicker", null, opts.you ? "YOUR FEEDBACK" : "FEEDBACK"),
        h("div.fb-name", null, `@${f.name}`, h("span.fb-repo", null, ` ${f.repo}`)),
        h("p.fb-summary", null, ...richText(f.summary)))),
    f.strengths.length ? h("section.fb-sec.fb-good", null, h("h4", null, "✓ what you did well"), h("ul", null, ...f.strengths.map((s) => h("li", null, ...richText(s))))) : null,
    f.improvements.length
      ? h("section.fb-sec.fb-next", null, h("h4", null, "→ next steps"), h("ol", null, ...f.improvements.map((s) => h("li", null, ...richText(s.text), s.file ? h("span", null, " · ", fileLink(f.repo, s.file, `open ${s.file.split("/").pop()}`)) : null))))
      : null,
    h("section.fb-sec", null, h("h4", null, `rubric: ${rubric.title}`),
      h("div.fb-crit", null, ...rubric.criteria.map((c, i) => {
        const r = f.results.find((x) => x.criterionId === c.id);
        const sc = r ? Math.round(r.score * 100) : null;
        const lost = gains.find((g) => g.c.id === c.id)?.lost ?? 0;
        return h("div.fb-crow", { style: `--c:${sc === null ? "#3a4d48" : scoreColor(sc)};--p:${sc ?? 0}%` },
          h("div.fb-ctop", null, h("span.fb-cname", null, c.name), h("span.fb-cw", null, `weight ${pct[i]}%`), h("span.fb-csc", null, sc === null ? "–" : `${sc}`)),
          h("div.rb-jbar"),
          r ? h("div.fb-cev", null, ...richText(r.evidence)) : null,
          r?.tip ? h("div.fb-ctip", null, "tip: ", ...richText(r.tip), lost >= 5 ? h("span.dim", null, ` (worth up to +${lost} points)`) : null) : null);
      }))),
    h("section.fb-sec.fb-play", null, h("h4", null, "how you played"),
      h("div.fb-stats", null,
        h("div", null, h("b", null, `#${f.match.rank}`), h("small", null, "rank")),
        h("div", null, h("b", null, String(f.match.kos)), h("small", null, "KOs")),
        h("div", null, h("b", null, String(f.match.roundWins)), h("small", null, "rounds won")),
        h("div", null, h("b", null, Math.round(f.match.damage).toLocaleString("en-US")), h("small", null, "damage")),
        f.match.quiz ? h("div", null, h("b", null, f.match.quiz), h("small", null, "quiz")) : null)),
  );
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Teacher / projector: only pass the class list received from the room server.
 * canExport is the caller's current-owner UI permission; the server still authorizes every download.
 * Omission keeps the roomless demo/projector behavior (screen hidden, other layouts visible).
 */
export function createClassFeedback(opts: { items: StudentFeedback[]; rubric: Rubric; variant: EduVariant; room?: string; token?: string; title?: string; canExport?: boolean }): HTMLElement {
  const { rubric, variant } = opts;
  const showExports = opts.canExport ?? (variant !== 'screen');
  const pct = weightPercents(rubric.criteria);
  const sum = classSummary(opts.items, rubric);
  let key: SortKey = "score", desc = true, open: string | null = null;
  const el = h(`div.fb-class.v-${variant}`);
  const title = opts.title ?? `class feedback${opts.room ? ` · ${opts.room}` : ""}`;
  const fileBase = `gitzilla-feedback${opts.room ? `-${opts.room}` : ""}`;
  const exportStatus = h('div.fb-export-status', { role: 'status', 'aria-live': 'polite' });

  const exportBtn = (ext: "csv" | "md") =>
    h("button.btn", {
      type: "button",
      onclick: async (event: Event) => {
        const button = event.currentTarget as HTMLButtonElement;
        button.disabled = true;
        exportStatus.textContent = 'Preparing download…';
        try {
          const text = opts.room ? await fetchFeedbackExport(opts.room, opts.token, ext)
            : ext === 'csv' ? feedbackCsv(opts.items, rubric) : feedbackMarkdown(opts.items, rubric, title);
          download(`${fileBase}.${ext}`, text, ext === "csv" ? "text/csv" : "text/markdown");
          exportStatus.textContent = 'Download ready.';
        } catch (error) {
          exportStatus.textContent = `Export failed: ${(error as Error).message}`;
        } finally {
          button.disabled = false;
        }
      },
    }, ext === "csv" ? "⇩ CSV (spreadsheet)" : "⇩ Markdown (notes)");

  const summary = () =>
    h("section.fb-sec.fb-summary-class", null,
      h("div.fb-class-top", null,
        scoreRing(sum.average, variant === "screen" ? 150 : 104, "avg"),
        h("div.fb-top-text", null,
          h("div.rb-kicker", null, "CLASS RESULTS"),
          h("div.fb-name", null, rubric.title),
          h("p.fb-summary", null, `${sum.students} student${sum.students === 1 ? "" : "s"} · average ${sum.average}/100 · median ${sum.median}`,
            sum.commonGap ? h("span", null, ` · most common gap: `, h("b", null, sum.commonGap.name), ` (${sum.commonGap.count} of ${sum.students} below 60)`) : null))),
      h("div.fb-crit", null, ...sum.perCriterion.map((c, i) => h("div.fb-crow", { style: `--c:${scoreColor(c.average)};--p:${c.average}%` },
        h("div.fb-ctop", null, h("span.fb-cname", null, c.name), h("span.fb-cw", null, `weight ${pct[i]}%`), h("span.fb-csc", null, `${c.average}`)), h("div.rb-jbar")))),
      showExports ? h("div.fb-export", null, exportBtn("csv"), exportBtn("md"), exportStatus) : null);

  const table = () => {
    const sorted = sortFeedback(opts.items, key, desc);
    const th = (k: SortKey, label: string, cls = "") =>
      h(`button.fb-th${cls}${key === k ? ".on" : ""}`, { type: "button", onclick: () => { desc = key === k ? !desc : k !== "name"; key = k; render(); }, title: `sort by ${label}` }, label, key === k ? (desc ? " ▾" : " ▴") : "");
    const cols = `minmax(9em, 1.4fr) 4em repeat(${rubric.criteria.length}, minmax(3.2em, 1fr)) 3.5em`;
    const minWidth = (16.5 + 3.2 * rubric.criteria.length) * 19 + (rubric.criteria.length + 2) * 6 + 8;
    return h("section.fb-sec.fb-table", { style: `--cols:${cols};--table-min:${minWidth}px` },
      h("h4", null, variant === "screen" ? "every student" : "every student · tap a row for details"),
      h('p.fb-scroll-hint', null, 'Swipe the table to see all criterion scores. Tap a heading to sort.'),
      h("div.fb-tr.fb-thead", null, th("name", "student"), th("score", "score", ".num"), ...rubric.criteria.map((c) => th(`c:${c.id}`, c.name, ".num")), th("rank", "rank", ".num")),
      ...sorted.flatMap((f) => {
        const toggle = () => { open = open === f.playerId ? null : f.playerId; render(); };
        const row = h(`div.fb-tr${open === f.playerId ? ".open" : ""}`, { role: "button", tabindex: 0, 'aria-expanded': open === f.playerId, onclick: toggle,
          onkeydown: (event: Event) => { const key = (event as KeyboardEvent).key; if (key === 'Enter' || key === ' ') { event.preventDefault(); toggle(); } } },
          h("span.fb-td.fb-who", null, h("b", null, `@${f.name}`), h("small", null, f.repo.split("/").pop())),
          h("span.fb-td.num", { style: `color:${scoreColor(f.rubricScore)}` }, String(f.rubricScore)),
          ...rubric.criteria.map((c) => {
            const r = f.results.find((x) => x.criterionId === c.id);
            const v = r ? Math.round(r.score * 100) : null;
            return h("span.fb-td.num.fb-cell", { style: v === null ? "" : `--c:${scoreColor(v)};--p:${v}%`, title: r?.evidence ?? "" }, v === null ? "–" : String(v));
          }),
          h("span.fb-td.num", null, `#${f.match.rank}`));
        return open === f.playerId ? [row, h("div.fb-drill", null, createFeedbackView(f, rubric, { variant: variant === "screen" ? "desktop" : variant }))] : [row];
      }));
  };

  function render() {
    el.replaceChildren(h("h3.fb-title", null, h("span.edu-prompt", null, "$ "), title), summary(), table());
  }
  render();
  return el;
}
