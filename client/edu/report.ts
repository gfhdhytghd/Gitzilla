// Report UI: per-student report card (lobby + autopsy), the class report for the edu autopsy (ranking, tips,
// highlights, quiz, glossary), and the architecture report for a boss repo (plain words + "where it needs help").
import type { Autopsy, BossKit, Genesis, QualityStat } from "../../shared/types.ts";
import { h } from "../app/util.ts";
import { ALL_CONCEPTS, type EduConcept, conceptInfo } from "./concepts.ts";
import { plainRow } from "./explain.ts";
import { diagramCanvas, glyphBadge } from "./diagrams.ts";
import type { LessonEngine } from "./engine.ts";
import type { EduVariant } from "./feed.ts";
import { richText } from "./feed.ts";
import { GRADE_COLOR, type Student, classHighlights, gpa, gpaGrade, sortStats, weakest } from "./quality.ts";
import { architectureSummary, helpWanted, repoStats } from "./summary.ts";
import "./edu.css";

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const shortRepo = (r: string) => r.split("/").pop() || r;

// ---------- report card ----------

const LETTERS: QualityStat["grade"][] = ["F", "D", "C", "B", "A"];

/** One plain-language row: grade · word (alias) · what it measures · F-to-A scale, then your number (vs the class),
 *  then what the next grade needs + one concrete tip. Tapping the word opens the concept's animated diagram. */
function reportRow(x: QualityStat, peers: QualityStat[], size: "sm" | "md" | "lg"): HTMLElement {
  const r = plainRow(x, peers);
  const scale = h("span.rc-scale", { "aria-label": `grade ${x.grade} on a scale from F to A` }, ...LETTERS.map((l) => h(`span${l === x.grade ? ".on" : ""}`, null, l)));
  if (size === "sm")
    return h("div.rc-row", { style: `--c:${GRADE_COLOR[x.grade]}`, title: `${r.word}: ${r.what}` }, h("span.rc-grade", null, x.grade), h("div.rc-main", null, h("span.rc-word", null, r.word)));
  const info = conceptInfo(r.concept);
  const explainer = h("div.rc-concept", { hidden: true });
  const word = h(
    "button.rc-word",
    {
      type: "button",
      title: `what is ${r.word}? tap for the animated explanation`,
      onclick: () => {
        if (!explainer.childElementCount) explainer.append(diagramCanvas(r.concept), h("p", null, h("b", { style: `color:${info.color}` }, info.title), " ", ...richText(info.text), " ", ...richText(info.more)));
        explainer.hidden = !explainer.hidden;
      },
    },
    r.word,
  );
  return h(
    "div.rc-row",
    { style: `--c:${GRADE_COLOR[x.grade]}` },
    h("span.rc-grade", null, x.grade),
    h(
      "div.rc-main",
      null,
      h("div.rc-l1", null, word, r.alias ? h("small.rc-alias", null, ` ${r.alias}`) : null, h("span.rc-what", null, r.what), scale),
      h("div.rc-l2", null, ...richText(r.measure), r.effect ? h("b.rc-effect", null, ` → ${r.effect}`) : null),
      r.next || r.tip
        ? h("div.rc-l3", null, r.next ? h("span.rc-nextgrade", null, `next: ${r.next}. `) : null, r.tip ? h("span.rc-tip", null, "try: ", ...richText(r.tip)) : null)
        : null,
      explainer,
    ),
  );
}

