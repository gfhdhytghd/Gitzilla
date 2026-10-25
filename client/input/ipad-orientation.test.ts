import { expect,it } from 'vitest';
import traces from './fixtures/real-ipad-orientation.json';
import { orientationGravity,gravityMove } from './gestures';
import { screenOrientation } from './orientation';
import { createTiltDashState,recognizeTiltDash } from './tilt-dash';
const ipad={platform:'MacIntel',maxTouchPoints:5,userAgent:'Macintosh Safari'};
it.each(traces)('fixes real $file sensor-left to screen-bottom in landscape',trace=>{
 const angle=screenOrientation({orientation:90,screen:{orientation:{angle:0,type:'landscape-primary'}},innerWidth:500,innerHeight:900},ipad).angle;
 expect(angle).toBe(90);
 // Original uploads only record the already-resolved angle, not raw API values.
 // Replay their sensor values with the reported landscape pose, not invented timestamps.
 for(const [,beta,gamma] of trace.samples){
  const g=orientationGravity(beta,gamma), old=gravityMove(g,0), fixed=gravityMove(g,angle);
  expect(fixed[0]).toBeCloseTo(old[1]);expect(fixed[1]).toBeCloseTo(-old[0]);
 }
 const sample=trace.samples.find(([,b,g])=>g<-12&&Math.abs(b)<3)!;
 expect(sample).toBeDefined();
 const g=orientationGravity(sample[1],sample[2]);
 expect(gravityMove(g,0)[0]).toBeLessThan(-.6);
 expect(gravityMove(g,angle)[1]).toBeGreaterThan(.6);
 // Same recorded downhill direction, raised to the dash threshold, must dash down.
 const h=Math.hypot(g.x,g.y), s=Math.sin(50*Math.PI/180);
 const dash=recognizeTiltDash(createTiltDashState(),{x:g.x/h*s,y:g.y/h*s,z:Math.cos(50*Math.PI/180)},0,angle);
 expect(dash.dash).toBe(true);expect(dash.direction[1]).toBeGreaterThan(.95);
});
