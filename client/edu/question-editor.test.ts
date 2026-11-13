import { beforeEach, describe, expect, it } from 'vitest';
import type { ClassroomStep } from '../../shared/classroom';
import { installTestDom, type TestNode } from './test-dom';
import { createQuestionEditor } from './question-editor';

beforeEach(() => { installTestDom(); });
const step = (): ClassroomStep => ({ id: 's1', title: 'Quiz', instructions: '', durationSec: 0, rubric: { title: 'r', criteria: [] } as unknown as ClassroomStep['rubric'], checks: [], checksWeight: 0,
  mode: 'questions', answerFeedback: 'immediate', questions: [{ id: 'q1', kind: 'single', prompt: 'Pick', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answer: 'a' }] });

describe('question editor', () => {
  it("switches instant feedback off when answers stay private ('never')", () => {
    const st = step();
    const ed = createQuestionEditor(st, 0, { onMode() {}, onChange() {} });
    const root = ed.el as unknown as TestNode;
    const get = (id: string) => root.querySelector(`[data-testid="${id}"]`)!;
    const feedback = get('step-feedback-0'), reveal = get('step-reveal-0');
    const immediate = feedback.options.find(o => o.getAttribute('value') === 'immediate')! as unknown as { disabled: boolean };
    expect(immediate.disabled).toBeFalsy();
    expect(get('step-feedback-note-0').hidden).toBe(true);
    reveal.value = 'never'; reveal.dispatchEvent(new Event('change'));
    expect(st.revealAnswers).toBe('never');
    expect(st.answerFeedback).toBeUndefined();
    expect(feedback.value).toBe('after-close');
    expect(immediate.disabled).toBe(true);
    expect(get('step-feedback-note-0').hidden).toBe(false);
    expect(ed.validate()).toBe(true);
  });
  it('edits the shared code or reading with a live preview and a length limit', () => {
    const st = step();
    let changes = 0;
    const ed = createQuestionEditor(st, 0, { onMode() {}, onChange() { changes++; } });
    const root = ed.el as unknown as TestNode;
    const get = (id: string) => root.querySelector(`[data-testid="${id}"]`)!;
    expect(get('step-question-context-preview-0').hidden).toBe(true);
    const box = get('step-question-context-0');
    box.value = 'The code:\n```python\nx = 1\n```'; box.dispatchEvent(new Event('input'));
    expect(st.questionContext).toBe(box.value);
    expect(changes).toBeGreaterThan(0);
    expect(get('step-question-context-preview-0').hidden).toBe(false);
    expect(get('step-question-context-count-0').textContent).toBe(`${box.value.length} / 4000`);
    st.questionContext = 'x'.repeat(4001);
    expect(ed.validate()).toBe(false);
    box.value = '  '; box.dispatchEvent(new Event('input'));
    expect(st.questionContext).toBeUndefined();
  });
  it('normalizes a stored immediate + never step when the editor opens', () => {
    const st = { ...step(), revealAnswers: 'never' as const };
    createQuestionEditor(st, 0, { onMode() {}, onChange() {} });
    expect(st.answerFeedback).toBeUndefined();
  });
});
