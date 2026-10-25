import type { ClassroomPlan } from './classroom';
import type { Locale } from './i18n/locale';
import { defaultRubric } from '../rubric/parser';
import { presetText } from './classroom-preset-text';

// No `brief` here: teachers rewrite these steps in the plan editor, and a brief would hide their edited instructions.
export function defaultClassroomPlan(lang: Locale = 'en'): ClassroomPlan {
  const [build, test, improve] = presetText[lang].defaults.map(step => ({
    title: step.title, instructions: `${step.goal}\n\n${step.todo.map((item, i) => `${i + 1}. ${item}`).join('\n')}`,
  }));
  return { title: 'Build. Review. Improve.', bossName: 'THE RELEASE BLOCKER', steps: [
    { id: 'build', ...build, durationSec: 600, rubric: defaultRubric(), checks: [], checksWeight: 70 },
    { id: 'test', ...test, durationSec: 600, rubric: defaultRubric(), checks: [], checksWeight: 70 },
    { id: 'improve', ...improve, durationSec: 600, rubric: defaultRubric(), checks: [], checksWeight: 70 },
  ] };
}
