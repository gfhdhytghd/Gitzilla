// Classroom student panel for steps with starter files: the in-app editor, an optional ▶ Run console (Pyodide in the
// student's own browser, never graded) and "Submit my code" (ClientMsg classroomSubmitCode). GitHub stays available
// as the alternative in the classroom screen.
import type { ClassroomStep, InAppFile } from "../../shared/classroom.ts";
import { h } from "../app/util.ts";
import { type CodeEditor, createCodeEditor, savedDraft } from "./code-editor.ts";
import { runAvailable, runPython } from "./py-run.ts";

export const draftKey = (room: string, stepId: string) => `kaiju.code.${room}.${stepId}`;

export interface InAppPanel {
  el: HTMLElement;
  /** Show this step's editor (keeps the current one if the step didn't change). */
  setStep(step: ClassroomStep, prevStepId: string | null): void;
  /** Submit availability + label from the classroom state. */
  setSubmit(o: { enabled: boolean; label: string }): void;
  files(): InAppFile[];
  dispose(): void;
}

export function createInAppPanel(opts: { room: string; onSubmit(files: InAppFile[]): void }): InAppPanel {
  let ed: CodeEditor | null = null;
  let stepId = "";
  let language: ClassroomStep["language"];
  let loaded = false;
  const host = h("div.cr-inapp-editor");
  const out = h("pre.cr-console-out", { "data-testid": "classroom-run-output", "aria-live": "polite" });
  const meta = h("small.cr-console-meta");
  const stdin = h("textarea.cr-stdin", { rows: 2, spellcheck: "false", placeholder: "one line per input() call", "aria-label": "input lines" }) as HTMLTextAreaElement;
  const consolePanel = h("div.cr-console", { hidden: true, "data-testid": "classroom-console" },
    h("div.cr-console-head", null, h("span", null, "$ python output"), meta),
    out,
    h("details.cr-stdin-box", null, h("summary", null, "input() lines"), stdin));
  const run = h("button.btn", { type: "button", "data-testid": "classroom-run", title: "Runs only in your browser. It doesn't change your score." }, "▶ Run") as HTMLButtonElement;
  const submit = h("button.btn.btn-primary", { type: "button", "data-testid": "classroom-submit-code" }, "Submit my code") as HTMLButtonElement;
  const reset = h("button.btn.btn-ghost", { type: "button", "data-testid": "classroom-reset-code" }, "reset to starter") as HTMLButtonElement;
  const note = h("p.cr-flow", null, "Write → ▶ Run to try it (only in your browser, never scored) → Submit → read your feedback → improve and submit again.");

  run.onclick = async () => {
    if (!ed) return;
    const entry = ed.entry();
    if (!entry) return;
    consolePanel.hidden = false;
    run.disabled = true;
    out.className = "cr-console-out";
    out.textContent = "";
    meta.textContent = loaded ? `running ${entry}…` : "loading Python… (the first run downloads ~10 MB)";
    try {
      const r = await runPython(ed.files(), entry, { timeoutMs: 5000, stdin: stdin.value });
      loaded = true;
      out.replaceChildren(...(r.stdout ? [h("span", null, r.stdout + (r.stdout.endsWith("\n") ? "" : "\n"))] : []), ...(r.stderr ? [h("span.cr-console-err", null, r.stderr)] : []));
      if (!r.stdout && !r.stderr) out.append(h("span.dim", null, "(no output: add a print() to see something)"));
      meta.textContent = r.timedOut ? "stopped" : `${entry} · ${r.ms} ms`;
    } catch (e) {
      out.replaceChildren(h("span.cr-console-err", null, (e as Error).message));
      meta.textContent = "";
    }
    run.disabled = false;
    run.hidden = !runAvailable();
  };
  submit.onclick = () => { if (ed) opts.onSubmit(ed.files()); };
  reset.onclick = () => {
    if (ed && confirm("Reset to the starter code? Your changes to this step will be lost.")) ed.reset();
  };

  const el = h("div.cr-inapp", { "data-testid": "classroom-inapp" },
    host,
    h("div.cr-inapp-actions", null, run, submit, reset),
    consolePanel,
    note);

  return {
    el,
    setStep(step, prevStepId) {
      if (step.id === stepId && ed) return;
      ed?.dispose();
      stepId = step.id;
      language = step.language ?? (step.starter?.some((f) => /\.py$/i.test(f.path)) ? "python" : undefined);
      ed = createCodeEditor({
        starter: step.starter ?? [],
        language,
        storageKey: draftKey(opts.room, step.id),
        // same lesson file in the next step: continue from the student's previous step instead of the skeleton
        seed: prevStepId ? savedDraft(draftKey(opts.room, prevStepId)) : null,
        label: `code for ${step.title}`,
      });
      host.replaceChildren(ed.el);
      consolePanel.hidden = true;
      // Pyodide (~10 MB) loads on the first ▶ Run only, so a class of phones doesn't download it all at once
      run.hidden = language !== "python" || !runAvailable();
    },
    setSubmit({ enabled, label }) {
      submit.disabled = !enabled;
      if (submit.textContent !== label) submit.textContent = label;
    },
    files: () => ed?.files() ?? [],
    dispose() { ed?.dispose(); el.remove(); },
  };
}
