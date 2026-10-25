import { describe, expect, it } from 'vitest';
import { editorCommit, MAX_EDITOR_BYTES, normalizeEditorFiles } from './in-app';
import { ClassroomSession, normalizeClassroomPlan } from './classroom';
import { defaultClassroomPlan } from '../shared/classroom-defaults';
import { analyzeFiles } from '../analysis';

describe('bounded static editor submissions and starters', () => {
  it.each(['/main.py', '../a.py', 'x/../a.py', './a.py', 'x//a.py', 'x\\a.py', 'C:/a.py', 'x\u0000.py', 'x\n.py', 'x/'])('rejects unsafe relative path %j', path => {
    expect(() => normalizeEditorFiles([{ path, content: '' }])).toThrow('relative');
  });
  it('bounds UTF-8 bytes and file count, rejects malformed/duplicate files and preserves exact source', () => {
    const files = [{ path: 'python/你好.py', content: '  print("你好")\n' }];
    expect(normalizeEditorFiles(files)).toEqual(files);
    expect(normalizeEditorFiles(files)[0]).not.toBe(files[0]);
    for (const invalid of [null, [], [{}], [{ path: 'a.py', content: 42 }], [...files, ...files], Array(21).fill(files[0]), [{ path: 'a.py', content: '\ud800' }]]) expect(() => normalizeEditorFiles(invalid)).toThrow();
    expect(normalizeEditorFiles([{ path: 'a.py', content: 'x'.repeat(MAX_EDITOR_BYTES - 4) }])).toHaveLength(1);
    expect(() => normalizeEditorFiles([{ path: 'a.py', content: 'é'.repeat(MAX_EDITOR_BYTES / 2) }])).toThrow('200 KB');
  });
  it('hashes the exact content independent of file order', () => {
    const files = normalizeEditorFiles([{ path: 'a.py', content: 'x = 1\n' }, { path: 'README.md', content: '# Readme' }]);
    expect(editorCommit(files)).toMatch(/^inapp:[a-f\d]{8}$/);
    expect(editorCommit([...files].reverse())).toBe(editorCommit(files));
    expect(editorCommit([{ ...files[0], content: 'x = 2\n' }, files[1]])).not.toBe(editorCommit(files));
  });
  it('preserves safe starter/language metadata across normalize/save/restore without aliases', () => {
    const plan = defaultClassroomPlan();
    plan.steps[0].language = 'python'; plan.steps[0].starter = [{ path: 'python/main.py', content: '# TODO\n' }];
    const normalized = normalizeClassroomPlan(plan);
    plan.steps[0].starter[0].content = 'changed';
    expect(normalized.steps[0].starter![0].content).toBe('# TODO\n');
    expect(ClassroomSession.restore(new ClassroomSession(normalized).save()).state.plan).toEqual(normalized);
    plan.steps[0].starter[0].path = '../bad'; expect(() => normalizeClassroomPlan(plan)).toThrow('relative');
    plan.steps[0].starter = Array(21).fill({ path: 'a.py', content: '' }); expect(() => normalizeClassroomPlan(plan)).toThrow('20');
    plan.steps[0].starter = [{ path: 'a.py', content: 'x'.repeat(MAX_EDITOR_BYTES) }]; expect(() => normalizeClassroomPlan(plan)).toThrow('200 KB');
    plan.steps[0].starter = []; plan.steps[0].language = 'shell' as 'python'; expect(() => normalizeClassroomPlan(plan)).toThrow('Python');
  });
  it('uses rubric + exact static checks; cannot fabricate CI success or persist student code', () => {
    const plan = defaultClassroomPlan(); plan.steps[0].checksWeight = 100;
    plan.steps[0].checks = [{ id: 'f', kind: 'file', path: 'python/main.py', label: 'File' }, { id: 'c', kind: 'contains', path: 'python/main.py', text: 'answer = 42', label: 'Answer' }, { id: 'ci', kind: 'ci', path: 'tests', label: 'CI' }];
    delete plan.steps[0].brief; // These custom checks replace the default task.
    const session = new ClassroomSession(plan);
    session.roster([{ id: 'a', name: 'Alice', connected: true }, { id: 'b', name: 'Bob', connected: true }]); session.control('start');
    const files = [{ path: 'python/main.py', content: 'answer = 42\n# PRIVATE_STUDENT_SOURCE\n' }];
    const source = { profile: analyzeFiles(files, 'in-app'), commit: editorCommit(files), source: 'in-app' as const, files: files.map(f => ({ path: f.path, text: f.content })), checks: [{ name: 'tests', status: 'completed', conclusion: 'success' }] };
    const ticket = session.begin('a', 'in-app');
    expect(() => session.accept(ticket, { ...source, source: 'github' })).toThrow('immutable');
    session.accept(ticket, source);
    const report = session.privatePayload('a', false).reports.a;
    expect(report.source).toBe('in-app'); expect(report.repo).toBe('in-app'); expect(report.score).toBe(66.7);
    expect(report.criteria.length).toBeGreaterThan(0); expect(report.checks.map(c => c.passed)).toEqual([true, true, false]);
    expect(report).not.toHaveProperty('files');
    expect(session.privatePayload('b', false).reports).toEqual({});
    expect(session.privatePayload('teacher', true).reports.a.files).toEqual(files);
    expect(session.privatePayload('a', false).reports.a).not.toHaveProperty('files');
    const saved = JSON.stringify(session.save()); expect(saved).not.toContain('PRIVATE_STUDENT_SOURCE'); expect(saved).not.toContain('"reports"');
    expect(ClassroomSession.restore(session.save()).privatePayload('teacher', true).reports).toEqual({});
  });
});
