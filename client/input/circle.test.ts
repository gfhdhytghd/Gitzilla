import { expect, it } from 'vitest';
import { createGestureState, recognizeGesture, removeGravity } from './gestures';
const zero = { x: 0, y: 0, z: 0 }, quiet = { alpha: 0, beta: 0, gamma: 0 };
function circle(interval = 20, tilted = false, magnitude = 15, turns = 1, gyro = quiet) {
  let state = createGestureState(); const frames = [];
  for (let at = 0; at <= turns * 1000; at += interval) {
    const angle = at / 1000 * Math.PI * 2;
    const u = tilted ? [Math.SQRT1_2, Math.SQRT1_2, 0] : [1, 0, 0];
    const v = tilted ? [-1 / Math.sqrt(6), 1 / Math.sqrt(6), 2 / Math.sqrt(6)] : [0, 0, 1];
    const [x, y, z] = u.map((n, i) => magnitude * (n * Math.cos(angle) + v[i] * Math.sin(angle)));
    const frame = recognizeGesture(state, { x, y, z }, at, 'standard', gyro); state = frame.state; frames.push(frame);
  }
  return frames;
}
it.each([16, 30, 60])('x–z translation circle at%sms skills once without swing or dash', interval => {
  const frames = circle(interval);
  expect(frames.filter(f => f.skill)).toHaveLength(1);
  expect(frames.every(f => !f.fire && !f.fired && !f.dash)).toBe(true);
});
it('fits a tilted plane; primary axis/phone orientation is not required', () => {
  const frames = circle(20, true, 9);
  expect(frames.filter(f => f.skill)).toHaveLength(1);
  expect(frames.every(f => !f.fire && !f.dash)).toBe(true);
});
it('rejects circles while the phone rotates, subthreshold jitter and incomplete/reversing arcs', () => {
  expect(circle(20, false, 8, 1, { alpha: 120, beta: 0, gamma: 0 }).some(f => f.skill)).toBe(false);
  expect(circle(20, true, 0.15).some(f => f.fire || f.skill || f.dash)).toBe(false);
  let state = createGestureState(); let skills = 0;
  for (let at = 0; at < 2000; at += 20) {
    const angle = Math.sin(at / 200) * Math.PI / 2;
    const frame = recognizeGesture(state, { x: 8 * Math.cos(angle), y: 0, z: 8 * Math.sin(angle) }, at, 'standard', quiet);
    state = frame.state; skills += Number(frame.skill);
  }
  expect(skills).toBe(0);
});
it('one completed circle needs new sweep and at least1.2s cooldown for another skill', () => {
  const skills = circle(20, false, 8, 4).filter(f => f.skill);
  expect(skills.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < skills.length; i++) expect(skills[i].state.lastSkill - skills[i - 1].state.lastSkill).toBeGreaterThanOrEqual(1200);
});
it('single sharp flick resolves as an attack only, while gyro wheel rotation never skills', () => {
  const pending = recognizeGesture(createGestureState(), { x: 18, y: 0, z: 0 }, 0, 'standard', quiet);
  expect(pending.fire).toBe(false);
  const release = recognizeGesture(pending.state, zero, 30, 'standard', quiet);
  expect(release).toMatchObject({ fired: true, fire: true, skill: false, dash: false });
  let state = createGestureState();
  for (let at = 0; at < 1200; at += 20) {
    const frame = recognizeGesture(state, zero, at, 'standard', { alpha: 600, beta: 0, gamma: 0 }); state = frame.state;
    expect(frame.fire || frame.skill || frame.dash).toBe(false);
  }
});
it('does not refund an aborted circle as a late attack and drops stale samples across sensor loss', () => {
  const frames = circle(20, false, 15, 0.6); const last = frames.at(-1)!;
  const abort = recognizeGesture(last.state, zero, 650, 'standard', quiet);
  expect(abort.fire || abort.skill || abort.dash).toBe(false);
  const resumed = recognizeGesture(last.state, { x: 15, y: 0, z: 0 }, 5000, 'standard', quiet);
  expect(resumed.spinDegrees).toBe(0); expect(resumed.skill).toBe(false);
});

it('recognizes gravity-only circles after removing a stable gravity estimate', () => {
  let state = createGestureState(), gravity = { x: 0, y: 6.9, z: 6.9 };
  const frames = [];
  for (let at = 0; at <= 1100; at += 20) {
    const angle = at / 1000 * Math.PI * 2;
    const clean = removeGravity({ x: 9 * Math.cos(angle), y: 6.9, z: 6.9 + 9 * Math.sin(angle) }, gravity);
    gravity = clean.gravity;
    const frame = recognizeGesture(state, clean.acceleration, at, 'standard', quiet); state = frame.state; frames.push(frame);
  }
  expect(frames.filter(f => f.skill)).toHaveLength(1);
  expect(frames.every(f => !f.fire && !f.dash)).toBe(true);
});

it('a reversing circle cannot turn into a delayed swing before returning to rest', () => {
  let state = createGestureState(); const frames = [];
  for (let at=0;at<=1500;at+=20) {
    const angle = at<=600 ? at/1000*Math.PI*2 : Math.max(300,1200-at)/1000*Math.PI*2;
    const frame=recognizeGesture(state,{x:15*Math.cos(angle),y:0,z:15*Math.sin(angle)},at,'standard',quiet);
    state=frame.state;frames.push(frame);
  }
  expect(frames.every(f=>!f.fire&&!f.dash&&!f.skill)).toBe(true);
  state=recognizeGesture(state,zero,1520,'standard',quiet).state;
  state=recognizeGesture(state,{x:18,y:0,z:0},1560,'standard',quiet).state;
  expect(recognizeGesture(state,zero,1580,'standard',quiet).fired).toBe(true);
});

it('a completed circle cannot re-enable the removed twist-return dash', () => {
  let state=circle(20,false,8).at(-1)!.state;
  for(let at=1020;at<1500;at+=20) state=recognizeGesture(state,zero,at,'standard',quiet).state;
  const frames=[];
  for(let at=1500;at<=1920;at+=20){
    const alpha=at<1600?300:at<1700?-300:0;
    const frame=recognizeGesture(state,zero,at,'standard',{alpha,beta:0,gamma:0});state=frame.state;frames.push(frame);
  }
  expect(frames.filter(f=>f.dash)).toHaveLength(0);
  expect(frames.every(f=>!f.fire&&!f.skill)).toBe(true);
});
