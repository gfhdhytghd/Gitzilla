import { expect, it } from 'vitest';
import { orientationGravity } from './gestures';
import { createTiltDashState, recognizeTiltDash } from './tilt-dash';
it.each([[0,50,1,0],[0,-50,-1,0],[50,0,0,1],[-50,0,0,-1]])('50° beta%s gamma%s dashes downhill', (b,g,x,y)=>{
  const before=createTiltDashState();const r=recognizeTiltDash(before,orientationGravity(b,g),0);
  expect(r.dash).toBe(true);expect(r.direction[0]).toBeCloseTo(x);expect(r.direction[1]).toBeCloseTo(y);
  expect(before.armed).toBe(true);
});
it('needs a return below35° and consumes a crossing during650ms cooldown',()=>{
 let s=createTiltDashState();const frames=[];
 for(const [at,angle] of [[0,49],[10,50],[700,60],[720,35],[740,50],[760,34],[780,50],[800,30],[900,50],[1600,60],[1620,34],[1640,50]]){
  const r=recognizeTiltDash(s,orientationGravity(0,angle),at);s=r.state;frames.push(r);
 }
 expect(frames.map(r=>r.dash)).toEqual([false,true,false,false,false,false,true,false,false,false,false,true]);
});
it('uses resultant gravity tilt, screen rotation and a unit diagonal direction',()=>{
 const r=recognizeTiltDash(createTiltDashState(),orientationGravity(40,40),0);
 expect(r.dash).toBe(true);expect(Math.hypot(...r.direction)).toBeCloseTo(1);
 expect(r.direction[0]).toBeGreaterThan(0);expect(r.direction[1]).toBeGreaterThan(0);
 const rotated=recognizeTiltDash(createTiltDashState(),orientationGravity(0,50),0,90);
 expect(rotated.direction[0]).toBeCloseTo(0);expect(rotated.direction[1]).toBeCloseTo(-1);
});
