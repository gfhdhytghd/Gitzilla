import type { ClassroomPlan, ClassroomQuestion } from '../shared/classroom';
import { runDoctests } from './py-sandbox';
import { CourseValidationError, reconcileQuestionInstructions, type CourseValidationDiagnostics } from './course-output';
import type { CoursePreset } from './course-presets';
import { asksConcreteExecution, fencedPython, questionContentError, unsupportedSortingError, stepQuestionSeconds, exactFixHint, missingLineAnswer } from './course-question-policy';

export interface KeyVerification { path: string; status: 'passed' | 'failed' | 'missing' | 'not-required'; detail: string; provider?: string; attempt?: number }
export interface QualityDiagnostics extends CourseValidationDiagnostics { keyVerification?: KeyVerification[] }
export const questionSourceKey = (stepId: string, questionId: string) => stepId + ':' + questionId;
export const pythonBlocks = fencedPython;

export function selfContainedError(prompt: string, context = ''): string | undefined {
  const code = [...pythonBlocks(context), ...pythonBlocks(prompt)];
  if (/\b(?:question|page)\s*#?\s*\d+\b|第\s*\d+\s*(?:题|页)/i.test(prompt)) return 'Question must be self-contained without source question/page references';
  if (!code.length && (asksConcreteExecution(prompt, context) || /\b(?:modified|improved|above|preceding|as discussed|from this module|this implementation)\b|上面|上述|修改后|改进后/i.test(prompt))) return 'Code-dependent question needs complete Python code in its prompt or questionContext; no unseen implementation references';
  if (code.some(c => /\.\.\./.test(c))) return 'Question code must be complete, without elided ... implementations';
}
export function exactQuestionCount(prompt: string): number | undefined {
  const matches = [...prompt.matchAll(/\b(?:exactly|precisely)\s+(\d+)\s+questions?\b|(?:恰好|正好|总共|只出)\s*(\d+)\s*(?:道|个)?(?:问题|题)/gi)];
  const counts = [...new Set(matches.map(m => Number(m[1] ?? m[2])))];
  if (counts.length > 1) throw new CourseValidationError(['Teacher instructions contain conflicting exact total question counts']);
  return counts[0];
}
/** Generation policy, separate from validation of teacher-authored plans. */
export function assertGeneratedQuestionCounts(plan: ClassroomPlan, preset: CoursePreset, teacherPrompt = ''): void {
  if (exactQuestionCount(teacherPrompt) !== undefined || preset === 'lesson') return;
  const count = plan.steps.reduce((n, s) => n + (s.questions?.length ?? 0), 0), minimum = { quiz: 8, warmup: 6, exam: 10, exercise: 0 }[preset];
  const errors: string[] = [];
  if (minimum && count < minimum) errors.push(`${preset} needs at least ${minimum} questions; generated ${count}. Add ${minimum - count} more questions on untested functions/concepts, using shared questionContext code where useful.`);
  if (preset === 'exercise') plan.steps.forEach((s, i) => { const n = s.questions?.length ?? 0; if (n < 2) errors.push(`steps[${i}]: exercise needs at least 2 questions per step plus code; generated ${n}. Add ${2 - n} more checkpoint questions without exposing the code-task solution.`); });
  if (errors.length) throw new CourseValidationError(errors);
}
function truth(text: string): boolean | undefined {
  const word = text.trim().toLowerCase().replace(/[.!。！]/g, '');
  return /^(?:true|正确|对|是|真)$/.test(word) ? true : /^(?:false|错误|错|否|假)$/.test(word) ? false : undefined;
}
export function trueFalseCounts(plan: ClassroomPlan): { true: number; false: number } {
  const counts = { true: 0, false: 0 };
  for (const s of plan.steps) for (const q of s.questions ?? []) if (q.kind === 'single' && q.options.length === 2) {
    const values = q.options.map(o => truth(o.text));
    if (values.includes(true) && values.includes(false)) counts[truth(q.options.find(o => o.id === q.answer)!.text) ? 'true' : 'false']++;
  }
  return counts;
}
const pythonWords = new Set('and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield len range list str int float bool print sorted enumerate zip min max sum all any set dict tuple'.split(' '));
export function courseConstraintErrors(plan: ClassroomPlan, preset: CoursePreset, teacherPrompt = ''): string[] {
  const errors: string[] = [], wanted = exactQuestionCount(teacherPrompt), count = plan.steps.reduce((n, s) => n + (s.questions?.length ?? 0), 0);
  if (wanted !== undefined && count !== wanted) errors.push(`Teacher requested exactly ${wanted} questions TOTAL across all steps, not ${wanted} steps; generated ${count}`);
  for (const [i, s] of plan.steps.entries()) {
    if (preset === 'lesson' && s.mode === 'questions') errors.push(`steps[${i}]: lesson requires a code task on every step (mode code or mixed), including rubric, checks and checksWeight; questions are optional checkpoints in mixed steps`);
    if (preset === 'exercise' && (!s.brief?.hints?.length || !s.starter?.length || s.language !== 'python')) errors.push(`steps[${i}]: exercise requires a per-step brief with hints, nonempty starter files, and language python`);
    const prose = [s.instructions, s.brief?.goal ?? '', ...(s.brief?.todo ?? []), ...(s.brief?.doneWhen ?? []), ...(s.brief?.hints ?? [])].join('\n');
    for (const [j, c] of s.checks.entries()) if (c.kind === 'contains') {
      const names = [...new Set(c.text?.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [])].filter(name => !pythonWords.has(name));
      const missing = names.filter(name => !new RegExp('\\b' + name + '\\b').test(prose));
      if (missing.length) errors.push(`steps[${i}].checks[${j}]: contains check requires unstated names ${missing.join(', ')}; name them in instructions/brief or use a functional doctest`);
    }
    const minimum = stepQuestionSeconds(s);
    if (s.durationSec < minimum) errors.push(`steps[${i}]: ${preset} needs at least ${minimum} seconds for its question workload`);
  }
  const tf = trueFalseCounts(plan);
  if (tf.true + tf.false >= 2 && Math.abs(tf.true - tf.false) > 1) errors.push(`True/false keys must be balanced (difference at most 1), found true=${tf.true}, false=${tf.false}; regenerate claims, do not flip correct keys`);
  return errors;
}
export function assertCourseConstraints(plan: ClassroomPlan, preset: CoursePreset, teacherPrompt = '') {
  const errors = courseConstraintErrors(plan, preset, teacherPrompt); if (errors.length) throw new CourseValidationError(errors);
}

function verifierModule(q: ClassroomQuestion, verification: { code: string; expression: string }, blocks: string[], contextBlocks: string[] = []): { source: string; expected: string } {
  if (!verification || typeof verification.code !== 'string' || !verification.code.trim() || verification.code.length > 10000 || typeof verification.expression !== 'string' || !verification.expression.trim() || verification.expression.length > 5000) throw new Error('Code question needs verification {code, expression}, with bounded runnable code and a nonempty expression');
  const keys = q.kind === 'single' ? [q.answer] : q.kind === 'multi' ? q.answer : [];
  const ids = q.kind === 'blank' ? [] : q.options.map(o => o.id).sort();
  const expected = q.kind === 'blank' ? '{"valid":true}' : '{' + ids.map(id => JSON.stringify(id) + ':' + JSON.stringify(keys.includes(id))).join(',') + '}';
  const combinedCode = contextBlocks.filter(block => !verification.code.includes(block)).join('\n') + '\n' + verification.code;
  const config = { code: combinedCode, expression: verification.expression, blocks, ids, options: q.kind === 'blank' ? [] : q.options, blanks: q.kind === 'blank' ? q.blanks : null };
  const source = `import ast as _ast, json as _json, re as _re
from decimal import Decimal as _Decimal, getcontext as _decimal_context
_decimal_context().prec = 1000
_cfg = _json.loads(${JSON.stringify(JSON.stringify(config))})
_tree = _ast.parse(_cfg['code'])
_expr = _ast.parse(_cfg['expression'], mode='eval')
_prompt_trees = [_ast.parse(s) for s in _cfg['blocks']]
_dump = lambda n: _ast.dump(n, include_attributes=False)
_verifier_nodes = {_dump(n) for t in (_tree, _expr) for n in _ast.walk(t)}
for _t in _prompt_trees:
    for _node in _t.body:
        if isinstance(_node, _ast.Expr) and isinstance(_node.value, _ast.Call) and isinstance(_node.value.func, _ast.Name) and _node.value.func.id == 'print':
            if not all(_dump(arg) in _verifier_nodes for arg in _node.value.args): raise ValueError('verification must compute the exact quoted print arguments')
        elif _dump(_node.value if isinstance(_node, _ast.Expr) else _node) not in _verifier_nodes:
            raise ValueError('verification must include the exact complete code quoted in this question (formatting may differ)')
_functions = {n.name for t in _prompt_trees for n in _ast.walk(t) if isinstance(n, (_ast.FunctionDef, _ast.AsyncFunctionDef))}
_prompt_names = _functions or {n.id for t in _prompt_trees for n in _ast.walk(t) if isinstance(n, _ast.Name) and isinstance(n.ctx, _ast.Store)}
_deps = {}
for _n in _ast.walk(_tree):
    if isinstance(_n, (_ast.FunctionDef, _ast.AsyncFunctionDef)):
        if _n.name in _deps: raise ValueError('verification redefines a function')
        _deps[_n.name] = {x.id for x in _ast.walk(_n) if isinstance(x, _ast.Name) and isinstance(x.ctx, _ast.Load)}
    elif isinstance(_n, _ast.Assign):
        for _target in _n.targets:
            if isinstance(_target, _ast.Name):
                if _target.id in _functions: raise ValueError('verification overrides quoted function')
                _deps[_target.id] = {x.id for x in _ast.walk(_n.value) if isinstance(x, _ast.Name) and isinstance(x.ctx, _ast.Load)}
def _depends(node):
    pending = [x.id for x in _ast.walk(node) if isinstance(x, _ast.Name) and isinstance(x.ctx, _ast.Load)]
    seen = set()
    while pending:
        name = pending.pop()
        if name in seen: continue
        seen.add(name)
        if name in _prompt_names: return True
        pending.extend(_deps.get(name, ()))
    return False
if _cfg['ids']:
    if isinstance(_expr.body, _ast.Dict):
        if not all(_depends(v) for v in _expr.body.values): raise ValueError('each option predicate must compute from the quoted code, not hard-code the key')
    elif not _depends(_expr): raise ValueError('verification must compute from the quoted code')
else:
    if not _depends(_expr): raise ValueError('blank verification must compute from the quoted code')
_ns = {}
exec(compile(_tree, 'question_verification', 'exec'), _ns)
_value = eval(compile(_expr, 'question_expression', 'eval'), _ns)
if _cfg['ids']:
    if not isinstance(_expr.body, _ast.Dict):
        def _same(a,b):
            if type(a) is not type(b): return False
            if isinstance(a,(list,tuple)): return len(a)==len(b) and all(_same(x,y) for x,y in zip(a,b))
            return a==b
        _actual = _value
        _value = {}
        for _option in _cfg['options']:
            _text = _option['text'].strip().strip('\x60')
            try: _candidate = _ast.literal_eval(_text)
            except (ValueError,SyntaxError): raise ValueError('computed-value verification requires every option text to be a plain Python literal')
            _value[_option['id']] = _same(_actual,_candidate)
    if not isinstance(_value, dict) or sorted(_value) != _cfg['ids'] or any(type(v) is not bool for v in _value.values()): raise ValueError('verification expression must return every option ID mapped to a boolean predicate')
    _course_verification_json = _json.dumps(_value, sort_keys=True, separators=(',', ':'))
else:
    if not isinstance(_value, list) or len(_value) != len(_cfg['blanks']): raise ValueError('blank expression must return one computed value per blank in order')
    def _matches(value, spec):
        text = _re.sub(r'[\\t-\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+', ' ', str(value)).strip(' ')
        if not text or len(text) > 200: return False
        if spec.get('numeric'):
            if not _re.fullmatch(r'[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)', text): return False
            return abs(_Decimal(text) - _Decimal(str(spec['numeric']['value']))) <= _Decimal(str(spec['numeric']['tolerance']))
        return any(text == _re.sub(r'[\\t-\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+', ' ', a).strip(' ') if spec.get('caseSensitive') else text.lower() == _re.sub(r'[\\t-\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+', ' ', a).strip(' ').lower() for a in spec['accept'])
    _course_verification_json = _json.dumps({'valid': all(_matches(v, b) for v, b in zip(_value, _cfg['blanks']))}, separators=(',', ':'))
`;
  return { source, expected };
}

export async function verifyCourseQuestions(plan: ClassroomPlan, sources: Map<string, any>, diagnostics: QualityDiagnostics, run = runDoctests, referenceText?: string): Promise<ClassroomPlan> {
  const files: { path: string; text: string }[] = [], checks: { id: string; path: string; text: string }[] = [];
  const pending: { step: number; question: ClassroomQuestion; path: string; raw: unknown; id: string }[] = [];
  const rejected = new Set<string>(); diagnostics.keyVerification ??= [];
  for (const [si, s] of plan.steps.entries()) for (const [qi, q] of (s.questions ?? []).entries()) {
    const id = questionSourceKey(s.id, q.id), path = `steps[${si}].questions[${qi}]`, raw = sources.get(id), own = pythonBlocks(q.prompt), context = pythonBlocks(s.questionContext ?? ''), concrete = asksConcreteExecution(q.prompt, s.questionContext), blocks = concrete ? [...new Set([...context, ...own])] : [];
    try {
      const contentError = questionContentError(q, referenceText); if (contentError) throw new Error(contentError);
      const error = selfContainedError(q.prompt, s.questionContext); if (error) throw new Error(error);
      if (!concrete) { diagnostics.keyVerification.push({ path, status: 'not-required', detail: 'Conceptual question without a concrete execution-value request' }); continue; }
      if (!blocks.length) throw new Error('Code verification requires its complete Python code in this question prompt or shared context');
      const built = verifierModule(q, raw?.verification, blocks, context), filename = `verify_${pending.length}.py`;
      files.push({ path: filename, text: built.source }); checks.push({ id, path: filename, text: '>>> print(_course_verification_json)\n' + built.expected });
      pending.push({ step: si, question: q, path, raw, id });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Invalid code verification';
      diagnostics.droppedItems.push({ path, reason, raw }); rejected.add(id);
      diagnostics.keyVerification.push({ path, status: concrete ? raw?.verification ? 'failed' : 'missing' : 'not-required', detail: reason });
    }
  }
  const results = await run(files, checks);
  for (const item of pending) {
    const result = results[item.id], passed = result?.passed === true;
    diagnostics.keyVerification.push({ path: item.path, status: passed ? 'passed' : 'failed', detail: result?.detail ?? 'Sandbox verification unavailable' });
    if (!passed) { rejected.add(item.id); diagnostics.droppedItems.push({ path: item.path, reason: 'Python key verification failed: ' + (result?.detail ?? 'no result'), raw: item.raw }); }
  }
  const copy = structuredClone(plan);
  for (const s of copy.steps) if (s.questions) {
    s.questions = s.questions.filter(q => !rejected.has(questionSourceKey(s.id, q.id)));
    if ((s.mode === 'questions' || s.mode === 'mixed') && !s.questions.length) throw new CourseValidationError([`Step ${s.id} has no valid questions after code/key verification`, ...diagnostics.droppedItems.map(d => d.path + ': ' + d.reason)]);
  }
  for (const [i, s] of copy.steps.entries()) {
    const referenceError = unsupportedSortingError([s.title, s.instructions, s.questionContext ?? '', JSON.stringify(s.brief ?? {})].join('\n'), referenceText);
    if (referenceError) throw new CourseValidationError([`steps[${i}]: ${referenceError}`]);
  }
  await rejectCheckpointSolutions(copy, sources, diagnostics, run);
  return reconcileQuestionInstructions(copy, diagnostics);
}


/** Run each alias candidate in a separate module, in one isolated sandbox job.
 * Counts aggregate examples, not check rows (one check may contain many examples). */
async function publicCodeRatios(step: ClassroomPlan['steps'][number], quoted: string, run: typeof runDoctests) {
  const doctests = step.checks.filter(c => c.kind === 'doctest');
  if (doctests.some(c => !c.text?.trim())) throw new CourseValidationError(['Solution-leak checks require explicit doctest examples']);
  const names = [...new Set([...quoted.matchAll(/^def\s+([a-zA-Z_]\w*)\s*\(/gm)].map(m => m[1]))];
  const targets = [...new Set(doctests.flatMap(c => [...(c.text ?? '').matchAll(/\b([a-zA-Z_]\w*)\s*\(/g)].map(m => m[1])))].filter(n => !pythonWords.has(n));
  if (names.length > 8 || targets.length > 8) throw new CourseValidationError(['Use at most 8 task/checkpoint functions for bounded solution-leak checks']);
  const candidates = [quoted, ...targets.flatMap(target => names.filter(name => name !== target).map(name => quoted + '\n' + target + ' = ' + name))];
  const taskPaths = new Set(doctests.map(c => c.path));
  const files = (step.starter ?? []).filter(f => !taskPaths.has(f.path)).map(f => ({ path: f.path, text: f.content }));
  const checks: { id: string; path: string; text: string }[] = [];
  const groups: string[][] = [];
  for (const [ci, code] of candidates.entries()) {
    const ids: string[] = [];
    for (const [di, check] of doctests.entries()) {
      const path = '__course_guard_' + ci + '_' + di + '.py', id = 'guard-' + ci + '-' + di;
      if (files.some(f => f.path === path)) throw new CourseValidationError(['Reserved course verification path']);
      files.push({ path, text: code }); checks.push({ id, path, text: check.text! }); ids.push(id);
    }
    groups.push(ids);
  }
  const results = await run(files, checks, { exampleCounts: true });
  return groups.map(ids => {
    let passed = 0, total = 0;
    for (const id of ids) {
      const row = results[id];
      if (!row?.examples) throw new CourseValidationError(['Cannot check checkpoint solution leakage: sandbox unavailable/timed out or no example counts']);
      passed += row.examples.passed; total += row.examples.total;
    }
    return { passed, total };
  });
}

async function rejectCheckpointSolutions(plan: ClassroomPlan, sources: Map<string, any>, diagnostics: QualityDiagnostics, run: typeof runDoctests) {
  for (const [si, step] of plan.steps.entries()) if (step.mode !== 'questions') {
    const doctests = step.checks.filter(c => c.kind === 'doctest');
    const cache = new Map<string, Awaited<ReturnType<typeof publicCodeRatios>>>();
    const ratiosFor = async (code: string) => {
      if (!cache.has(code)) cache.set(code, await publicCodeRatios(step, code, run));
      return cache.get(code)!;
    };
    for (const [hi, hint] of (step.brief?.hints ?? []).entries()) {
      if (doctests.length && pythonBlocks(hint).length) {
        const ratios = await ratiosFor(pythonBlocks(hint).join('\n')), leak = ratios.find(r => r.passed * 2 > r.total);
        if (leak) throw new CourseValidationError([`steps[${si}].brief.hints[${hi}]: hint code passes ${leak.passed}/${leak.total} task doctest examples (MORE THAN HALF)`]);
      }
      if (exactFixHint(hint)) throw new CourseValidationError([`steps[${si}].brief.hints[${hi}]: hint supplies an exact code fix; give a conceptual hint without replacement code`]);
    }
    if (doctests.length && step.starter?.length) {
      const results = await run(step.starter.map(f => ({ path: f.path, text: f.content })), doctests, { exampleCounts: true });
      const rows = doctests.map(c => results[c.id]);
      if (rows.some(r => !r?.examples)) throw new CourseValidationError([`steps[${si}]: cannot check starter; sandbox unavailable/timed out or no example counts`]);
      const passed = rows.reduce((n, r) => n + r.examples!.passed, 0), total = rows.reduce((n, r) => n + r.examples!.total, 0);
      if (passed) throw new CourseValidationError([`steps[${si}]: starter passes ${passed}/${total} doctest examples unchanged; every example must fail before student edits (raise NotImplementedError in unfinished functions)`]);
    }
    const kept: ClassroomQuestion[] = [];
    if (doctests.length && !step.questions?.length && pythonBlocks(step.questionContext ?? '').length) {
      const ratios = await ratiosFor(pythonBlocks(step.questionContext!).join('\n')), leak = ratios.find(r => r.passed * 2 > r.total);
      if (leak) throw new CourseValidationError([`steps[${si}].questionContext: context passes ${leak.passed}/${leak.total} task doctest examples (MORE THAN HALF)`]);
    }
    for (const [qi, q] of (step.questions ?? []).entries()) {
      let reason: string | undefined;
      if (step.answerFeedback === 'immediate' && missingLineAnswer(q)) reason = 'Immediate-feedback answer supplies a missing code-task line; use a conceptual checkpoint or a different task';
      const quoted = [...new Set([...pythonBlocks(step.questionContext ?? ''), ...pythonBlocks(q.prompt)])].join('\n');
      if (!reason && doctests.length && quoted) {
        try {
          const ratios = await ratiosFor(quoted), leak = ratios.find(r => r.passed * 2 > r.total);
          if (leak) reason = `Checkpoint quoted/shared code passes ${leak.passed}/${leak.total} code-task doctest examples (MORE THAN HALF) and reveals its solution`;
        } catch (error) { reason = error instanceof Error ? error.message : 'Cannot check checkpoint solution leakage'; }
      }
      if (reason) diagnostics.droppedItems.push({ path: `steps[${si}].questions[${qi}]`, reason, raw: sources.get(questionSourceKey(step.id, q.id)) });
      else kept.push(q);
    }
    if (step.questions) step.questions = kept;
    if (step.mode === 'mixed' && !kept.length) throw new CourseValidationError([`Step ${step.id} has no questions after checkpoint solution-leak checks`, ...diagnostics.droppedItems.map(d => d.reason)]);
  }
}