export function createReportCard(s: Student, opts: { size?: "sm" | "md" | "lg"; you?: boolean; peers?: Student[] } = {}): HTMLElement {
  const size = opts.size ?? "md";
  const q = s.quality?.length ? sortStats(s.quality) : null;
  const avg = gpa(q ?? undefined);
  const overall = gpaGrade(avg);
  const worst = weakest(q ?? undefined);
  const peerRows = (opts.peers ?? []).flatMap((p) => p.quality ?? []);
  const head = h(
    "div.rc-head",
    null,
    h("div.rc-id", null, h("span.rc-name", null, `@${s.name}`), h("span.rc-repo", null, s.repo)),
    q ? h("div.rc-gpa", { style: `--c:${GRADE_COLOR[overall]}`, title: `average of the ${q.length} grades below: ${avg.toFixed(2)} out of 4` }, overall, h("small", null, `GPA ${avg.toFixed(1)}`)) : null,
  );
  if (!q) return h(`div.edu-rc.size-${size}${opts.you ? ".you" : ""}`, null, head, h("div.rc-pending", null, "$ grading… report card arrives when the repo is analyzed"));
  const fix = worst && worst.grade !== "A" ? plainRow(worst, peerRows) : null;
  return h(
    `div.edu-rc.size-${size}${opts.you ? ".you" : ""}`,
    null,
    head,
    size === "sm" ? null : h("p.rc-how", null, "Each grade comes from your real code. Higher = stronger hero. Tap a word to learn what it means."),
    h("div.rc-rows", null, ...q.map((x) => reportRow(x, peerRows, size))),
    fix?.tip && size !== "sm" ? h("div.rc-next", null, h("span.edu-prompt", null, `$ fix first (${fix.word} ${fix.grade}): `), ...richText(fix.tip)) : null,
  );
}

// ---------- glossary ----------

export function createGlossary(rows: { concept: EduConcept; met: boolean; count: number; fact: string | null }[], opts: { diagrams?: boolean } = {}): HTMLElement {
  return h(
    "div.edu-gloss",
    null,
    ...rows.map((r) => {
      const info = conceptInfo(r.concept);
      return h(
        `details.gl-row${r.met ? ".met" : ""}`,
        { style: `--c:${info.color}` },
        h(
          "summary",
          null,
          h("span.gl-check", null, r.met ? "✓" : "·"),
          glyphBadge(info.glyph, info.color),
          h("span.gl-title", null, info.title),
          r.count > 1 ? h("span.gl-count", null, `×${r.count}`) : null,
        ),
        h(
          "div.gl-body",
          null,
          opts.diagrams !== false ? diagramCanvas(r.concept, "edu-diagram gl-diag") : null,
          h("div", null, h("p", null, ...richText(info.text)), r.fact ? h("p.edu-fact", null, h("span.edu-prompt", null, "$ "), ...richText(r.fact)) : null, h("p.edu-more", null, ...richText(info.more))),
        ),
      );
    }),
  );
}

const section = (title: string, sub: string | null, ...body: (Node | null)[]) =>
  h("section.edu-sec", null, h("h3", null, h("span.edu-prompt", null, "$ "), title), sub ? h("p.edu-sub", null, sub) : null, ...body);

// ---------- class report (edu PvP autopsy) ----------

export const EDU_GLOSSARY: EduConcept[] = ["code-quality", "test-coverage", "modularity", "cohesion", "documentation", "code-size", "tech-debt", "circular-dependency", "coupling", "fan-in", "heart-module", "refactor"];

