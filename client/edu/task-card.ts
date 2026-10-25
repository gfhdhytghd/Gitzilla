// Classroom TASK card from a step's StepBrief (shared/classroom.ts). Phone first, readable type (not the pixel font):
// goal, concept chips, a numbered TODO checklist students tick on their device, "Done when" lines that turn ✓/✗ from
// the real check results after a submission, the expected output, and hints revealed one at a time.
// Modes: student (all of it), preview (teacher's "Preview as a student": same, nothing saved), projector (goal, chips,
// example, large), teacher (goal + chips, the rest folded away under the console controls).
import type { ClassroomReport, ClassroomStep, StepBrief } from "../../shared/classroom.ts";
import { h } from "../app/util.ts";
import { codeSpans, doneWhenStatus, hintKey, todoKey, type DoneStatus } from "./task-brief.ts";
import "./task-card.css";

export type TaskCardMode = "student" | "preview" | "projector" | "teacher";
export interface TaskCardView {
  step: ClassroomStep & { brief: StepBrief };
  mode: TaskCardMode;
  room?: string;                       // where ticks / revealed hints are saved (student mode)
  report?: ClassroomReport | null;     // the student's latest report; only used when it's for this step
}
export interface TaskCard { el: HTMLElement; update(v: TaskCardView): void }

const load = (key: string | null): unknown => {
  if (!key) return null;
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
};
const save = (key: string | null, value: unknown) => {
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: ticks just aren't kept */ }
};

/** Text with `code` spans as <code>. */
export function richText(s: string): Node[] {
  return codeSpans(s).map((p) => (p.code ? h("code", { translate: "no" }, p.text) : document.createTextNode(p.text)));
}

const MARK: Record<DoneStatus, string> = { pass: "✓", fail: "✗", self: "○" };
const SAYS: Record<DoneStatus, string> = { pass: "found in your files", fail: "not found yet", self: "check this yourself" };

