import { describe, expect, it } from 'vitest';
import type { ClassroomQuestion, ClassroomStep } from '../../shared/classroom';
import { answerText, blankCount, convertQuestion, isAnswered, keyFor, markers, newQuestion, promptParts, sameAnswer, validateQuestions, verdict } from './questions';

const step = (questions: ClassroomQuestion[], extra: Partial<ClassroomStep> = {}): ClassroomStep => ({
  id: 's1', title: 'Quiz', instructions: '', durationSec: 0, rubric: { title: 'r', criteria: [] } as unknown as ClassroomStep['rubric'], checks: [], checksWeight: 0,
  mode: 'questions', questions, ...extra,
});
const single: ClassroomQuestion = { id: 'q1', kind: 'single', prompt: 'Pick', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answer: 'b' };
const multi: ClassroomQuestion = { id: 'q2', kind: 'multi', prompt: 'All', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], answer: ['a', 'c'] };
const blank: ClassroomQuestion = { id: 'q3', kind: 'blank', prompt: 'x = {{1}} and y = {{2}}', blanks: [{ accept: ['1'] }, { accept: ['two', '2'], numeric: { value: 2, tolerance: 0 } }] };

describe('question helpers', () => {
  it('accepts a valid mixed set and code steps', () => {
    expect(validateQuestions(step([single, multi, blank]))).toEqual([]);
    expect(validateQuestions(step([], { mode: 'code' }))).toEqual([]);
  });
  it('mirrors the server limits', () => {
    expect(validateQuestions(step([]))).toContain('Add at least one question.');
    expect(validateQuestions(step(Array.from({ length: 31 }, (_, i) => ({ ...single, id: `q${i}` }))))).toContain('Use at most 30 questions per step.');
    expect(validateQuestions(step([single, { ...single }])).join(' ')).toMatch(/repeats/);
    expect(validateQuestions(step([{ ...single, id: 'Bad Id' }])).join(' ')).toMatch(/id must use/);
    expect(validateQuestions(step([{ ...single, answer: 'zz' }])).join(' ')).toMatch(/mark the correct option/);
    expect(validateQuestions(step([{ ...multi, answer: [] }])).join(' ')).toMatch(/at least one correct/);
    expect(validateQuestions(step([{ ...single, options: [single.options[0]] }])).join(' ')).toMatch(/2 to 8 options/);
    expect(validateQuestions(step([{ ...single, points: 1.5 }])).join(' ')).toMatch(/whole number/);
    expect(validateQuestions(step([{ ...single, points: 101 }])).join(' ')).toMatch(/points/);
    expect(validateQuestions(step([{ ...single, maxAttempts: 11 }])).join(' ')).toMatch(/attempts/);
    expect(validateQuestions(step([{ ...single, prompt: 'x'.repeat(2001) }])).join(' ')).toMatch(/2000/);
    expect(validateQuestions(step([{ ...blank, prompt: 'only {{1}}' }])).join(' ')).toMatch(/\{\{1\}\}, \{\{2\}\}/);
    expect(validateQuestions(step([{ ...blank, prompt: '{{2}} then {{1}}' }])).join(' ')).toMatch(/in order/);
    expect(validateQuestions(step([{ ...blank, blanks: [{ accept: [''] }, blank.blanks[1]] }])).join(' ')).toMatch(/accepted answer/);
    expect(validateQuestions(step([single], { mode: 'mixed', questionsWeight: 120 })).join(' ')).toMatch(/weight/);
    expect(validateQuestions(step([single], { answerFeedback: 'immediate', revealAnswers: 'never' })).join(' ')).toMatch(/private/);
    expect(validateQuestions(step([single], { questionContext: 'x'.repeat(4000) }))).toEqual([]);
    expect(validateQuestions(step([single], { questionContext: 'x'.repeat(4001) })).join(' ')).toMatch(/4000/);
  });
  it('parses prompts into text, code and blanks', () => {
    expect(markers('a {{1}} b {{2}}')).toEqual([1, 2]);
    const parts = promptParts('Fill:\n```python\nx = {{1}}\n```\nthen {{2}}.');
    expect(parts.map(p => p.kind)).toEqual(['text', 'code', 'text', 'blank', 'text']);
    expect(parts[1]).toEqual({ kind: 'code', parts: [{ kind: 'text', text: 'x = ' }, { kind: 'blank', n: 1 }] });
  });
  it('compares answers like the server echo', () => {
    expect(isAnswered({ blanks: [' ', ''] })).toBe(false);
    expect(isAnswered({ choices: [] })).toBe(false);
    expect(sameAnswer({ choices: ['a', 'c'] }, { choices: ['c', 'a'] })).toBe(true);
    expect(sameAnswer({ blanks: [' 1 '] }, { blanks: ['1'] })).toBe(true);
    expect(sameAnswer({ choice: 'a' }, { choice: 'b' })).toBe(false);
    expect(sameAnswer(undefined, { blanks: [''] })).toBe(true);
  });
  it('reads keys from the server result first, then the plan', () => {
    expect(keyFor(single)).toEqual({ choice: 'b' });
    expect(keyFor(blank)).toEqual({ blanks: ['1', 'two'] });
    const redacted = { id: 'q1', kind: 'single' as const, prompt: 'Pick', options: single.kind === 'single' ? single.options : [] };
    expect(keyFor(redacted)).toBeUndefined();
    expect(keyFor(redacted, { answer: { choice: 'a' }, attempts: 1, key: { choice: 'b' } })).toEqual({ choice: 'b' });
    expect(blankCount({ id: 'q', kind: 'blank', prompt: '{{1}}', blankCount: 1 })).toBe(1);
    expect(answerText(multi, { choices: ['a', 'c'] })).toBe('A · C');
  });
  it('keeps settings when converting kinds', () => {
    const m = convertQuestion({ ...single, points: 3 }, 'multi');
    expect(m).toMatchObject({ kind: 'multi', answer: ['b'], points: 3 });
    const b = convertQuestion(single, 'blank');
    expect(b.kind === 'blank' && b.prompt).toBe('Pick {{1}}');
    expect(validateQuestions(step([newQuestion('blank', []), { ...newQuestion('single', ['q1']), prompt: 'Q' }]))).toEqual([]);
  });
  it('derives a verdict only from graded results', () => {
    expect(verdict({ answer: { choice: 'a' }, attempts: 1 })).toBeNull();
    expect(verdict({ answer: { choice: 'a' }, attempts: 1, correct: true, score: 1 })).toBe('correct');
    expect(verdict({ answer: { choices: ['a'] }, attempts: 1, correct: false, score: 0.5 })).toBe('partial');
    expect(verdict({ answer: { choices: ['b'] }, attempts: 1, correct: false, score: 0 })).toBe('wrong');
  });
});
