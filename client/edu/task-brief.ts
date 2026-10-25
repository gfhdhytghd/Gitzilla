// Pure helpers for the classroom TASK card (StepBrief): inline `code` spans, and which "Done when" lines the real
// check results confirm (doneWhen[i] ↔ step.checks[i] ↔ report.checks[i]). No DOM.
import type { ClassroomCheck, ClassroomReport, StepBrief } from "../../shared/classroom.ts";

export type Span = { text: string; code: boolean };
export type DoneStatus = "pass" | "fail" | "self";

/** "Print `name` with `print()`" → text / code spans. An unmatched backtick stays literal text. */
export function codeSpans(s: string): Span[] {
  const out: Span[] = [];
  const re = /`([^`\n]+)`/g;
  let at = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > at) out.push({ text: s.slice(at, m.index), code: false });
    out.push({ text: m[1], code: true });
    at = m.index + m[0].length;
  }
  if (at < s.length) out.push({ text: s.slice(at), code: false });
  return out;
}

/** ✓ / ✗ per "Done when" line. Alignment rule: doneWhen[i] stands for step.checks[i], scored by report.checks[i]
 *  (the server builds report checks in step order). "self" = no check behind that line (the student checks it
 *  themselves) or nothing submitted for this step yet. */
export function doneWhenStatus(brief: Pick<StepBrief, "doneWhen">, checks: ClassroomCheck[], report?: Pick<ClassroomReport, "checks"> | null): DoneStatus[] {
  return brief.doneWhen.map((_, i) => {
    const r = i < checks.length ? report?.checks[i] : undefined;
    return !r ? "self" : r.passed ? "pass" : "fail";
  });
}

/** Ticked TODO items, saved per room + step on this device. */
export const todoKey = (room: string, stepId: string) => `kaiju.todo.${room}.${stepId}`;
export const hintKey = (room: string, stepId: string) => `kaiju.hints.${room}.${stepId}`;

/** A plain "Done when" line for a check the teacher wrote themselves. */
export function doneWhenFor(c: Pick<ClassroomCheck, "kind" | "path" | "text">): string {
  return c.kind === "file" ? `\`${c.path}\` is in your submission`
    : c.kind === "contains" ? `\`${c.path}\` contains \`${c.text ?? ""}\``
    : `The GitHub check \`${c.path}\` passes`;
}

/** Keep doneWhen one row per check, in check order (the server rejects anything else) after the teacher edits the
 *  checks: a check that was already there keeps its written line, a new one gets a plain generated line. */
export function alignDoneWhen(original: { checks: ClassroomCheck[]; doneWhen: string[] }, checks: ClassroomCheck[]): string[] {
  const same = (a: ClassroomCheck, b: ClassroomCheck) => a.kind === b.kind && a.path === b.path && (a.text ?? "") === (b.text ?? "");
  const used = new Set<number>();
  return checks.map((c) => {
    const i = original.checks.findIndex((o, j) => !used.has(j) && same(o, c) && original.doneWhen[j] !== undefined);
    if (i < 0) return doneWhenFor(c);
    used.add(i);
    return original.doneWhen[i];
  });
}
