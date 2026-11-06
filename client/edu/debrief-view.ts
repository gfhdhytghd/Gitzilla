// Teacher debrief card for the classroom (round: feedback phase; lesson: complete phase), from take-edu's model in
// debrief.ts. Every model sentence is its own text node so the page translator can match its DEBRIEF_TEXT template.
// Modes: teacher (everything; names only when allowed) and projector (headline + check bars, never names).
// The lesson grade book (names, per-step scores) is teacher-only and follows the names rule: nothing while projecting.
import { h } from "../app/util.ts";
import { locale, t } from "../i18n/index.ts";
import type { Debrief, LessonDebrief } from "./debrief.ts";
import { richText } from "./task-card.ts";
import { md } from "./markdown.ts";
import "./debrief-view.css";

export interface DebriefView {
  kind: "round" | "lesson";
  debrief: Debrief | LessonDebrief;
  mode: "teacher" | "projector";
  title: string;                  // "Step 1 · Say hello" (round) or the lesson title
  namesVisible: boolean;          // teacher: false while projecting (need-help and shout-out names stay hidden)
  onShowNames?(): void;
  onPick?(id: string): void;      // open that student's review
  actions?: { label: string; testid: string; primary?: boolean; run(): void }[];
}
export interface DebriefCard { el: HTMLElement; update(v: DebriefView): void }

const pct = (passed: number, total: number) => (total ? Math.round((passed / total) * 100) : 0);
/** A model sentence: translated as a whole (its DEBRIEF_TEXT template is in the catalog), then `code` styled. The page
 *  translator must not touch the pieces afterwards, hence translate="no". */
const sentence = (s: string) => h("span", { translate: "no" }, ...richText(t(s)));
const isLesson = (d: Debrief | LessonDebrief): d is LessonDebrief => Array.isArray((d as LessonDebrief).steps);
const score = (n: number) => String(Math.round(n));
const UNRECORDED_NOTE = "Unrecorded steps count 0. Launch the class attack before finishing a step to record it.";

