import type { InputFrame } from '../shared/types.ts';

/** Only these primitive fields cross from an untrusted WS packet into the sim. */
export function sanitizeInputFrame(value: unknown): InputFrame | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!Number.isSafeInteger(raw.seq) || (raw.seq as number) < 0) return null;
  const move = Array.isArray(raw.move) && raw.move.length === 2 ? raw.move : [0, 0];
  const clamp = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
  const x = clamp(move[0]), y = clamp(move[1]);
  const length = Math.max(1, Math.hypot(x, y));
  let aim: [number, number] | null = null;
  if (Array.isArray(raw.aim) && raw.aim.length === 2 && raw.aim.every(n => typeof n === 'number' && Number.isFinite(n))) {
    // Scale first so even [Number.MAX_VALUE, Number.MAX_VALUE] normalizes finitely.
    const scale = Math.max(Math.abs(raw.aim[0]), Math.abs(raw.aim[1]));
    if (scale > 0) {
      const ax = raw.aim[0] / scale, ay = raw.aim[1] / scale;
      const norm = Math.hypot(ax, ay);
      aim = [ax / norm, ay / norm];
    }
  }
  return {
    seq: raw.seq as number,
    move: [x / length, y / length], aim,
    fire: !!raw.fire, dash: !!raw.dash, skill: !!raw.skill,
    source: raw.source === 'motion' || raw.source === 'touch' ? raw.source : 'keyboard',
  };
}
