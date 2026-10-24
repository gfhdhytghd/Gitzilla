import { describe, expect, it } from 'vitest';
import { createGestureState, recognizeGesture, tiltMove } from './gestures';
import { loadMotionProfile, MOTION_PROFILE_KEY, saveMotionProfile } from './profiles';

describe('inclusive motion profiles', () => {
  it('saves the selected profile locally and safely defaults unavailable/corrupt storage', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    expect(loadMotionProfile(storage)).toBe('standard');
    saveMotionProfile('seated', storage);
    expect(data.get(MOTION_PROFILE_KEY)).toBe('seated');
    expect(loadMotionProfile(storage)).toBe('seated');
    saveMotionProfile('tap-only', storage);
    expect(loadMotionProfile(storage)).toBe('tap-only');
    storage.setItem(MOTION_PROFILE_KEY, 'broken');
    expect(loadMotionProfile(storage)).toBe('standard');
    expect(loadMotionProfile({ getItem() { throw new Error('disabled'); } })).toBe('standard');
    expect(() => saveMotionProfile('seated', { setItem() { throw new Error('disabled'); } })).not.toThrow();
  });
  it('seated full speed needs 8°, with a larger tremor deadzone than standard', () => {
    expect(tiltMove([4.8, 0], [0, 0], 'seated')).toEqual([0, 0]);
    expect(tiltMove([4.8, 0], [0, 0], 'standard')[0]).toBeGreaterThan(0);
    expect(tiltMove([8, 0], [0, 0], 'seated')).toEqual([1, 0]);
    expect(tiltMove([8, 0], [0, 0], 'standard')).toEqual([0.25, 0]);
  });
  it.each([[7, 0, 0], [-7, 0, 0], [0, 7, 0], [0, -7, 0], [0, 0, 7], [0, 0, -7]])
    ('small seated flick (%s, %s, %s) attacks without needing the standard swing', (x, y, z) => {
      const a = { x, y, z };
      expect(recognizeGesture(createGestureState(), a, 0, 'seated').fired).toBe(true);
      expect(recognizeGesture(createGestureState(), a, 0, 'standard').fired).toBe(false);
    });
  it('seated filters tremor and gives repeat flicks a longer refractory interval', () => {
    let state = createGestureState();
    for (let time = 0; time < 600; time += 20) {
      const result = recognizeGesture(state, { x: 2, y: -2, z: 1 }, time, 'seated');
      expect(result.fired).toBe(false); state = result.state;
    }
    state = recognizeGesture(state, { x: 7, y: 0, z: 0 }, 600, 'seated').state;
    state = recognizeGesture(state, { x: 0, y: 0, z: 0 }, 700, 'seated').state;
    expect(recognizeGesture(state, { x: -7, y: 0, z: 0 }, 820, 'seated').fired).toBe(false);
    expect(recognizeGesture(state, { x: -7, y: 0, z: 0 }, 960, 'seated').fired).toBe(true);
  });
  it('tap-only ignores all sensor motion and any leftover gesture burst', () => {
    const firing = recognizeGesture(createGestureState(), { x: 15, y: 0, z: 0 }, 0).state;
    expect(recognizeGesture(firing, { x: 100, y: -100, z: 100 }, 100, 'tap-only')).toMatchObject({ fire: false, fired: false });
    expect(tiltMove([70, -70], [0, 0], 'tap-only')).toEqual([0, 0]);
  });
});
