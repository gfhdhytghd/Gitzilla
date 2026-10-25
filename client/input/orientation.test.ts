import { describe, expect, it } from 'vitest';
import { isAppleTouchDevice,isMotionDevice,screenOrientation } from './orientation';
import { gravityMove,orientationGravity } from './gestures';
import { createTiltDashState,recognizeTiltDash } from './tilt-dash';
const phone={userAgent:'iPhone',platform:'iPhone',maxTouchPoints:5};
const ipad={userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',platform:'MacIntel',maxTouchPoints:5};
const screenEdges=[
 {angle:0,bottom:[15,0],right:[0,15]},
 {angle:90,bottom:[0,-15],right:[15,0]},
 {angle:180,bottom:[-15,0],right:[0,-15]},
 {angle:270,bottom:[0,15],right:[-15,0]},
];
describe.each([{name:'iPhone',nav:phone},{name:'desktop-UA iPad',nav:ipad}])('$name screen coordinates',({nav})=>{
 it.each(screenEdges)('bottom/right edges move and dash correctly at$angle° despite a narrow viewport',({angle,bottom,right})=>{
  const win={orientation:angle===270?-90:angle,innerWidth:500,innerHeight:900,screen:{orientation:{angle:0,type:'portrait-primary'}}};
  const resolved=screenOrientation(win,nav);
  expect(resolved.angle).toBe(angle);expect(resolved.source).toBe('window.orientation');
  for(const [pose,target] of [[bottom,[0,1]],[right,[1,0]]] as const){
   for(const sign of [-1,1]){
    const gravity=orientationGravity(pose[0]*sign,pose[1]*sign);
    const move=gravityMove(gravity,resolved.angle);
    expect(move[0]).toBeCloseTo(target[0]*sign);expect(move[1]).toBeCloseTo(target[1]*sign);
    const hard=orientationGravity(pose[0]*sign*50/15,pose[1]*sign*50/15);
    const dash=recognizeTiltDash(createTiltDashState(),hard,0,resolved.angle);
    expect(dash.dash).toBe(true);expect(dash.direction[0]).toBeCloseTo(target[0]*sign);expect(dash.direction[1]).toBeCloseTo(target[1]*sign);
   }
  }
 });
});
it('treats MacIntel + touch as motion capable even if pointer reports fine',()=>{
 expect(isMotionDevice({matchMedia:()=>({matches:false})},ipad)).toBe(true);
 expect(isAppleTouchDevice(ipad)).toBe(true);
 expect(isMotionDevice({matchMedia:()=>({matches:false})},{...ipad,maxTouchPoints:0})).toBe(false);
 expect(isAppleTouchDevice({...ipad,maxTouchPoints:0})).toBe(false);
});
it('uses standard angles on non-Apple browsers and legacy fallback when unavailable',()=>{
 const nav={userAgent:'Android',maxTouchPoints:5};
 expect(screenOrientation({orientation:0,screen:{orientation:{angle:90}}},nav).angle).toBe(90);
 expect(screenOrientation({orientation:-90},nav).angle).toBe(270);
});
it('converts Safari natural-landscape types to sensor portrait coordinates without legacy API',()=>{
 expect(screenOrientation({screen:{orientation:{type:'landscape-primary',angle:0}}},ipad).angle).toBe(90);
 expect(screenOrientation({screen:{orientation:{type:'portrait-primary',angle:90}}},ipad).angle).toBe(0);
 expect(screenOrientation({screen:{orientation:{type:'landscape-secondary',angle:180}}},ipad).angle).toBe(270);
});
