// Class-wide counts for every view. The teacher gets the full roster and every attack; students and the projector get
// a compact state from the 200-student server: their own row (projector: none) plus the anonymous `summary`, and
// (coming) only the viewer's own attack in each round. So no student or projector view may count other students'
// rows or attacks directly: read the counts here.
import type { ClassroomRound, ClassroomState } from '../../shared/classroom';

export interface ClassCounts { total: number; connected: number; submitted: number; queued: number; away: number }

/** Counts from `state.summary` when the server sent one (compact or not), else from the rows (older servers). */
export function classCounts(s: ClassroomState | null | undefined, fallbackTotal = 0): ClassCounts {
  if (!s) return { total: fallbackTotal, connected: 0, submitted: 0, queued: 0, away: 0 };
  const rows = s.rows ?? [];
  const fromRows: ClassCounts = {
    total: rows.length,
    connected: rows.filter(r => r.connected).length,
    submitted: rows.filter(r => r.status === 'submitted').length,
    queued: rows.filter(r => r.status === 'queued').length,
    away: rows.filter(r => !r.connected && r.status === 'empty').length,
  };
  const sum = s.summary;
  if (!sum) return fromRows;
  const pick = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return { total: pick(sum.roster, fromRows.total), connected: pick(sum.connected, fromRows.connected), submitted: pick(sum.submitted, fromRows.submitted),
    queued: pick(sum.queued, fromRows.queued), away: pick(sum.away, fromRows.away) };
}

/**
 * True when this state may hold only part of the class (a student's or the projector's compact state): the server
 * sends `summary` with it. The teacher's state is complete even when it also carries a summary.
 */
export const isCompact = (s: ClassroomState, teacherView: boolean) => !teacherView && !!s.summary;

/**
 * How many students attacked in `round`. Full state: the attack list. Compact state: the attack list holds only the
 * viewer's own attack, so use the round's frozen `totals`; a server without totals: the anonymous summary for the
 * current round (rows still say "submitted" during the raid and feedback), else unknown (null).
 */
export function roundSubmitted(s: ClassroomState, round: ClassroomRound, teacherView: boolean): number | null {
  if (!isCompact(s, teacherView)) return round.attacks.length;
  // frozen anonymous totals (server): right after retry, next, leave or kick too
  if (round.totals) return round.totals.submitted;
  const current = s.plan.steps[s.stepIndex]?.id === round.stepId && s.attempt === round.attempt && s.rounds.at(-1) === round
    && ['raid', 'feedback'].includes(s.phase);
  return current ? classCounts(s).submitted : null;
}
