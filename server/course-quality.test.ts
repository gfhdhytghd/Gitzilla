import { describe, it, expect, vi } from 'vitest';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { recoverGeneratedCourse, validationDiagnostics } from './course-output';
import { assertCourseConstraints, verifyCourseQuestions, selfContainedError, type QualityDiagnostics } from './course-quality';
import { createCourseGenerator } from './course-generation';

function rawQuestion(answer = 'b', expression = "{'a': x == 4, 'b': x == 5}") {
  return { id: 'race', kind: 'single', prompt: 'Race! What is x?\n```python\nx = 2 + 3\n```', explain: 'Two plus three is five.', options: [{ id: 'a', text: '4' }, { id: 'b', text: '5' }], answer, verification: { code: 'x = 2 + 3', expression } };
}
function rawPlan(question: any = rawQuestion()) {
  const p: any = defaultClassroomPlan(); p.steps = [{ ...p.steps[0], mode: 'questions', questions: [question] }]; return p;
}
async function verify(raw: any) {
  const diagnostics: QualityDiagnostics = { ...validationDiagnostics(), keyVerification: [] }, sources = new Map();
  const plan = recoverGeneratedCourse(raw, 'quiz', diagnostics, sources);
  try { return { plan: await verifyCourseQuestions(plan, sources, diagnostics), diagnostics }; }
  catch (error) { return { error, diagnostics }; }
}
describe('sandbox generation quality', () => {
  it('executes correct computed keys in the existing isolated Python sandbox', async () => {
    const result = await verify(rawPlan());
    expect(result.error).toBeUndefined(); expect(result.diagnostics.keyVerification?.[0]).toMatchObject({ status: 'passed' });
  }, 30000);
  it('verifies numeric option IDs in lexicographic JSON key order', async () => {
    const q = { ...rawQuestion('2', 'x'), options: [{ id: '10', text: '4' }, { id: '2', text: '5' }, { id: '1', text: '6' }] };
    expect((await verify(rawPlan(q))).error).toBeUndefined();
  }, 30000);
  it('compares actual computed values with every literal option using exact Python types', async () => {
    const q = rawQuestion('b', 'x'); expect((await verify(rawPlan(q))).error).toBeUndefined();
    q.answer = 'a'; expect((await verify(rawPlan(q))).error).toBeDefined();
    const f = { ...rawQuestion('b', 'x'), prompt: 'Race! What is x?\n```python\nx = False\n```', options: [{ id: 'a', text: '0' }, { id: 'b', text: 'False' }], verification: { code: 'x = False', expression: 'x' } };
    expect((await verify(rawPlan(f))).error).toBeUndefined();
    const printed = { ...rawQuestion('b', 'x'), prompt: 'Race! What prints?\n```python\nx = 2 + 3\nprint(x)\n```' };
    expect((await verify(rawPlan(printed))).error).toBeUndefined();
  }, 60000);
  it('drops wrong keys, second correct options, and hardcoded predicates with raw evidence', async () => {
    for (const q of [rawQuestion('a'), rawQuestion('b', "{'a': x == 5, 'b': x == 5}"), rawQuestion('b', "{'a': False, 'b': True}")]) {
      const result = await verify(rawPlan(q));
      expect(result.error).toBeDefined(); expect(result.diagnostics.droppedItems[0]).toMatchObject({ raw: q });
      expect(result.diagnostics.keyVerification?.[0].status).toBe('failed');
    }
  }, 60000);
  it('verifies blanks by computing values, not by reading accepted answers', async () => {
    const q = { id: 'blank', kind: 'blank', prompt: 'Race: result {{1}}\n```python\nx = 2 + 3\n```', blanks: [{ accept: ['5'] }], verification: { code: 'x = 2 + 3', expression: '[x]' } };
    expect((await verify(rawPlan(q))).error).toBeUndefined();
    q.blanks[0].accept = ['4']; expect((await verify(rawPlan(q))).error).toBeDefined();
  }, 30000);
  it('uses the classroom lowercasing, ASCII-decimal, precision and whitespace rules for blank verification', async () => {
    for (const [value, spec, passed] of [
      ['straße', { accept: ['STRASSE'] }, false],
      ['١', { accept: ['1'], numeric: { value: 1, tolerance: 0 } }, false],
      ['0.1000000000000000000000000000001', { accept: ['0'], numeric: { value: 0, tolerance: 0.1 } }, false],
      ['\ufeffHELLO\ufeff', { accept: ['hello'] }, true],
    ] as const) {
      const code = 'x = ' + JSON.stringify(value), q = { id: 'blank', kind: 'blank', prompt: 'Result {{1}}\n```python\n' + code + '\n```', blanks: [spec], verification: { code, expression: '[x]' } };
      expect(!(await verify(rawPlan(q))).error).toBe(passed);
    }
  }, 60000);
  it('repairs missing implementation context from that item verification, then verifies the key', async () => {
    const q = { ...rawQuestion('b', 'x'), prompt: 'What is x in this implementation?' };
    const result = await verify(rawPlan(q)); expect(result.error).toBeUndefined();
    expect(result.plan?.steps[0].questions![0].prompt).toContain('```python\nx = 2 + 3\n```');
    expect(result.diagnostics.repairs[0].reason).toContain('implementation explicit');
    expect(result.diagnostics.keyVerification?.[0].status).toBe('passed');
  }, 30000);
  it('accepts explicit null verification only for conceptual items without code claims', async () => {
    const q = { id: 'concept', kind: 'single', prompt: 'Which search requires sorted input?', explain: 'Binary search discards half using sorted order.', options: [{ id: 'a', text: 'Binary search' }, { id: 'b', text: 'Ordinary linear search' }], answer: 'a', verification: null };
    const result = await verify(rawPlan(q)); expect(result.error).toBeUndefined();
    expect(result.diagnostics.keyVerification?.[0].status).toBe('not-required');
    expect(result.plan?.steps[0].questions![0]).not.toHaveProperty('verification');
  });
  it('rejects a trace with null verification despite the field being present', async () => {
    const result = await verify(rawPlan({ ...rawQuestion(), verification: null }));
    expect(result.error).toBeDefined(); expect(result.diagnostics.keyVerification?.[0].status).toBe('missing');
    expect(result.diagnostics.droppedItems[0].reason).toContain('needs verification');
  });
  it('rejects missing verification and code copied from a sibling question', async () => {
    const q: any = rawQuestion(); delete q.verification;
    expect((await verify(rawPlan(q))).diagnostics.keyVerification?.[0].status).toBe('missing');
    q.verification = { code: 'x = 4', expression: "{'a': x == 4, 'b': x == 5}" };
    expect((await verify(rawPlan(q))).diagnostics.droppedItems[0].reason).toContain('exact complete code');
    for (const text of ['What does the modified version return?', '上面的代码返回什么？', 'What does this implementation do?', 'What is the improved function?']) expect(selfContainedError(text)).toBeDefined();
    expect(selfContainedError('Which algorithm requires sorted input?')).toBeUndefined();
  });
  it.each(['___', '{1}', '{{blank}}', '{{answer}}'])('repairs literal blank shape %s and keeps its raw accepted values', marker => {
    const p = rawPlan({ id: 'blank', kind: 'blank', prompt: 'Result ' + marker, blanks: [{ accept: ['5'] }] });
    const d = validationDiagnostics(); expect(recoverGeneratedCourse(p, 'quiz', d).steps[0].questions![0].prompt).toBe('Result {{1}}');
    expect(d.repairs).toHaveLength(1); expect(d.droppedItems).toEqual([]);
  });
  it('enforces exact teacher counts, exercise hints/starter, balanced truth values and stated contains names', () => {
    const p = recoverGeneratedCourse(rawPlan(), 'quiz');
    expect(() => assertCourseConstraints(p, 'quiz', 'Exactly 5 questions.')).toThrow('generated 1');
    expect(() => assertCourseConstraints(p, 'exercise')).toThrow('hints');
    const s = p.steps[0]; Object.assign(s, { mode: 'mixed', rubric: defaultClassroomPlan().steps[0].rubric, checksWeight: 100 }); s.checks = [{ id: 'check', kind: 'contains', path: 'main.py', label: 'Loop', text: 'while a < size_lst1' }];
    expect(() => assertCourseConstraints(p, 'lesson')).toThrow('unstated names a, size_lst1');
    s.instructions += ' Use a and size_lst1.'; expect(() => assertCourseConstraints(p, 'lesson')).not.toThrow(); s.checks = [];
    s.questions = [1, 2].map(n => ({ id: 'tf-' + n, kind: 'single', prompt: 'A statement', options: [{ id: 't', text: 'True' }, { id: 'f', text: 'False' }], answer: 't' }));
    expect(() => assertCourseConstraints(p, 'warmup')).toThrow('balanced');
    s.questions[1] = { ...s.questions[1], answer: 'f' } as any; s.durationSec = 1;
    expect(() => assertCourseConstraints(p, 'warmup')).toThrow('30 seconds');
    s.durationSec = 30; expect(() => assertCourseConstraints(p, 'warmup')).not.toThrow();
  });
  it('sends sandbox/teacher constraints to same-provider repair and reasons before keys in the schema', async () => {
    const requests: any[] = [];
    const fetcher = vi.fn(async (_url: any, init: any) => {
      requests.push(JSON.parse(init.body)); const q = rawQuestion(requests.length === 1 ? 'a' : 'b');
      return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(rawPlan(q)) }] } }] }));
    });
    const result = await createCourseGenerator({ apiKey: 'mock', deepseekApiKey: '', fetch: fetcher })('Addition', 'extreme', 'quiz', 'Exactly 1 question.');
    expect(result.diagnostics?.repairRounds).toBe(1); expect(result.diagnostics?.keyVerification?.map(v => v.status)).toEqual(['failed', 'passed']);
    expect(requests[1].contents[0].parts[0].text).toContain('Python key verification failed');
    const properties = Object.keys(requests[0].generationConfig.responseJsonSchema.properties.steps.items.properties.questions.items.properties);
    expect(properties.indexOf('explain')).toBeLessThan(properties.indexOf('answer'));
  }, 30000);
});

