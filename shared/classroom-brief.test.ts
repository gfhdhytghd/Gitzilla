import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { pythonClassroomPlan, pythonClassroomPresets } from './classroom-presets';
import { LOCALES } from './i18n/locale';
import { localizeClassroomPlan } from './classroom-localize';
import { normalizeClassroomPlan, ClassroomSession } from '../server/classroom';

const cases = LOCALES.flatMap(lang => pythonClassroomPresets.flatMap(preset =>
  pythonClassroomPlan(preset.id, lang).steps.map(step => ({ lang, preset, step, label: `${lang}/${step.id}` }))));
const plain = (text: string) => text.replace(/`|\*\*/g, '').replace(/\s+/g, ' ').trim();
const nonempty = (text: string) => expect(typeof text === 'string' && text.trim().length > 0).toBe(true);

describe('localized beginner task briefs', () => {
  it('provides a complete, readable structured brief for all 108 preset steps', () => {
    expect(cases).toHaveLength(108);
    for (const { step, label } of cases) {
      expect(step.brief, label).toBeDefined();
      const brief = step.brief!;
      nonempty(brief.goal);
      expect(brief.todo.length, label).toBeGreaterThanOrEqual(2);
      expect(brief.todo.length, label).toBeLessThanOrEqual(6);
      brief.todo.forEach(nonempty);
      expect(brief.doneWhen.length, label).toBeGreaterThan(0);
      brief.doneWhen.forEach(nonempty);
      expect(brief.hints?.length, label).toBeGreaterThanOrEqual(1);
      expect(brief.hints?.length, label).toBeLessThanOrEqual(3);
      brief.hints!.forEach(nonempty);
      expect(brief.concepts?.length, label).toBeGreaterThanOrEqual(1);
      expect(brief.concepts?.length, label).toBeLessThanOrEqual(4);
      brief.concepts!.forEach(nonempty);
      if (brief.example) nonempty(brief.example.output);
    }
  });

  it('aligns each Done when entry with its actual check in result-display order', () => {
    for (const { step, label } of cases) {
      expect(step.brief!.doneWhen, label).toHaveLength(step.checks.length);
      step.checks.forEach((check, index) => {
        const done = plain(step.brief!.doneWhen[index]);
        const anchor = plain(check.kind === 'contains' ? check.text! : check.path);
        expect(done.includes(plain(check.label)) || done.includes(anchor),
          `${label} check ${index + 1}: ${check.label} / ${anchor} missing from ${done}`).toBe(true);
      });
    }
  });

  it('requires an output example for actual starter print calls and print checks', () => {
    const sources = cases.map(({ step }) => (step.starter ?? []).filter(file => file.path.endsWith('.py')).map(file => file.content).join('\n'));
    // Probes make sure comments/string literals do not accidentally count as a print call.
    const flags = JSON.parse(execFileSync('python3', ['-c',
      'import ast,json,sys\nprint(json.dumps([any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "print" for n in ast.walk(ast.parse(source))) for source in json.load(sys.stdin)]))'],
    { input: JSON.stringify([...sources, '# print("comment only")\nvalue = "print(123)"\n', 'print("real output")\n']), encoding: 'utf8' })) as boolean[];
    expect(flags.slice(-2)).toEqual([false, true]);
    for (const [index, { step, label }] of cases.entries()) {
      const requiresOutput = flags[index] || step.checks.some(check => check.kind === 'contains' && /\bprint\s*\(/.test(check.text ?? ''));
      if (requiresOutput) {
        expect(step.brief!.example, label).toBeDefined();
        nonempty(step.brief!.example!.output);
      }
    }
  });

  it('has real goal translations in every locale while keeping check contracts identical', () => {
    for (const preset of pythonClassroomPresets) {
      const plans = LOCALES.map(lang => pythonClassroomPlan(preset.id, lang));
      for (let index = 0; index < 3; index++) {
        expect(new Set(plans.map(plan => plan.steps[index].brief!.goal)).size, `${preset.id} step ${index + 1}`).toBe(4);
        const checks = (p: typeof plans[number]) => p.steps[index].checks.map(check => [check.kind, check.path, check.text]);
        for (const plan of plans) expect(checks(plan)).toEqual(checks(plans[0]));
      }
    }
  });

  it('keeps brief objects independent and preserves custom edits through localization', () => {
    const plan = pythonClassroomPlan('09-dict', 'zh'), originalGoal = plan.steps[0].brief!.goal;
    plan.steps[0].brief!.goal = 'Teacher custom goal';
    plan.steps[0].brief!.todo[0] = 'Keep this exact custom action';
    const before = JSON.stringify(plan), localized = localizeClassroomPlan(plan, 'fr');
    expect(localized.steps[0].brief!.goal).toBe('Teacher custom goal');
    expect(localized.steps[0].brief!.todo[0]).toBe('Keep this exact custom action');
    expect(localized.steps[1].brief).toEqual(pythonClassroomPlan('09-dict', 'fr').steps[1].brief);
    expect(JSON.stringify(plan)).toBe(before);
    expect(pythonClassroomPlan('09-dict', 'zh').steps[0].brief!.goal).toBe(originalGoal);
  });

  it('retains complete briefs through actual server normalization and save/restore', () => {
    for (const lang of LOCALES) for (const preset of pythonClassroomPresets) {
      const plan = pythonClassroomPlan(preset.id, lang), normalized = normalizeClassroomPlan(plan);
      expect(normalized.steps.map(step => step.brief)).toEqual(plan.steps.map(step => step.brief));
      const restored = ClassroomSession.restore(new ClassroomSession(plan).save());
      expect(restored.state.plan.steps.map(step => step.brief)).toEqual(plan.steps.map(step => step.brief));
    }
  });
});