export function createDebriefCard(): DebriefCard {
  const el = h("section.db", { "data-testid": "classroom-debrief" });
  let sig = "";
  // weakest first (the model's order); a lesson can have a dozen checks, so the rest fold away (projector: cut)
  function checks(d: Debrief, shown: number, fold: boolean) {
    if (!d.checks.length) return null;
    const row = (c: Debrief["checks"][number], i: number) => h("li", { "data-testid": `classroom-debrief-check-${i}` },
      h("div.db-check-line", null, h("span.db-check-text", { translate: "no" }, ...richText(c.text)), h("b.db-check-count", null, `${c.passed}/${c.total}`)),
      h("div.db-bar", { role: "img", "aria-label": `${c.passed}/${c.total}` }, h("i", { style: `width:${pct(c.passed, c.total)}%` })));
    const rest = d.checks.slice(shown);
    return h("div.db-block.db-checks", null, h("h3", null, "What the class got"),
      h("ul", null, ...d.checks.slice(0, shown).map(row)),
      fold && rest.length ? h("details.db-more", null, h("summary", null, rest.length === 1 ? "1 more check" : `${rest.length} more checks`), h("ul", null, ...rest.map((c, i) => row(c, i + shown)))) : null);
  }
  function bands(d: Debrief) {
    if (!d.scores.bands.some((b) => b.count)) return null;
    return h("p.db-bands", null, ...d.scores.bands.flatMap((b, i) => [i ? " · " : "", h("span", null, b.label), ": ", h("b", null, String(b.count))]));
  }
  function list(title: string, items: string[], testid: string) {
    return items.length ? h(`div.db-block`, { "data-testid": testid }, h("h3", null, title), h("ul.db-list", null, ...items.map((s) => h("li", null, sentence(s))))) : null;
  }
  function people(v: DebriefView) {
    const d = v.debrief;
    if (!d.needHelp.length && !d.shoutouts.length) return null;
    if (!v.namesVisible) {
      return h("div.db-block.db-people", null, h("h3", null, "Students"),
        h("p.db-note", null, "Names are hidden while you project."),
        h("button.btn", { type: "button", "data-testid": "classroom-debrief-names", onclick: () => v.onShowNames?.() }, "Show names"));
    }
    const person = (p: { id: string; name: string; why: string }, kind: string) =>
      h("li", null, h("button.db-person", { type: "button", "data-testid": `classroom-debrief-${kind}-${p.id}`, onclick: () => v.onPick?.(p.id) },
        h("b", { translate: "no" }, p.name), sentence(p.why)));
    return h("div.db-block.db-people", null,
      d.needHelp.length ? h("h3", null, "Need help") : null,
      d.needHelp.length ? h("ul.db-list.db-help", null, ...d.needHelp.map((p) => person(p, "help"))) : null,
      d.shoutouts.length ? h("h3", null, "Shout-outs") : null,
      d.shoutouts.length ? h("ul.db-list.db-shout", null, ...d.shoutouts.map((p) => person(p, "shout"))) : null);
  }
  function steps(d: LessonDebrief) {
    if (!d.steps.length) return null;
    return h("div.db-block.db-steps", null, h("h3", null, "Steps"),
      h("ol", null, ...d.steps.map((s) => h("li", { "data-testid": `classroom-debrief-step-${s.stepId}` },
        h("b", null, s.title),
        h("span.db-step-nums", null, h("span", null, `average ${Math.round(s.avg)}`), " · ", h("span", null, `${s.submitted}/${s.roster} submitted`),
          s.attempts > 1 ? " · " : null, s.attempts > 1 ? h("span", null, `${s.attempts} attempts`) : null),
        s.weakestCheck ? h("span.db-step-weak", null, h("span", null, "Hardest:"), " ", h("span", { translate: "no" }, ...richText(s.weakestCheck.text)), ` ${s.weakestCheck.passed}/${s.weakestCheck.total}`) : null))));
  }
  // the grade book: a wide table that scrolls inside the card; teacher only, and only while names may show
  function grades(v: DebriefView) {
    const d = v.debrief;
    if (!isLesson(d) || v.mode !== "teacher" || !v.namesVisible || !d.grades.students.length) return null;
    const cell = (n: number | null) => h("td", { class: n === null ? "db-grade-none" : undefined }, n === null ? "—" : score(n));
    return h("div.db-block.db-grades", { "data-testid": "classroom-grades" }, h("h3", null, "Grades"),
      h("div.db-table-wrap", null, h("table.db-table", null,
        h("thead", null, h("tr", null, h("th", null, "Student"),
          ...d.grades.steps.map((s) => h("th", null, h("span", { translate: "no" }, s.title), s.recorded ? null : h("small.db-unrecorded", null, "not recorded"))),
          h("th", null, "Total"), h("th", null, "Average"))),
        h("tbody", null, ...d.grades.students.map((s) => h("tr", { "data-testid": `classroom-grade-${s.id}` },
          h("th", { translate: "no" }, s.name), ...s.steps.map((n, i) => s.provisional?.[i] ? h('td', null, `${n === null ? '—' : score(n)} (review pending)`) : cell(n)), h("td", null, `${score(s.total)}/${score(s.max)}${s.provisional?.some(Boolean) ? ' (provisional)' : ''}`), h("td", null, score(s.average))))))),
      d.grades.steps.some((s) => !s.recorded) ? h("p.db-note", null, UNRECORDED_NOTE) : null);
  }
  function render(v: DebriefView) {
    const d = v.debrief, teacher = v.mode === "teacher";
    el.className = `db db-${v.mode} db-${v.kind}`;
    const head = h("div.db-head", null,
      h("p.db-kicker", null, h("span", null, v.kind === "round" ? "Round debrief" : "Lesson debrief"), " · ", h("span", { translate: "no" }, v.title)),
      h("p.db-headline", { "data-testid": "classroom-debrief-headline" }, sentence(d.headline)));
    if (!teacher) return el.replaceChildren(head, checks(d, v.kind === "lesson" ? 4 : 6, false) ?? h("p.db-note", null, sentence(d.next)));
    const book = grades(v);
    el.replaceChildren(head,
      h("div.db-grid", null,
        h("div.db-col", null, isLesson(d) ? steps(d) ?? "" : "", checks(d, 5, true) ?? "", bands(d) ?? ""),
        h("div.db-col", null,
          list("What to reteach", d.reteach, "classroom-debrief-reteach") ?? "",
          h("div.db-block.db-next", null, h("h3", null, "Next"), h("p", { "data-testid": "classroom-debrief-next" }, sentence(d.next)),
            v.actions?.length ? h("div.db-actions", null, ...v.actions.map((a) => h(`button.btn${a.primary ? ".btn-primary" : ""}`, { type: "button", "data-testid": a.testid, onclick: a.run }, a.label))) : null),
          people(v) ?? "")),
      ...(book ? [book] : []));
  }
  return {
    el,
    update(v) {
      const next = JSON.stringify([locale(), v.kind, v.mode, v.title, v.namesVisible, v.debrief, v.actions?.map((a) => a.label)]);
      if (next === sig) return;
      sig = next;
      render(v);
    },
  };
}

