export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
export function unit(x: number, y: number): [number, number] {
  const d = Math.hypot(x, y);
  return d > 0.001 ? [x / d, y / d] : [1, 0];
}
export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
