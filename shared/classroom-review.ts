/** Shared review contract. Scores are derived from verdicts, never a model-provided number. */
export interface ReviewSettings { automaticWeight: number; checklist: string[] }
export interface AIReview {
  status: 'complete' | 'pending';
  items: { id: number; verdict: 'pass' | 'partial' | 'fail' | 'n/a'; reason: string }[];
  summary: string;
  concerns?: string[]; // Teacher only; stripped before sending to a student.
  provider?: string;
  score?: number;
}
export const defaultReviewChecklist: readonly string[] = [
  "Code Readability: Function definitions include correct type annotations when required.",
  "Code Readability: Each function has a clear docstring describing purpose, arguments, and return value or output.",
  "Code Readability: Names are descriptive and follow `snake_case` where required.",
  "Code Readability: Avoid unclear abbreviations and single-letter names outside very small scopes.",
  "Code Readability: Formatting is consistent: 4-space indentation, reasonable line length, blank lines between top-level functions, no trailing whitespace.",
  "Design: Break the problem into smaller subproblems when it improves clarity.",
  "Design: Use helper functions when the rubric or prompt expects decomposition.",
  "Design: Reuse helpers instead of duplicating logic across multiple functions.",
  "Design: When one part of the solution is meant to build on another, the relationship is visible in the code instead of being reimplemented separately.",
  "Design: Helper functions are called correctly and contribute to the final solution as intended.",
  "Design: Keep each function focused on one job.",
  "Design: Use simple, appropriate constant representations for fixed labels or categories.",
  "Design: Multi-step logic is organized into clear stages when that improves readability and makes the design easier to justify.",
  "Design: Avoid unnecessary global state unless the assignment explicitly allows or requires it.",
  "Spec Matching: Required function names match the assignment exactly.",
  "Spec Matching: Required parameter lists and return types match the assignment exactly.",
  "Spec Matching: Output format matches the assignment exactly.",
  "Spec Matching: Small naming details match the prompt exactly, including spelling and capitalization.",
  "Spec Matching: If the prompt restricts built-ins, modules, or methods, the solution follows those restrictions.",
  "Correctness And Edge Cases: Typical cases work correctly.",
  "Correctness And Edge Cases: Boundary cases are considered: empty input, single-item input, smallest/largest relevant values, ties, no-match cases.",
  "Correctness And Edge Cases: Conditions test the intended value, not the function object or wrong index.",
  "Correctness And Edge Cases: Position-sensitive logic checks the intended location or element.",
  "Correctness And Edge Cases: Loops and indexing do not have off-by-one errors.",
  "Correctness And Edge Cases: Functions return the required value on all control paths.",
  "Correctness And Edge Cases: Variable names used inside a function match the actual parameter and local names.",
  "Correctness And Edge Cases: Data-cleaning steps preserve the structure the later logic depends on.",
  "Mutation Vs Return: If a function is supposed to mutate input, it changes the original object in place.",
  "Mutation Vs Return: If a function is supposed to return a new value, it does not silently rely on side effects instead.",
  "Mutation Vs Return: No unnecessary temporary lists or copies are created when the spec forbids them.",
  "Testing: `main()` or the required driver includes enough tests for each required function(3 tests for each functions, healper function not include).",
  "Testing: Tests cover normal cases and edge cases.",
  "Testing: Prefer `assert` when allowed so failures are obvious and repeatable.",
  "Testing: Test examples reflect the exact assignment behavior, not a guessed variant.",
  "Submission Hygiene: File names match the assignment spec exactly.",
  "Submission Hygiene: Header comments, name, collaboration statement, and other required metadata are filled in.",
  "Submission Hygiene: No debug prints or leftover placeholders remain.",
  "Submission Hygiene: No obviously unused variables, dead code, or incomplete TODOs remain.",
  "Submission Hygiene: The file runs from a clean start without manual setup beyond the assignment instructions."
];
export function normalizeReviewSettings(value: ReviewSettings): ReviewSettings {
  if (!value || !Number.isFinite(value.automaticWeight) || value.automaticWeight < 0 || value.automaticWeight > 100
    || !Array.isArray(value.checklist) || !value.checklist.length || value.checklist.length > 60
    || value.checklist.some(s => typeof s !== 'string' || !s.trim() || s.length > 1000)) throw new Error('Review needs a 0–100 automatic weight and 1–60 checklist lines (maximum 1000 characters each).');
  return { automaticWeight: value.automaticWeight, checklist: value.checklist.map(s => s.trim()) };
}
export function reviewScore(items: AIReview['items']): number | undefined {
  const applicable = items.filter(i => i.verdict !== 'n/a');
  return applicable.length ? Math.round(applicable.reduce((n, i) => n + (i.verdict === 'pass' ? 1 : i.verdict === 'partial' ? 0.5 : 0), 0) / applicable.length * 1000) / 10 : undefined;
}
export function blendedScore(automatic: number, review: number | undefined, settings: ReviewSettings): number {
  return review === undefined ? automatic : Math.round((automatic * settings.automaticWeight + review * (100 - settings.automaticWeight)) / 100 * 10) / 10;
}
