// Hand-written classroom lesson text, one module per locale (not the generated catalog, so rewording a step never
// falls back to English). Code tokens in backticks stay untranslated in every locale.
export interface StepText {
  title: string;
  summary: string;          // teacher-facing 1–2 sentences; becomes step.instructions (plus the file line)
  goal: string;
  todo: string[];           // 2–6 items, each starts with a verb
  done: string[];           // one per evidence literal, same order; each contains its literal verbatim
  example?: { title?: string; output: string };
  hints: string[];          // 1–3, vaguest first, never the full solution
  concepts: string[];       // 1–4 chips
  comment: string[];        // starter TODO comment lines; must not contain any of the lesson's evidence literals
}
export interface DefaultStepText {  // default (non-preset) lesson: becomes the editable free-text instructions
  title: string;
  goal: string;
  todo: string[];
}
export interface PresetText {
  lessons: Record<string, [StepText, StepText, StepText]>;
  defaults: [DefaultStepText, DefaultStepText, DefaultStepText];
  ui: {
    prerequisite: string;   // lesson 01 prerequisite
    where: string;          // appended to every step summary; {file}
    fileDone: string;       // doneWhen row for the file check; {file}
    recordDone: string;     // doneWhen row for the README check; {file}
    checkFile: string; checkCode: string; checkRecord: string;  // check labels in feedback; {file} / {text}
    run: string;            // starter header line; {file}
    step: string;           // "Step {n}"
    readmeTask: string;     // README heading above the todo list
    cases: string; input: string; expected: string; actual: string; improvement: string;
    teacher: string;        // teacher guide paragraph
  };
}
