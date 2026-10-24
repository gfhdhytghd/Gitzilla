import { describe, it, expect } from 'vitest';
import { fx, setView } from './fx';

describe('game viewport scale', () => {
  it('uses the resize-provided scale without synchronously reading DOM layout', () => {
    const canvas = { width: 234, get clientWidth(): never { throw new Error('forced layout'); } };
    const ctx = { canvas, getTransform: () => ({ a: 1 }) } as unknown as CanvasRenderingContext2D;
    setView(ctx, { x: 90, y: 0, w: 234, h: 288, cssScale: 390 / 234 });
    expect(fx.cssPerLogical).toBeCloseTo(390 / 234);
    expect(fx.textScale).toBe(2);
    setView(ctx, { x: 0, y: 0, w: 480, h: 288, cssScale: 3 });
    expect(fx.cssPerLogical).toBe(3);
    expect(fx.textScale).toBe(1);
    expect(fx.view.x).toBe(0);
  });
});
