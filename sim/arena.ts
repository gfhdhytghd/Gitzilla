import type { BossKit, Obstacle } from '../shared/types.ts';
import type { BossCode } from './code.ts';
import { clamp } from './math.ts';

export function createObstacles(kit: BossKit, nextId: () => number): Obstacle[] {
  const files = (kit.code as BossCode | undefined)?.bigFiles ?? [];
  const sources = files.length ? files.slice(0, 6) : [{ path: kit.heart, loc: 1 }];
  const count = clamp(sources.length, 3, 6);
  const positions = count === 3 ? [[158, 144], [230, 37], [230, 251]] :
    [[158, 80], [158, 208], [230, 37], [230, 251], ...(count === 5 ? [[433, 144]] : [[433, 80], [433, 208]])];
  const chosen = Array.from({ length: count }, (_, i) => sources[i % sources.length]);
  const total = chosen.reduce((sum, f) => sum + Math.max(1, f.loc), 0);
  // Fixed total HP; LOC redistributes it, never adds durability to a bigger repo.
  const shares = chosen.map(file => (150 - count) * Math.max(1, file.loc) / total);
  const hitPoints = shares.map(share => 1 + Math.floor(share));
  const remainder = 150 - hitPoints.reduce((sum, hp) => sum + hp, 0);
  const ranked = shares.map((share, i) => ({ i, fraction: share % 1 })).sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (let i = 0; i < remainder; i++) hitPoints[ranked[i].i]++;
  return chosen.map((file, i) => {
    const hp = hitPoints[i];
    return { id: nextId(), x: positions[i][0], y: positions[i][1], w: 20, h: 20, hp, maxHp: hp,
      label: file.path.split(/[\\/]/).pop() || 'core' };
  });
}

/** Earliest segment/rectangle contact, preventing fast shots from tunnelling through cover. */
export function segmentRect(x0: number, y0: number, x1: number, y1: number, box: Pick<Obstacle, 'x' | 'y' | 'w' | 'h'>, pad = 0): number | null {
  let enter = 0, leave = 1;
  for (const [origin, delta, min, max] of [
    [x0, x1 - x0, box.x - box.w / 2 - pad, box.x + box.w / 2 + pad],
    [y0, y1 - y0, box.y - box.h / 2 - pad, box.y + box.h / 2 + pad],
  ]) {
    if (Math.abs(delta) < 1e-9) { if (origin < min || origin > max) return null; continue; }
    const a = (min - origin) / delta, b = (max - origin) / delta;
    enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return null;
  }
  return enter;
}
