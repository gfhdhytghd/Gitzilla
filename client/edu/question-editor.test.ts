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
  describe('blank answer fields follow the question on the same event (QS-E2E-01)', () => {
    const blankEditor = () => {
      const st: ClassroomStep = { ...step(), answerFeedback: undefined, questions: [{ id: 'q1', kind: 'blank', prompt: 'First {{1}}.', blanks: [{ accept: ['a'] }] }] };
      const ed = createQuestionEditor(st, 0, { onMode() {}, onChange() {} });
      const root = ed.el as unknown as TestNode;
      const prompt = root.querySelector('[data-testid="question-prompt-0-0"]')!;
      const fields = () => [0, 1, 2, 3, 4, 5].filter(j => root.querySelector(`[data-testid="blank-accept-0-0-${j}"]`)).length;
      const errors = () => root.querySelector('[data-testid="step-question-errors-0"]')!.textContent;
      return { st, root, prompt, fields, errors };
    };
    it('+ Insert blank adds the second answer field at once', () => {
      const { st, root, fields, errors } = blankEditor();
      expect(fields()).toBe(1);
      root.querySelector('[data-testid="question-insert-blank-0-0"]')!.click();
      expect(st.questions![0].prompt).toBe('First {{1}}.{{2}}');
      expect(fields()).toBe(2);
      expect(errors()).not.toMatch(/in order/);
    });
    it('typing a marker adds its field, deleting it removes the field', () => {
      const { st, prompt, fields, errors } = blankEditor();
      prompt.value = 'First {{1}} then {{2'; prompt.dispatchEvent(new Event('input'));
      expect(fields()).toBe(1);
      prompt.value = 'First {{1}} then {{2}}'; prompt.dispatchEvent(new Event('input'));
      expect(fields()).toBe(2);
      expect(errors()).not.toMatch(/in order/);
      prompt.value = 'First {{1}}.'; prompt.dispatchEvent(new Event('input'));
      expect(fields()).toBe(1);
      expect((st.questions![0] as { blanks: unknown[] }).blanks).toHaveLength(1);
    });
    it('a paste with two new markers adds both fields in one input event', () => {
      const { prompt, fields, errors } = blankEditor();
      prompt.value = '`x` is {{1}}, `y` is {{2}} and `z` is {{3}}.';
      prompt.dispatchEvent(new Event('paste')); prompt.dispatchEvent(Object.assign(new Event('input'), { inputType: 'insertFromPaste' }));
      expect(fields()).toBe(3);
      expect(errors()).not.toMatch(/in order/);
    });
  });
  it('normalizes a stored immediate + never step when the editor opens', () => {
    const st = { ...step(), revealAnswers: 'never' as const };
    createQuestionEditor(st, 0, { onMode() {}, onChange() {} });
    expect(st.answerFeedback).toBeUndefined();
  });
});