export function createTaskCard(): TaskCard {
  const el = h("section.tc", { "data-testid": "classroom-task-card" });
  let sig = "";

  function todoList(v: TaskCardView, tickable: boolean) {
    const key = tickable && v.room ? todoKey(v.room, v.step.id) : null;
    const saved = load(key);
    const ticks: boolean[] = Array.isArray(saved) ? saved.map(Boolean) : [];
    const count = h("small.tc-count");
    const showCount = () => { count.textContent = tickable ? `${ticks.filter(Boolean).length} of ${v.step.brief.todo.length} done` : ""; };
    const items = v.step.brief.todo.map((item, i) => {
      const box = h("input", { type: "checkbox", "data-testid": `classroom-todo-${i}`, disabled: !tickable || undefined }) as HTMLInputElement;
      box.checked = !!ticks[i];
      const li = h(`li${box.checked ? ".tc-ticked" : ""}`, null, h("label", null, box, h("span.tc-num", { "aria-hidden": "true" }, String(i + 1)), h("span.tc-text", null, ...richText(item))));
      box.onchange = () => { ticks[i] = box.checked; li.classList.toggle("tc-ticked", box.checked); save(key, ticks); showCount(); };
      return li;
    });
    showCount();
    return h("div.tc-block", null, h("div.tc-label", null, h("h3", null, "To do"), count), h("ol.tc-todo", null, ...items));
  }

  function doneList(v: TaskCardView) {
    const report = v.report && v.report.stepId === v.step.id ? v.report : null;
    const status = doneWhenStatus(v.step.brief, v.step.checks, report);
    const items = v.step.brief.doneWhen.map((line, i) => {
      const st = status[i];
      return h(`li.tc-${st}`, { "data-testid": `classroom-done-${i}`, "data-status": report ? st : "open" },
        h("span.tc-mark", { "aria-hidden": "true" }, MARK[st]),
        h("span.tc-text", null, ...richText(line), report ? h("small", null, " · ", h("span", null, SAYS[st])) : null));
    });
    const failed = status.filter((s) => s === "fail").length;
    const note = !report ? "Check these yourself before you submit. After you submit, the ones the computer can check turn ✓ or ✗."
      : failed === 1 ? "From your last submission: 1 still missing. Fix it and submit again."
      : failed ? `From your last submission: ${failed} still missing. Fix them and submit again.`
      : "From your last submission. The computer only reads your files; your teacher checks what it prints.";
    return h("div.tc-block.tc-done-block", null, h("div.tc-label", null, h("h3", null, "Done when")),
      h("ul.tc-done", null, ...items), h("p.tc-note", { "data-testid": "classroom-done-note" }, note));
  }

  function example(b: StepBrief) {
    if (!b.example?.output) return null;
    return h("div.tc-block.tc-example", { "data-testid": "classroom-task-example" },
      h("div.tc-label", null, h("h3", null, b.example.title || "Expected output")),
      h("pre.tc-pre", { translate: "no" }, b.example.output));
  }

  function hints(v: TaskCardView, persist: boolean, showAll = false) {
    const all = v.step.brief.hints ?? [];
    if (!all.length) return null;
    const key = persist && v.room ? hintKey(v.room, v.step.id) : null;
    let shown = showAll ? all.length : Math.min(all.length, Number(load(key)) || 0);
    const list = h("ol.tc-hint-list");
    const more = h("button.btn.tc-hint-btn", { type: "button", "data-testid": "classroom-hint" }) as HTMLButtonElement;
    const paint = () => {
      list.replaceChildren(...all.slice(0, shown).map((x) => h("li", null, ...richText(x))));
      more.hidden = shown >= all.length;
      if (!more.hidden) more.textContent = shown ? `Next hint (${shown + 1}/${all.length})` : `💡 Need a hint? (${all.length})`;
    };
    more.onclick = () => { shown++; save(key, shown); paint(); };
    paint();
    return h("div.tc-block.tc-hints", null, list, more);
  }

  function chips(b: StepBrief) {
    return b.concepts?.length ? h("div.tc-chips", { "aria-label": "Concepts" }, ...b.concepts.slice(0, 6).map((c) => h("span.tc-chip", { translate: "no" }, c))) : null;
  }

  function render(v: TaskCardView) {
    const b = v.step.brief;
    const goal = h("p.tc-goal", { "data-testid": "classroom-task-goal" }, ...richText(b.goal));
    el.className = `tc tc-${v.mode}`;
    if (v.mode === "projector") return el.replaceChildren(goal, chips(b) ?? "", example(b) ?? "");
    if (v.mode === "teacher") {
      const fold = h("details.tc-fold", { "data-testid": "classroom-task-fold" }, h("summary", null, ...[`Student task card`, `${b.todo.length} to-dos`, `${b.doneWhen.length} done-when`, ...(b.hints?.length ? [b.hints.length === 1 ? "1 hint" : `${b.hints.length} hints`] : [])]
          .flatMap((part, i) => (i ? [" · ", h("span", null, part)] : [h("span", null, part)]))),
        h("div.tc-cols", null, h("div.tc-main", null, todoList(v, false), doneList({ ...v, report: null })), h("div.tc-side", null, example(b) ?? "", hints(v, false, true) ?? "")));
      return el.replaceChildren(goal, chips(b) ?? "", fold);
    }
    const tickable = true, persist = v.mode === "student";
    el.replaceChildren(goal, chips(b) ?? "",
      h("div.tc-cols", null,
        h("div.tc-main", null, todoList({ ...v, room: persist ? v.room : undefined }, tickable), doneList(v)),
        h("div.tc-side", null, example(b) ?? "", hints(v, persist) ?? "")));
  }

  return {
    el,
    update(v) {
      const r = v.report && v.report.stepId === v.step.id ? v.report : null;
      const next = JSON.stringify([v.mode, v.room, v.step.id, v.step.brief, v.step.checks, r?.checks, r?.submittedAt]);
      if (next === sig) return;
      sig = next;
      render(v);
    },
  };
}
