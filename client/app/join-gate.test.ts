import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJoinGate, needsGate } from './join-gate';
import { emailLogin } from './github';
import { installTestDom, type TestNode } from '../edu/test-dom';
vi.mock('./backdrop', () => ({ createBackdrop: () => ({ canvas: document.createElement('canvas'), destroy() {} }) }));
vi.mock('./github', () => ({ login: vi.fn(), emailLogin: vi.fn(), logout: vi.fn() }));
beforeEach(() => { installTestDom(); vi.useFakeTimers(); vi.stubGlobal('location', { host: 'class.test' }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const me = { enabled: true, required: true, user: { userId: 'email|123', login: 'student', avatar: '', email: 'student@psu.edu', emailVerified: true } };
describe('classroom email login gate', () => {
  it('accepts email teachers only for classrooms and requires GitHub for battle', () => {
    expect(needsGate(me, 'teacher', 'edu')).toBe(false);
    expect(needsGate(me, 'player', 'pvp')).toBe(true);
    expect(needsGate(me, 'player', 'battle')).toBe(true);
    expect(needsGate(me, null, 'edu')).toBe(false);
  });
  it('shows the email code entry for classroom students', () => {
    const gate = createJoinGate({ room: 'MAIL', kind: 'player', mode: 'edu', me: { ...me, user: null }, done() {} });
    const root = gate.el as unknown as TestNode;
    const button = root.querySelector('[data-testid="gate-email"]');
    expect(button).not.toBeNull(); button!.click(); expect(emailLogin).toHaveBeenCalledOnce(); gate.destroy();
  });
  it('keeps email sign-in out of battle and labels email classroom sessions correctly', () => {
    const battle = createJoinGate({ room: 'PLAY', kind: 'player', mode: 'pvp', me, done() {} });
    expect((battle.el as unknown as TestNode).querySelector('[data-testid="gate-email"]')).toBeNull(); battle.destroy();
    const classroom = createJoinGate({ room: 'MAIL', kind: 'teacher', mode: 'edu', me, done() {} });
    expect(classroom.el.textContent).toContain('signed in with email'); classroom.destroy();
  });
});
