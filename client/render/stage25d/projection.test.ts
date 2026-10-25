import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { createCameraRig, getXRPlacement, screenToWorld } from './projection';

describe('screen camera/floor projection', () => {
  for (const [width, height, worldWidth, worldHeight] of [[1440, 900, 480, 288], [1920, 1080, 960, 576], [390, 844, 480, 288]]) {
    it(`fits and round-trips the whole ${worldWidth}x${worldHeight} arena at ${width}x${height}`, () => {
      const rig = createCameraRig({ width, height, worldWidth, worldHeight });
      for (const [x, y] of [[0, 0], [worldWidth, 0], [0, worldHeight], [worldWidth, worldHeight], [worldWidth / 2, worldHeight / 2], [123, 79]]) {
        const screen = rig.worldToScreen(x, y);
        expect(screen.x).toBeGreaterThanOrEqual(0); expect(screen.x).toBeLessThanOrEqual(width);
        expect(screen.y).toBeGreaterThanOrEqual(0); expect(screen.y).toBeLessThanOrEqual(height);
        const world = rig.screenToWorld(screen.x, screen.y);
        expect(world.x).toBeCloseTo(x, 7); expect(world.y).toBeCloseTo(y, 7);
      }
      expect(rig.worldToScreen(240, 220).scale).toBeGreaterThan(rig.worldToScreen(240, 20).scale);
      expect(rig.worldToScreen(240, 80).y).toBeLessThan(rig.worldToScreen(240, 200).y);
      expect(rig.worldToScreen(240, 144, 14).y).toBeLessThan(rig.worldToScreen(240, 144).y);
    });
  }
  it('follows the existing phone view directly, resizes, and reuses out parameters', () => {
    const rig = createCameraRig({ width: 390, height: 844, worldWidth: 960, worldHeight: 576, phone: true });
    rig.update({ x: 300, y: 100, w: 234, h: 288 });
    const out = { x: 0, y: 0, scale: 0 }, floor = { x: 0, y: 0 };
    expect(rig.worldToScreen(417, 244, 0, out)).toBe(out);
    expect(out.x).toBeCloseTo(117); expect(out.y).toBeCloseTo(144);
    expect(rig.screenToWorld(out.x, out.y, floor)).toBe(floor);
    expect(floor.x).toBeCloseTo(417); expect(floor.y).toBeCloseTo(244);
    rig.resize(780, 422); expect(rig.worldToScreen(417, 244).x).toBeCloseTo(117);
    rig.setWorld(1200, 800); rig.update();
    expect(rig.worldToScreen(600, 400).y).toBeCloseTo(211);
  });
  it('returns logical view pixels for full-arena rendering regardless of initial CSS-sized viewport', () => {
    const rig = createCameraRig({ width: 1440, height: 900, worldWidth: 480, worldHeight: 288 });
    rig.update({ x: 0, y: 0, w: 480, h: 288 });
    const center = rig.worldToScreen(240, 144);
    expect(center.x).toBeCloseTo(240); expect(center.y).toBeCloseTo(144);
    const ground = rig.screenToWorld(center.x, center.y);
    expect(ground.x).toBeCloseTo(240); expect(ground.y).toBeCloseTo(144);
  });
  it('reports parallel and behind-camera rays as misses and rejects bad dimensions', () => {
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 2, 0); camera.lookAt(0, 2, -1); camera.updateMatrixWorld();
    expect(Number.isNaN(screenToWorld(camera, 100, 100, 50, 50).x)).toBe(true);
    expect(Number.isNaN(screenToWorld(camera, 100, 100, 50, 0).x)).toBe(true);
    expect(() => createCameraRig({ width: 0, height: 100, worldWidth: 480, worldHeight: 288 })).toThrow();
  });
});

it('places a 1.2m table at0.9m and life-size arena ahead of the viewer; follow moves the root only', () => {
  const table = getXRPlacement({ worldWidth: 480, worldHeight: 288 });
  expect(table.scale * 480).toBeCloseTo(1.2); expect(table.position.y).toBe(0.9);
  expect(table.position.x + 240 * table.scale).toBeCloseTo(0);
  expect(table.position.z + 144 * table.scale).toBeCloseTo(-1.3);
  const life = getXRPlacement({ worldWidth: 480, worldHeight: 288, mode: 'life' });
  expect(life.scale * 28).toBeCloseTo(1.7); expect(life.position.y).toBe(0);
  expect(life.position.z + 288 * life.scale).toBeCloseTo(-0.5);
  const follow = getXRPlacement({ worldWidth: 480, worldHeight: 288, mode: 'life', follow: { x: 80, y: 50 } });
  expect(follow.position.x + 80 * follow.scale).toBeCloseTo(0);
  expect(follow.position.z + 50 * follow.scale).toBeCloseTo(-0.5);
});