describe('independent review wrong-key regressions', () => {
  const cases = [
    { name: 'binary search mid sequence', code: 'def trace(xs, item):\n    lo, hi, mids = 0, len(xs)-1, []\n    while lo <= hi:\n        mid = (lo+hi)//2\n        mids.append(mid)\n        if xs[mid] == item: break\n        if xs[mid] < item: lo = mid+1\n        else: hi = mid-1\n    return mids', expression: "{'a': trace([1,3,5,7,9,11],4) == [2,1,1], 'b': trace([1,3,5,7,9,11],4) == [2,0,1]}", answer: 'a' },
    { name: 'strict merge source pointer', code: 'def merge(a,b):\n    i=j=0\n    out=[]\n    while i<len(a) and j<len(b):\n        if a[i]<b[j]:\n            out.append((a[i],"left")); i+=1\n        else:\n            out.append((b[j],"right")); j+=1\n    return out', expression: "{'a': merge([2,4,4],[4,5,6])[2][1] == 'right', 'b': merge([2,4,4],[4,5,6])[2][1] == 'left'}", answer: 'a' },
    { name: 'two successful sorted guard inputs', code: 'def search(xs,item):\n    i=0\n    while i<len(xs) and xs[i]<=item:\n        if xs[i]==item: return True\n        i+=1\n    return False', expression: "{'a': search([3,5,8],5), 'b': search([5,2,9],5)}", answer: 'a' },
    { name: 'Python tuple lexicographic comparison', code: 'def first(a,b):\n    return a if a < b else b', expression: "{'a': first((2,'a'),(2,'b')) == (2,'b'), 'b': first((2,'a'),(2,'b')) == (2,'a')}", answer: 'a' },
  ];
  it.each(cases)('rejects $name by sandbox execution', async ({ name, code, expression, answer }) => {
    const q = { ...rawQuestion(), prompt: `For these specific calls ${expression}, what are the concrete results? ${name}\n\`\`\`python\n${code}\n\`\`\``, answer, verification: { code, expression } };
    const result = await verify(rawPlan(q));
    expect(result.error).toBeDefined(); expect(result.diagnostics.keyVerification?.[0]).toMatchObject({ status: 'failed' });
    expect(result.diagnostics.droppedItems[0].reason).toContain('Python key verification failed');
  }, 30000);
});

