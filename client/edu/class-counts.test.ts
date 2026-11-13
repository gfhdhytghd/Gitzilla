import { describe, expect, it } from 'vitest';
import type { ClassroomRound, ClassroomState } from '../../shared/classroom';
import { classCounts, isCompact, roundSubmitted } from './class-counts';

describe('class counts (compact state ready)', () => {
  const base = { rows: [
    { id: 'a', name: 'A', connected: true, status: 'submitted' },
    { id: 'b', name: 'B', connected: false, status: 'empty' },
    { id: 'c', name: 'C', connected: true, status: 'queued' },
  ] } as unknown as ClassroomState;
  it('counts rows when there is no summary', () => {
    expect(classCounts(base)).toEqual({ total: 3, connected: 2, submitted: 1, queued: 1, away: 1 });
    expect(classCounts(null, 5).total).toBe(5);
  });
  it('prefers an anonymous summary over a compact (own-row only) roster', () => {
    const compact = { rows: [base.rows[0]], summary: { roster: 200, connected: 190, submitted: 120, queued: 3, away: 10 } } as unknown as ClassroomState;
    expect(classCounts(compact)).toEqual({ total: 200, connected: 190, submitted: 120, queued: 3, away: 10 });
  });
  it('counts attackers from the attack list (full state) or the summary for the current round (compact)', () => {
    const round = { stepId: 's1', attempt: 1, attacks: [{ id: 'a' }] } as unknown as ClassroomRound;
    const s = { plan: { steps: [{ id: 's1' }] }, stepIndex: 0, attempt: 1, phase: 'feedback', rows: [], rounds: [round],
      summary: { roster: 30, connected: 30, submitted: 25, queued: 0, away: 0 } } as unknown as ClassroomState;
    expect(isCompact(s, true)).toBe(false);
    expect(roundSubmitted(s, round, true)).toBe(1);
    expect(isCompact(s, false)).toBe(true);
    expect(roundSubmitted(s, round, false)).toBe(25);
    const older = { ...round, stepId: 's0' } as ClassroomRound;
    expect(roundSubmitted({ ...s, rounds: [older, round] } as ClassroomState, older, false)).toBeNull();
    expect(roundSubmitted({ ...s, summary: undefined } as ClassroomState, round, false)).toBe(1);
  });
});
