// 6 · Classroom, the full teacher flow, from the real classroom components fed with a sample class (labelled as such):
//   beat 1: the student's task card (real StepBrief from the Python preset) + the in-browser editor typing, ▶ Run,
//           Submit, and "Done when" turning ✓ from the check results.
//   beat 2: the projector (no names): submissions counter + the class attack hitting the shared boss.
//   beat 3: the teacher's round debrief (what to reteach, need help, shout-outs) next to the projector's nameless copy.
import { h } from "../../app/util.ts";
import type { ClassroomReport } from "../../../shared/classroom.ts";
import { pythonClassroomPlan } from "../../../shared/classroom-presets.ts";
import { createTaskCard } from "../../edu/task-card.ts";
import { highlight } from "../../edu/code-editor.ts";
import { createDebriefCard } from "../../edu/debrief-view.ts";
import type { Debrief } from "../../edu/debrief.ts";
import type { Scene } from "../core.ts";
import { createClassAttack } from "./classfx.ts";

const TYPED = ['print("Hello, Python!")', 'print("I like drawing robots.")'];

export const classroom: Scene = {
  id: "classroom", title: "Classroom", tracks: ["nittany"], beats: 3,
  mount(el, life, ctx) {
    const step = pythonClassroomPlan("01-hello", "en").steps[0] as ReturnType<typeof pythonClassroomPlan>["steps"][number] & { brief: NonNullable<ReturnType<typeof pythonClassroomPlan>["steps"][number]["brief"]> };
    const starter = step.starter!.find((f) => f.path.endsWith(".py"))!;
    const sample = h("div.sample-tag", null, "sample class · demo data");
    const line = h("div.cls-line");

    // ---------- beat 1: student
    const card = createTaskCard();
    card.update({ step, mode: "preview" });
    const code = h("pre.cls-code"), out = h("pre.cls-out"), runBtn = h("span.cls-btn", null, "▶ Run"), subBtn = h("span.cls-btn.primary", null, "Submit my code");
    const student = h("div.cls-student", null,
      h("div.cls-phone", null, h("div.cls-phone-screen", null, card.el)),
      h("div.cls-editor", null, h("div.cls-tab", null, starter.path, h("span.dim", null, "  · in-browser Python, no install")), code, h("div.cls-bar", null, runBtn, subBtn), out));
    // ---------- beat 2: projector + class attack
    const sub = h("b.cls-count"), subBar = h("i");
    const attack = createClassAttack("pallets/flask", Array.from({ length: 9 }, (_, i) => ({ label: `submission ${i + 1}`, dmg: [19, 17, 13, 20, 7, 18, 16, 14, 18][i] })), life,
      { period: 11, onHit: (i) => { sub.textContent = `${10 + i} of 24 submitted`; subBar.style.width = `${((10 + i) / 24) * 100}%`; if (i % 3 === 0) ctx.shake(0.35); } });
    const projector = h("div.cls-proj", null, h("div.cls-proj-h", null, h("span", null, "Step 1 · Say hello"), sub), h("div.cls-sub-bar", null, subBar), attack.el, h("div.cls-proj-note", null, "projector view · no names, no scores, just damage"));
    // ---------- beat 3: debrief
    const debrief: Debrief = {
      headline: "18 of 24 submitted · class average 81 · boss −42%",
      participation: { roster: 24, submitted: 18, missing: ["s4", "s9", "s15", "s18", "s21", "s23"] },
      scores: { avg: 81, median: 86, bands: [{ label: "Below 50", count: 2 }, { label: "50 to under 80", count: 5 }, { label: "80–100", count: 11 }] },
      checks: step.brief.doneWhen.map((text, i) => ({ text, passed: [18, 14][i] ?? 18, total: 18 })),
      reteach: ["4/18: Line 1 must be exactly `Hello, Python!`. Work through one example together.", "6 students have no submission. Check that they can open the editor and send their work."],
      needHelp: [{ id: "s9", name: "Sam", why: "No submission in this round. Help them send one small change." }, { id: "s12", name: "Ivy", why: "Score 42. Offer a short check-in and one small next step." }],
      shoutouts: [{ id: "s3", name: "Maya", why: "Met every recorded check on the first round." }, { id: "s7", name: "Leo", why: "Improved by 24 points this round." }],
      next: "Move on to step 2: Use variables.",
    };
    const teacher = createDebriefCard(), proj2 = createDebriefCard();
    teacher.update({ kind: "round", debrief, mode: "teacher", title: "Step 1 · Say hello", namesVisible: true });
    proj2.update({ kind: "round", debrief, mode: "projector", title: "Step 1 · Say hello", namesVisible: false });
    const debriefs = h("div.cls-debrief", null,
      h("div.cls-db-col", null, h("div.cls-db-k", null, "teacher's console (private)"), teacher.el),
      h("div.cls-db-col.proj", null, h("div.cls-db-k", null, "projector (no names)"), proj2.el));

    const views = [student, projector, debriefs];
    el.append(h("h2.slide-h", null, "Code quality becomes ", h("em", null, "damage"), ". Teachers see ", h("em.pink", null, "who needs help"), "."), ...views, line, sample);

    let beat = 0, gen = 0;
    async function studentLoop(mine: number) {
      const base = starter.content.trimEnd() + "\n";
      const set = (src: string, caret = true) => { code.innerHTML = highlight(src, "python") + (caret ? '<span class="cursor">█</span>' : ""); };
      while (life.alive && mine === gen) {
        card.update({ step, mode: "preview" });
        out.textContent = "$ python output";
        runBtn.classList.remove("hot"); subBtn.classList.remove("hot");
        let src = base;
        set(src);
        await life.sleep(700);
        for (const l of TYPED) {
          for (const ch of l) { if (mine !== gen) return; src += ch; set(src); await life.sleep(ctx.calm ? 8 : 42); }
          src += "\n"; set(src);
          await life.sleep(200);
        }
        set(src, false);
        runBtn.classList.add("hot");
        await life.sleep(500);
        out.textContent = "$ python python/01_hello.py\nHello, Python!\nI like drawing robots.\n· 41 ms · ran in your browser, never scored";
        await life.sleep(1500);
        subBtn.classList.add("hot");
        const report: ClassroomReport = { stepId: step.id, attempt: 1, repo: "in-app", commit: "inapp:3fa9c21e", submittedAt: Date.now(), source: "in-app",
          score: 100, improvement: 0, checks: step.checks.map((c) => ({ label: c.label, passed: true, detail: "found in your files" })), criteria: [], advice: [] };
        await life.sleep(600);
        card.update({ step, mode: "preview", report });
        ctx.blip();
        await life.sleep(5200);
      }
    }
    const handle = {
      beat(b: number) {
        beat = b; gen++;
        views.forEach((v, i) => v.classList.toggle("off", i !== b));
        line.textContent = ["A real task card and a real Python editor, right in the phone browser.", "Every submission's score hits the shared boss. The projector shows no names.", "The teacher sees what to reteach and who needs help; the projector never does."][b];
        if (b === 0) void studentLoop(gen);
        if (b === 1) attack.restart();
      },
    };
    life.frame((t, dt) => { if (beat === 1) attack.frame(t, dt); });
    handle.beat(0);
    return handle;
  },
};
