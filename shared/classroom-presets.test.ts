import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { pythonClassroomPlan, pythonClassroomPresets, pythonStarter, pythonTeacherGuide } from './classroom-presets';
import { normalizeClassroomPlan, ClassroomSession } from '../server/classroom';
import { archive, splitChunks } from '../analysis/fixtures';
import { extractTarGz } from '../analysis/tar';
import { profileFromFiles } from '../analysis/graph';
import { analyzeFiles } from '../analysis/in-app';
import { LOCALES } from './i18n/locale';
import { localizeClassroomPlan } from './classroom-localize';

describe('Python classroom curriculum', () => {
  it('provides a valid ordered beginner-to-dict sequence with independent editable drafts', () => {
    expect(pythonClassroomPresets).toHaveLength(9);
    expect(pythonClassroomPresets.at(-1)?.id).toBe('09-dict');
    expect(new Set(pythonClassroomPresets.map(p => p.id)).size).toBe(9);
    for (const preset of pythonClassroomPresets) {
      const plan = pythonClassroomPlan(preset.id);
      expect(() => normalizeClassroomPlan(plan)).not.toThrow();
      expect(plan.steps).toHaveLength(3);
      expect(plan.steps.reduce((sum, step) => sum + step.durationSec, 0)).toBe(preset.minutes * 60);
      expect(new Set(plan.steps.map(step => step.id)).size).toBe(3);
      for (const step of plan.steps) {
        expect(step.instructions).toContain(preset.file);
        expect(step.instructions.trim()).not.toBe('');
        expect(step.checks.length).toBeGreaterThan(1);
      }
      expect(pythonTeacherGuide(preset.id)).toContain('正确的等价实现');
      plan.steps[0].instructions = 'edited'; plan.steps[0].rubric.criteria[0].name = 'edited';
      expect(pythonClassroomPlan(preset.id).steps[0].instructions).not.toBe('edited');
      expect(pythonClassroomPlan(preset.id).steps[0].rubric.criteria[0].name).not.toBe('edited');
    }
  });
  it('ships syntactically valid Python 3 starters with their required paths', () => {
    const starters = pythonClassroomPresets.map(p => pythonStarter(p.id));
    for (const [i, starter] of starters.entries()) expect(starter.filename).toBe(pythonClassroomPresets[i].file);
    execFileSync('python3', ['-c', 'import ast,json,sys\nfor item in json.load(sys.stdin): ast.parse(item["content"], filename=item["filename"])'], { input: JSON.stringify(starters) });
  });
  it('provides every step with editable Python and self-check files matching its existing check paths', () => {
    for (const lang of LOCALES) for (const preset of pythonClassroomPresets) {
      const plan = pythonClassroomPlan(preset.id, lang);
      expect(() => normalizeClassroomPlan(plan)).not.toThrow();
      for (const step of plan.steps) {
        expect(step.language).toBe('python');
        expect(step.starter?.map(file => file.path)).toEqual([preset.file, 'README.md']);
        expect(step.starter!.length).toBeLessThanOrEqual(20);
        expect(step.starter!.reduce((bytes, file) => bytes + Buffer.byteLength(file.content, 'utf8'), 0)).toBeLessThan(200 * 1024);
        const paths = new Set(step.starter!.map(file => file.path));
        for (const check of step.checks) expect(paths.has(check.path), `${preset.id}/${step.id}: ${check.path}`).toBe(true);
        const source = step.starter!.find(file => file.path === preset.file)!;
        expect(source.content).toContain('TODO');
        expect(step.checks.some(check => check.kind === 'contains' && !source.content.includes(check.text!)), step.id).toBe(true);
        const readme = step.starter!.find(file => file.path === 'README.md')!;
        expect(readme.content).toContain(step.title);
        expect(readme.content).toContain('| TODO | TODO | TODO |');
        const profile = analyzeFiles(step.starter!, 'in-app');
        expect(profile.primaryLanguage).toBe('Python');
        expect(profile.tree).toContain(preset.file);
        expect(profile.tree).toContain('README.md');
        expect(profile.readme).toContain(step.title);
        expect(profile.fallback).toBeUndefined();
      }
    }
  });
  it('parses all 108 localized step starters without executing student code', () => {
    const sources = LOCALES.flatMap(lang => pythonClassroomPresets.flatMap(preset => pythonClassroomPlan(preset.id, lang).steps
      .flatMap(step => step.starter!.filter(file => file.path.endsWith('.py')))));
    expect(sources).toHaveLength(108);
    execFileSync('python3', ['-c', 'import ast,json,sys\nfor item in json.load(sys.stdin): ast.parse(item["content"], filename=item["path"])'], { input: JSON.stringify(sources) });
  });
  it('keeps step files independent and preserves starters through server plan normalization', () => {
    const plan = pythonClassroomPlan('09-dict');
    const normalized = normalizeClassroomPlan(plan);
    for (const [index, step] of normalized.steps.entries()) {
      expect(step.language).toBe('python');
      expect(step.starter).toEqual(plan.steps[index].starter);
    }
    plan.steps[0].starter![0].content = 'edited';
    plan.steps[0].starter![1].content = 'edited record';
    expect(plan.steps[1].starter![0].content).not.toBe('edited');
    expect(pythonClassroomPlan('09-dict').steps[0].starter![0].content).not.toBe('edited');
    expect(pythonClassroomPlan('09-dict').steps[0].starter![1].content).not.toBe('edited record');
  });
  it('localizes untouched starter templates without translating custom Python or self-check edits', () => {
    const plan = pythonClassroomPlan('09-dict', 'zh');
    plan.steps[0].starter![0].content = 'inventory = {"custom": 42}\n';
    plan.steps[0].starter![1].content = '# My actual test record\nInput: empty inventory\n';
    const before = JSON.stringify(plan), localized = localizeClassroomPlan(plan, 'en');
    expect(localized.steps[0].starter).toEqual(plan.steps[0].starter);
    expect(localized.steps[1].starter).toEqual(pythonClassroomPlan('09-dict', 'en').steps[1].starter);
    expect(localized.steps[1].language).toBe('python');
    expect(JSON.stringify(plan)).toBe(before);
  });
  it('keeps all required artifact paths through the real GitHub archive extractor', async () => {
    for (const preset of pythonClassroomPresets) {
      const plan = pythonClassroomPlan(preset.id);
      const files = await extractTarGz(splitChunks(archive([
        { path: preset.file, text: pythonStarter(preset.id).content },
        { path: 'README.md', text: '# 自测记录\n输入 / 预期 / 实际\n改进内容' },
      ])));
      const paths = new Set(files.map(f => f.path));
      for (const step of plan.steps) for (const check of step.checks) expect(paths.has(check.path)).toBe(true);
    }
  });
  it('scores a real dict source shape and reports missing work in the starter', () => {
    const plan=pythonClassroomPlan('09-dict');
    const session=new ClassroomSession(plan);session.roster([{id:'a',name:'Ada',connected:true}]);session.control('start');
    const files=[{path:pythonStarter('09-dict').filename,text:pythonStarter('09-dict').content}];
    session.accept(session.begin('a','demo/python'),{files,profile:profileFromFiles('demo/python',files),commit:'a'.repeat(40),checks:[]});
    expect(session.privatePayload('a',false).reports.a.score).toBeLessThan(100);
    expect(session.privatePayload('a',false).reports.a.advice.join()).toContain('inventory[');
  });
  it('rejects unknown presets instead of silently choosing a different lesson', () => {
    expect(()=>pythonClassroomPlan('missing')).toThrow();
    expect(()=>pythonStarter('missing')).toThrow();
  });
});
