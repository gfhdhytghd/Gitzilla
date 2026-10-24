import type { InputFrame } from '../shared/types.ts';

function pair(value: unknown): [number, number] | null {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && Number.isFinite(value[0]) &&
    typeof value[1] === 'number' && Number.isFinite(value[1]) ? [value[0], value[1]] : null;
}

function direction(value: [number, number]): [number, number] | null {
  const magnitude = Math.hypot(...value);
  if (magnitude === 0) return null;
  if (Number.isFinite(magnitude)) return [value[0] / magnitude, value[1] / magnitude];
  const scale = Math.max(Math.abs(value[0]), Math.abs(value[1]));
  if (scale === 0) return null;
  const x = value[0] / scale, y = value[1] / scale, length = Math.hypot(x, y);
  return [x / length, y / length];
}

/** Network sanitization is not required for the authoritative sim to stay finite/alive. */
export function safeInput(value: unknown): InputFrame {
  const frame = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawMove = pair(frame.move), rawAim = pair(frame.aim);
  const move: [number, number] = rawMove ? Math.hypot(...rawMove) > 1 ? direction(rawMove) ?? [0, 0] : rawMove : [0, 0];
  return {
    seq: typeof frame.seq === 'number' && Number.isSafeInteger(frame.seq) && frame.seq >= 0 ? frame.seq : 0,
    move, aim: rawAim ? direction(rawAim) : null,
    fire: frame.fire === true, dash: frame.dash === true, skill: frame.skill === true,
    source: frame.source === 'motion' || frame.source === 'touch' ? frame.source : 'keyboard',
  };
}
