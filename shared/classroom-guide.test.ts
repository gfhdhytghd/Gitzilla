import { describe, expect, it } from 'vitest';
import { GUIDE_FILE_MAX_BYTES, GUIDE_TEXT_MAX_CHARS, normalizeGuideText, normalizeGuideUrl, validateGuideFile } from './classroom-guide';
import { defaultClassroomPlan } from './classroom-defaults';
import { ClassroomSession, normalizeClassroomPlan } from '../server/classroom';

describe('class guide links', () => {
  it('keeps the link in public state and restored rooms', () => {
    const plan = defaultClassroomPlan();
    plan.guideUrl = ' https://canvas.example.edu/courses/42?module=1#guide ';
    const session = new ClassroomSession(plan);
    expect(session.publicState('teacher').plan.guideUrl).toBe(plan.guideUrl.trim());
    expect(ClassroomSession.restore(JSON.parse(JSON.stringify(session.save()))).publicState('teacher').plan.guideUrl).toBe(plan.guideUrl.trim());
  });
  it.each(['javascript:alert(1)', 'data:text/html,hello', '/guide', 'https://user:pass@example.com', 'not a URL', 'https://' + 'x'.repeat(2048), 123, null])('rejects invalid guide %s', guideUrl => {
    expect(() => normalizeGuideUrl(guideUrl)).toThrow();
    expect(() => normalizeClassroomPlan({ ...defaultClassroomPlan(), guideUrl } as any)).toThrow();
  });
  it('allows older plans and clearing the guide', () => {
    expect(normalizeClassroomPlan(defaultClassroomPlan()).guideUrl).toBeUndefined();
    expect(normalizeGuideUrl('  ')).toBeUndefined();
    expect(normalizeGuideUrl('http://example.com/guide')).toBe('http://example.com/guide');
  });
});


describe('class guide instructions', () => {
  it('normalizes newlines and retains Markdown, link, public state and restored content', () => {
    const plan = { ...defaultClassroomPlan(), guideUrl: 'https://example.com', guideText: '  # Guide\r\n\r\nUse `print()`\rNext  ' };
    const session = new ClassroomSession(plan);
    expect(session.publicState('teacher').plan.guideText).toBe('# Guide\n\nUse `print()`\nNext');
    expect(ClassroomSession.restore(JSON.parse(JSON.stringify(session.save()))).publicState('teacher').plan).toEqual(session.publicState('teacher').plan);
    expect(session.publicState('teacher').plan.guideUrl).toBe('https://example.com/');
  });
  it('supports old plans and clearing optional text', () => {
    expect(normalizeClassroomPlan(defaultClassroomPlan()).guideText).toBeUndefined();
    expect(normalizeGuideText(' \r\n\t ')).toBeUndefined();
    expect(normalizeGuideText('x'.repeat(GUIDE_TEXT_MAX_CHARS))).toHaveLength(GUIDE_TEXT_MAX_CHARS);
  });
  it.each([null, 123, {}, [], 'x'.repeat(GUIDE_TEXT_MAX_CHARS + 1), '\0binary', '\u000b', '\ufffd'])('rejects invalid text %s', guideText => {
    expect(() => normalizeGuideText(guideText)).toThrow();
    expect(() => normalizeClassroomPlan({ ...defaultClassroomPlan(), guideText } as any)).toThrow();
  });
  it('checks extension, nonempty size and file byte boundary', () => {
    expect(() => validateGuideFile({ name: 'GUIDE.MD', size: GUIDE_FILE_MAX_BYTES })).not.toThrow();
    for (const file of [{ name: 'guide.txt', size: 1 }, { name: 'guide.md.exe', size: 1 }, { name: 'guide.md', size: 0 }, { name: 'guide.md', size: GUIDE_FILE_MAX_BYTES + 1 }, { name: 'guide.md', size: NaN }]) {
      expect(() => validateGuideFile(file)).toThrow();
    }
  });
});
