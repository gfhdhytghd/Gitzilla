/** Offline real sensor replay: no UI/server or hardware success inferred. */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGestureState, recognizeGesture } from '../client/input/gestures';
import { createTiltDashState, recognizeTiltDash } from '../client/input/tilt-dash';
import { orientationGravity } from '../client/input/gestures';
import { defaultThresholds, type GestureThresholds } from '../client/input/thresholds';
const dir=resolve(process.argv[2] || 'qa/real-traces-1025');
const out=process.argv[3];
export function replay(samples:any[], thresholds:GestureThresholds) {
  let state=createGestureState(),tilt=createTiltDashState();const edges:any[]=[];let held=0,pending=0,maxSweep=0,maxGyro=0;
  for(const s of samples) {
   if(s.type==='orientation'){const r=recognizeTiltDash(tilt,orientationGravity(s.beta,s.gamma),s.at,s.angle||0);tilt=r.state;if(r.dash)edges.push({at:s.at,attack:false,dash:true,skill:false});}
   if(s.type==='motion'&&s.acceleration){
    const r=recognizeGesture(state,s.acceleration,s.at,'standard',s.rotationRate,thresholds);state=r.state;
    if(r.fired||r.dash||r.skill)edges.push({at:s.at,attack:r.fired,dash:r.dash,skill:r.skill});
    held+=Number(r.state.circleHeld);pending+=Number(r.pendingSwing);maxSweep=Math.max(maxSweep,r.spinDegrees);maxGyro=Math.max(maxGyro,r.spinGyroDegrees);
  }
  }
  return {attack:edges.filter(s=>s.attack).length,dash:edges.filter(s=>s.dash).length,skill:edges.filter(s=>s.skill).length,held,pending,maxSweep,maxGyro,edges};
}
const report=readdirSync(dir).filter(f=>f.endsWith('.json')).sort().map(file=>{
 const trace=JSON.parse(readFileSync(resolve(dir,file),'utf8')), samples=trace.samples;
 const norm=(v:any)=>v?Math.hypot(...Object.values(v).map(Number)):0;
 const motion=samples.filter((s:any)=>s.type==='motion'), inputs=samples.filter((s:any)=>s.type==='input');
 const base=defaultThresholds();
 return {file,platform:trace.platform,source:trace.source,automated:trace.automated,
  samples:motion.length,accelerationNull:motion.filter((s:any)=>!s.acceleration).length,maxAcceleration:Math.max(...motion.map((s:any)=>norm(s.acceleration))),maxGyro:Math.max(...motion.map((s:any)=>norm(s.rotationRate))),
  on:inputs.filter((s:any)=>s.sensorStatus==='on').length,inputs:inputs.length,
  recordedGestures:samples.filter((s:any)=>s.type==='gesture'),
  defaults:replay(samples,base),legacyForce:replay(samples,{...base,swingThreshold:12,releaseThreshold:5,spinMagnitude:3})};
});
if(out){mkdirSync(resolve(out,'..'),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report.map(({recordedGestures,defaults,legacyForce,...r})=>({...r,recordedGestures:recordedGestures.length,defaults:{...defaults,edges:undefined},legacyForce:{...legacyForce,edges:undefined}})),null,2));
