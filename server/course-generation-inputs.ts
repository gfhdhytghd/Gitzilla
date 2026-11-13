import type { CoursePreset } from './course-presets';

/** Reproducible input suggestions, salted by preset so a quiz and exam differ. */
export function generationInputPool(seed: number, preset: CoursePreset, difficulty: 'easy' | 'medium' | 'hard' | 'very-hard' | 'extreme' = 'medium') {
  const small = preset === 'warmup' || difficulty === 'easy' || difficulty === 'medium';
  let state = seed >>> 0;
  for (const c of preset + (small ? ':small' : ':large')) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
  const nonce = state.toString(16).padStart(8, '0');
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  const lists = (small ? [4, 5, 5] : [5, 7, 8]).map(length => {
    const values = new Set<number>(); while (values.size < length) { const v = small ? next() % 20 + 1 : next() % 241 - 120; if (small || Math.abs(v) > 10) values.add(v); }
    return [...values].sort((a, b) => a - b);
  });
  const positions = Array.from({ length: small ? 5 : 8 }, (_, i) => i);
  for (let i = positions.length - 1; i > 0; i--) { const j = next() % (i + 1); [positions[i], positions[j]] = [positions[j], positions[i]]; }
  return { nonce, sortedLists: lists, presentTargets: lists.map((xs, i) => xs[positions[i] % xs.length]), absentTargets: lists.map(xs => small ? Array.from({ length: 20 }, (_, i) => i + 1).find(n => !xs.includes(n))! : xs.at(-1)! + 11), preferredBlankIndices: positions };
}
