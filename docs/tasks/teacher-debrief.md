# Teacher debrief when a classroom round ends

User request: "give feedback to teacher when education round finish".

When a class attack ends (phase `feedback`) and when the lesson ends (phase `complete`), the teacher's private console
shows a **debrief**: what the class got, who needs help, and what to do next. It's built from data the teacher
already receives, so no student code goes to any AI service.

## Contract (shared/classroom.ts, committed by coordinator)
- `ClassroomRound.roster?` is the number of students present.
- `ClassroomRound.checkStats?` is a list of `{label, passed, total}`, one per step check, in the same order, so index i pairs with `brief.doneWhen[i]`.
- Both are frozen when the attack runs. They are anonymous and safe on the projector.

## Server (codex-net)
- Fill `roster` and `checkStats` when an attack round is created, from the scored reports in that round.
- Rounds saved before this change have neither field; the UI must cope.
- Persisted with the classroom. Add tests.

## Debrief model (take-edu, pure logic: `client/edu/debrief.ts` + tests, no DOM)
`buildRoundDebrief(state, reports, round)` and `buildLessonDebrief(state, reports)` return:
```ts
interface Debrief {
  headline: string;                                  // "18 of 24 submitted · class average 72 · boss −31%"
  participation: { roster: number; submitted: number; missing: string[] };   // names: teacher only
  scores: { avg: number; median: number; bands: { label: string; count: number }[] };    // e.g. 0–49 / 50–79 / 80–100
  checks: { text: string; passed: number; total: number }[];  // doneWhen line if present, else check label; weakest first
  reteach: string[];        // 1–3 concrete suggestions: "Only 7/18 used an f-string: show one example before step 2"
  needHelp: { id: string; name: string; why: string }[];  // no submission / low score / failed same check across attempts
  shoutouts: { id: string; name: string; why: string }[]; // biggest improvement, first full pass
  next: string;             // a recommended action, e.g. "Retry this step (most students are 1 check away)" or "Move on to step 2"
}
```
- Lesson debrief: one row per completed step, from `rounds` (avg score, participation, weakest check), plus overall `reteach` and `next`.
- All text is written for a teacher: short, specific and kind. No grader jargon.
- Translatable: return keys plus params, or plain English strings that the UI passes through `t()` with `{0}` patterns. Pick one and document it.

## UI (claude-edu: client/edu + classroom.ts/css)
- **Teacher console, `feedback` phase:** a "Round debrief" card at the top, above the roster.
  - Shows the headline, check bars (weakest first), reteach and next actions.
  - "Need help" and "Shout-outs" lists. Tapping a name opens that student's review.
  - Buttons: "Retry this step" / "Next step", wired to the existing commands.
- **`complete` phase:** a "Lesson debrief" with one row per step, the overall reteach list, and the next lesson to try (the next preset, if any).
- **Projector:** only the anonymous parts (headline, check bars, shout-outs only if the teacher has scores visible). Never show "need help" names.
- **Export:** add the debrief to the Markdown export.
- Localize en/zh/es/fr. Verify in WebKit at console 1440, console 393 phone and projector 1920, with a real run of 3+ students on :5175.