describe('mocked teacher and preset constraint repair', () => {
  const conceptual = { id: 'q', kind: 'single', prompt: 'Which search needs ascending input?', options: [{ id: 'a', text: 'Binary search' }, { id: 'b', text: 'Ordinary linear search' }], explain: 'Binary search discards a half using ascending order.', answer: 'a' };
  const response = (p: any) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(p) } }] }));
  it('repairs the total question count instead of silently publishing fewer questions', async () => {
    const requests: any[] = [];
    const fetcher = vi.fn(async (_url: any, init: any) => {
      requests.push(JSON.parse(init.body)); const p = rawPlan(conceptual);
      p.steps[0].questions = Array.from({ length: requests.length === 1 ? 2 : 5 }, (_, i) => ({ ...conceptual, id: 'q-' + i }));
      return response(p);
    });
    const result = await createCourseGenerator({ apiKey: '', deepseekApiKey: 'mock', fetch: fetcher })('Sortedness and search', 'medium', 'quiz', 'Exactly 5 questions.');
    expect(result.plan.steps[0].questions).toHaveLength(5); expect(result.diagnostics?.repairRounds).toBe(1);
    expect(requests[1].messages[0].content).toContain('generated 2');
  });
  it('repairs missing mandatory exercise hints and starter instead of inventing them locally', async () => {
    const requests: any[] = [];
    const fetcher = vi.fn(async (_url: any, init: any) => {
      requests.push(JSON.parse(init.body)); const p = rawPlan(conceptual); p.steps[0].mode = 'mixed';
      if (requests.length === 2) Object.assign(p.steps[0], { language: 'python', starter: [{ path: 'main.py', content: '# Implement search' }], brief: { goal: 'Practice search.', todo: ['Implement search.'], doneWhen: [], hints: ['Track the remaining interval.'] } });
      return response(p);
    });
    const result = await createCourseGenerator({ apiKey: '', deepseekApiKey: 'mock', fetch: fetcher })('Sortedness and search', 'easy', 'exercise', 'Exactly 1 question.');
    expect(result.diagnostics?.repairRounds).toBe(1); expect(result.plan.steps[0].brief?.hints).toEqual(['Track the remaining interval.']);
    expect(requests[1].messages[0].content).toContain('exercise requires');
  });
});
