import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { pythonClassroomPlan, pythonClassroomPresets, pythonStarter, pythonTeacherGuide } from './classroom-presets';
import { normalizeClassroomPlan, ClassroomSession } from '../server/classroom';
import { archive, splitChunks } from '../analysis/fixtures';
import { extractTarGz } from '../analysis/tar';
import { profileFromFiles } from '../analysis/graph';

describe('Python classroom curriculum', () => {
  it('provides a valid ordered beginner-to-dict sequence with independent editable drafts', () => {
    expect(pythonClassroomPresets).toHaveLength(9);
    expect(pythonClassroomPresets.at(-1)?.title).toContain('dict');
    expect(new Set(pythonClassroomPresets.map(p => p.id)).size).toBe(9);
    for (const preset of pythonClassroomPresets) {
      const plan = pythonClassroomPlan(preset.id);
      expect(() => normalizeClassroomPlan(plan)).not.toThrow();
      expect(plan.steps).toHaveLength(3);
      expect(plan.steps.reduce((sum, step) => sum + step.durationSec, 0)).toBe(preset.minutes * 60);
      expect(new Set(plan.steps.map(step => step.id)).size).toBe(3);
      for (const step of plan.steps) {
        expect(step.instructions).toContain(preset.file);
        expect(step.instructions).toContain('自测示例');
        expect(step.instructions).toContain('不是程序正确率');
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
