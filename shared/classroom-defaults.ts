import type { ClassroomPlan } from './classroom';
import { defaultRubric } from '../rubric/parser';

export function defaultClassroomPlan(): ClassroomPlan {
  return { title: 'Build. Review. Improve.', bossName: 'THE RELEASE BLOCKER', steps: [
    { id: 'build', title: 'Make it work', instructions: 'Implement the feature your teacher assigns. Push your changes to GitHub, then submit your branch here. Read the feedback before the class attacks.', durationSec: 600, rubric: defaultRubric(), checks: [], checksWeight: 70 },
    { id: 'test', title: 'Handle the edges', instructions: 'Add tests for a normal case, an invalid input and a boundary case. Run them locally or in GitHub Actions. Submit the improved version.', durationSec: 600, rubric: defaultRubric(), checks: [], checksWeight: 70 },
    { id: 'improve', title: 'Ship the improvement', instructions: 'Use your previous feedback to improve one part of your code. Explain the new behavior in the README and submit your final commit.', durationSec: 600, rubric: defaultRubric(), checks: [], checksWeight: 70 },
  ] };
}
