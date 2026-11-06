import type { ClassroomState } from './classroom';

export interface StudentGrade { id: string; name: string; steps: (number | null)[]; total: number; max: number; average: number; provisional?: boolean[] }
export interface LessonGrades { steps: { stepId: string; title: string; recorded: boolean }[]; students: StudentGrade[] }
export function lessonGrades(state: ClassroomState): LessonGrades {
  const steps = state.plan.steps.map(s => ({ stepId: s.id, title: s.title, recorded: state.rounds.some(r => r.stepId === s.id) }));
  const students = new Map<string, StudentGrade>();
  const student = (id: string, name: string) => {
    if (!students.has(id)) students.set(id, { id, name, steps: steps.map(() => null), total: 0, max: 100 * steps.length, average: 0, ...(state.plan.grading ? { provisional: steps.map(() => false) } : {}) });
    const s = students.get(id)!; s.name = name; return s;
  };
  for (const r of [...state.rounds].sort((a, b) => a.at - b.at)) for (const a of r.attacks) {
    const s = student(a.id, a.name), i = steps.findIndex(s => s.stepId === r.stepId);
    if (i >= 0) { s.steps[i] = a.score; if (s.provisional) s.provisional[i] = a.reviewPending === true; }
  }
  for (const row of state.rows) student(row.id, row.name);
  for (const s of students.values()) {
    s.total = Math.round(s.steps.reduce<number>((sum, n) => sum + (n ?? 0), 0) * 10) / 10;
    s.average = steps.length ? Math.round(s.total / steps.length * 10) / 10 : 0;
  }
  return { steps, students: [...students.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}