/** The debrief as Markdown for the teacher's export (names included: the export is the teacher's private record). */
export function debriefMarkdown(kind: "round" | "lesson", title: string, d: Debrief | LessonDebrief, tr: (s: string) => string = (s) => s): string {
  const out = [`## ${tr(kind === "round" ? "Round debrief" : "Lesson debrief")}: ${md(title)}`, "", `**${md(tr(d.headline))}**`, ""];
  if (isLesson(d) && d.steps.length) {
    out.push(`### ${tr("Steps")}`, "");
    for (const s of d.steps) out.push(`- ${md(s.title)}: ${tr(`average ${Math.round(s.avg)}`)} · ${tr(`${s.submitted}/${s.roster} submitted`)}${s.weakestCheck ? ` · ${tr("Hardest:")} ${md(s.weakestCheck.text)} ${s.weakestCheck.passed}/${s.weakestCheck.total}` : ""}`);
    out.push("");
  }
  if (isLesson(d) && d.grades.students.length) {
    const unrecorded = d.grades.steps.some((s) => !s.recorded);
    out.push(`### ${tr("Grades")}`, "",
      `| ${tr("Student")} | ${d.grades.steps.map((s) => `${md(s.title)}${s.recorded ? "" : ` (${tr("not recorded")})`}`).join(" | ")} | ${tr("Total")} | ${tr("Average")} |`,
      `|${" --- |".repeat(d.grades.steps.length + 3)}`);
    for (const s of d.grades.students) out.push(`| ${md(s.name)} | ${s.steps.map((n, i) => `${n === null ? "—" : score(n)}${s.provisional?.[i] ? ' (review pending)' : ''}`).join(" | ")} | ${score(s.total)}/${score(s.max)}${s.provisional?.some(Boolean) ? ' (provisional)' : ''} | ${score(s.average)} |`);
    out.push("", ...(unrecorded ? [tr(UNRECORDED_NOTE), ""] : []));
  }
  if (d.checks.length) {
    out.push(`### ${tr("What the class got")}`, "");
    for (const c of d.checks) out.push(`- ${md(c.text)}: ${c.passed}/${c.total} (${pct(c.passed, c.total)}%)`);
    out.push("");
  }
  const section = (name: string, items: string[]) => { if (items.length) out.push(`### ${tr(name)}`, "", ...items.map((s) => `- ${md(tr(s))}`), ""); };
  section("What to reteach", d.reteach);
  section("Next", [d.next]);
  const named = (name: string, ps: { name: string; why: string }[]) => { if (ps.length) out.push(`### ${tr(name)}`, "", ...ps.map((p) => `- ${md(p.name)}: ${md(tr(p.why))}`), ""); };
  named("Need help", d.needHelp);
  named("Shout-outs", d.shoutouts);
  return out.join("\n");
}