export function createClassReport(opts: {
  autopsy: Autopsy;
  /** Students with their kits' quality (lobby players); the autopsy ranking's quality wins when present. */
  students?: Student[];
  engine?: LessonEngine | null;
  you: string | null;
  variant: EduVariant;
}): HTMLElement {
  const { autopsy: a, you, variant } = opts;
  const byId = new Map<string, Student>((opts.students ?? []).map((s) => [s.id, s]));
  for (const r of a.ranking ?? []) byId.set(r.id, { id: r.id, name: r.name, repo: r.repo, quality: r.quality?.length ? r.quality : byId.get(r.id)?.quality });
  for (const p of a.players) if (!byId.has(p.id)) byId.set(p.id, { id: p.id, name: p.name, repo: p.repo });
  const students = [...byId.values()];

  const ranking = a.ranking?.length
    ? a.ranking
    : [...a.players].sort((x, y) => y.stats.damage - x.stats.damage).map((p) => ({ id: p.id, name: p.name, repo: p.repo, kos: 0, damage: p.stats.damage, roundWins: 0, quality: byId.get(p.id)?.quality ?? [] }));

  const table = h(
    "div.edu-rank",
    null,
    h("div.rk-row.rk-headrow", null, h("span", null, "#"), h("span", null, "student"), h("span", null, "KOs"), h("span", null, "rounds won"), h("span", null, "damage"), h("span", null, "code grade")),
    ...ranking.map((r, i) => {
      const g = gpaGrade(gpa(byId.get(r.id)?.quality));
      const hasQ = !!byId.get(r.id)?.quality?.length;
      return h(
        `div.rk-row${r.id === you ? ".you" : ""}${i === 0 ? ".first" : ""}`,
        null,
        h("span.rk-pos", null, String(i + 1)),
        h("span.rk-who", null, h("b", null, `@${r.name}`), h("small", null, shortRepo(r.repo))),
        h("span", null, n(r.kos)),
        h("span", null, n(r.roundWins)),
        h("span", null, n(r.damage)),
        h("span.rk-grade", { style: `--c:${hasQ ? GRADE_COLOR[g] : "#6f9b85"}` }, hasQ ? g : "–"),
      );
    }),
  );

  const me = you ? byId.get(you) : undefined;
  const allRows = students.flatMap((s) => s.quality ?? []);
  const tips = students
    .map((s) => ({ s, w: weakest(s.quality) }))
    .filter((x): x is { s: Student; w: QualityStat } => !!x.w)
    .sort((x, y) => (x.s.id === you ? -1 : y.s.id === you ? 1 : 0));
  const hl = classHighlights(students);
  const quizRows = opts.engine ? [...opts.engine.quiz.entries()].sort((x, y) => y[1].right - x[1].right) : [];

  return h(
    `div.edu-report.v-${variant}`,
    null,
    section(
      "class ranking",
      "Better-engineered code makes a stronger hero, but skill still counts: a C-grade repo can still land KOs.",
      table,
    ),
    me ? section("your report card", "Every grade was earned by something real in your repo, and every tip is a change you can make this week.", createReportCard(me, { size: "lg", you: true, peers: students })) : null,
    variant === "screen"
      ? section("report cards", null, h("div.edu-rc-grid", null, ...students.map((s) => createReportCard(s, { size: "sm", you: s.id === you }))))
      : null,
    tips.length
      ? section(
          "biggest improvement tips",
          "The one change that would raise each student's lowest grade.",
          h(
            "div.edu-tips",
            null,
            ...tips.map(({ s, w }) => {
              if (w.grade === "A")
                return h(`div.tip-row${s.id === you ? ".you" : ""}`, { style: `--c:${GRADE_COLOR.A}` }, h("span.tip-who", null, `@${s.name}`), h("span.tip-grade", null, "no fixes needed"), h("span.tip-text", null, "every grade you can change is an A: keep writing tests as the project grows"));
              const r = plainRow(w, allRows);
              return h(
                `div.tip-row${s.id === you ? ".you" : ""}`,
                { style: `--c:${GRADE_COLOR[w.grade]}` },
                h("span.tip-who", null, `@${s.name}`),
                h("span.tip-grade", null, `${r.word} ${w.grade}`),
                h("span.tip-text", null, ...richText(r.tip ?? w.tip), r.next ? h("small", null, ` (${r.next})`) : null),
              );
            }),
          ),
        )
      : null,
    hl.length
      ? section(
          "class highlights",
          null,
          h("div.edu-hl", null, ...hl.map((x) => {
            const r = plainRow(x.q);
            return h("div.hl-row", { style: `--c:${GRADE_COLOR[x.q.grade]}` }, h("span.hl-stat", null, `best ${r.word}`), h("span.hl-val", null, h("b", null, `@${x.who.name} ${x.q.grade}`), " · ", ...richText(r.measure.split(" · ")[0])));
          })),
        )
      : null,
    quizRows.length
      ? section(
          "pop quiz scores",
          opts.engine!.quizzes.map((q) => q.question).join(" · ") || null,
          h("div.edu-quizscores", null, ...quizRows.map(([id, sc]) => h(`div.qs-row${id === you ? ".you" : ""}`, null, h("b", null, `@${byId.get(id)?.name ?? id}`), h("span", null, `${sc.right}/${sc.total}`), h("span.qs-bar", { style: `--p:${sc.total ? sc.right / sc.total : 0}` })))),
        )
      : null,
    (() => {
      // ✓ = came up as a lesson this match, or was graded on the report cards (that's where it was taught)
      const graded = new Set<string>(allRows.length ? ["code-quality", ...sortStats(allRows).map((q) => plainRow(q).concept)] : []);
      const rows = (opts.engine ? opts.engine.glossary(EDU_GLOSSARY) : EDU_GLOSSARY.map((concept) => ({ concept, met: false, count: 0, fact: null })))
        .map((r) => (r.met || !graded.has(r.concept) ? r : { ...r, met: true }))
        .sort((x, y) => Number(y.met) - Number(x.met));
      const anyMet = rows.some((r) => r.met);
      return section("glossary", anyMet ? "✓ = came up in this match or on your report card. Tap any word to see it animated." : "Today's vocabulary. Tap any word to see it animated.", createGlossary(rows));
    })(),
  );
}

