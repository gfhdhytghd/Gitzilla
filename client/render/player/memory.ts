// Per-player render memory guards (DOM-free, unit-tested).
// The hero renderer keeps per-id memory (timestamps of hurt/dash/revive/knockback, facing, particles...). Player
// ids are reused on rematch while the caller's clock restarts near 0, so stale timestamps from the old match made
// `1 - (t - hurtT) / dur` explode (huge, flipped heroes easing back to normal). These helpers prevent that.

/** Should the memory for this player be thrown away and rebuilt from the current state? */
export function memIsStale(prev: { t: number; seed: number }, t: number, seed: number): boolean {
  if (!Number.isFinite(prev.t) || !Number.isFinite(t)) return true;
  if (t < prev.t - 0.25) return true;   // clock went backwards: new match / new game screen (rematch)
  if (t - prev.t > 3) return true;      // long gap (tab hidden, between matches): transient effects are meaningless
  return prev.seed !== seed;            // same id, different hero (new repo on rematch)
}

/** 1 -> 0 over `dur` seconds after an event; 0 for future/NaN/expired ages (never > 1, never negative). */
export function pulse(age: number, dur: number): number {
  if (!(age >= 0) || !(dur > 0)) return 0;
  return age >= dur ? 0 : 1 - age / dur;
}

/** Squash/stretch factor kept positive and sane, whatever the inputs. */
export function safeScale(v: number, lo = 0.6, hi = 1.6): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 1;
}

/** Caller-provided hero scale (heroScale): finite, 1..3. */
export function heroScaleOf(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(1, Math.min(3, v)) : 1;
}