// ---------- architecture report (boss repo: plain words + where it needs help) ----------

export function createArchitectureReport(opts: {
  genesis: Genesis;
  kit?: BossKit | null;
  autopsy?: Autopsy | null;
  /** The players' own repos (lobby genesis) for "your repo vs the boss". */
  heroes?: { label: string; genesis: Genesis; you?: boolean }[];
  engine?: LessonEngine | null;
  variant: EduVariant;
}): HTMLElement {
  const g = opts.genesis;
  const lines = architectureSummary(g, opts.kit);
  const boss = opts.autopsy?.boss ?? null;
  const help = boss ? helpWanted(boss) : [];
  const stats = [repoStats(g, shortRepo(g.slug)), ...(opts.heroes ?? []).slice(0, 4).map((x) => ({ ...repoStats(x.genesis, x.label), you: x.you }))];
  const cols: [keyof ReturnType<typeof repoStats>, string][] = [["files", "files"], ["loc", "lines"], ["components", "parts"], ["cycles", "loops"], ["testPct", "tests %"], ["todos", "TODOs"], ["coupling", "coupling %"]];
  const repoUrl = `https://github.com/${g.slug}`;

  return h(
    `div.edu-report.v-${opts.variant}`,
    null,
    section(
      `what you fought: ${g.slug}`,
      "The monster's anatomy, in plain words. Every part came from the real code.",
      h("div.edu-lines", null, ...lines.map((l) => { const info = conceptInfo(l.concept); return h("div.ln-row", { style: `--c:${info.color}` }, glyphBadge(info.glyph, info.color), h("span", null, ...richText(l.text))); })),
    ),
    stats.length > 1
      ? section(
          "your repo vs the boss",
          null,
          h(
            "div.edu-vs",
            { style: `--cols:${stats.length}` },
            h("span.vs-k"),
            ...stats.map((s, i) => h(`span.vs-h${i === 0 ? ".boss" : ""}`, null, s.label)),
            ...cols.flatMap(([k, label]) => [h("span.vs-k", null, label), ...stats.map((s) => h("span.vs-v", null, n(s[k] as number)))]),
          ),
        )
      : null,
    boss
      ? section(
          "where this project needs help",
          boss.busFactor !== undefined
            ? `Bus factor ${boss.busFactor}: ${boss.busFactor === 1 ? "one person writes" : `${boss.busFactor} people write`} most of the commits. Open source runs on volunteers, and you can be one.`
            : "Open source runs on volunteers, and you can be one.",
          help.length
            ? h(
                "div.edu-help",
                null,
                ...help.map((x) =>
                  h(
                    "div.help-row",
                    null,
                    h("div.help-head", null, glyphBadge("BUS", "#ffd23d"), h("code", null, x.component), x.maintainers !== undefined ? h("span.help-m", null, `${x.maintainers} maintainer${x.maintainers === 1 ? "" : "s"}`) : null),
                    x.issues.length
                      ? h("ul", null, ...x.issues.map((i) => h("li", null, h("a", { href: i.url, target: "_blank", rel: "noopener" }, `#${i.number} ${i.title}`))))
                      : h("p.edu-sub", null, "No beginner issues tagged here yet. Reading the code and improving its docs is a great start."),
                  ),
                ),
              )
            : null,
          boss.repoIssues?.length
            ? h("ul.help-more", null, ...boss.repoIssues.slice(0, 5).map((i) => h("li", null, h("a", { href: i.url, target: "_blank", rel: "noopener" }, `#${i.number} ${i.title}`))))
            : null,
          h("p.edu-sub", null, h("a", { href: `${repoUrl}/contribute`, target: "_blank", rel: "noopener" }, `${repoUrl}/contribute`), " lists the project's good first issues."),
        )
      : null,
    opts.engine ? section("glossary", null, createGlossary(opts.engine.glossary(ALL_CONCEPTS.filter((c) => lines.some((l) => l.concept === c))))) : null,
  );
}
