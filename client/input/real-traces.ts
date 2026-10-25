/** Derived real-phone fixture: original file names/hashes retained, no identifiers.
 * Tuples: m=[at,m,ax,ay,az,gyroAlpha,Beta,Gamma,gx,gy,gz]; o=[at,o,beta,gamma,angle].
 * Six-decimal precision; originals live in qa/real-traces-1025 (not tracked).
 */
import traces from './fixtures/real-phone-1025.json';
import { createGestureState, recognizeGesture } from './gestures';
import { defaultThresholds } from './thresholds';
import { createTiltDashState, recognizeTiltDash } from './tilt-dash';
import { orientationGravity } from './gestures';
export const realTraces=traces;
export function replayRealTrace(trace:typeof traces[number], ignoreGyro=false) {
 let state=createGestureState(), tilt=createTiltDashState();let attacks=0,dashes=0,skills=0;
 for(const s of trace.samples){
  const [at,kind,...v]=s;const values=v as number[];
  if(kind==='m'){
   const [x,y,z,alpha,beta,gamma]=values;
   const r=recognizeGesture(state,{x,y,z},at as number,'standard',ignoreGyro?null:{alpha,beta,gamma},defaultThresholds());state=r.state;
   attacks+=Number(r.fired);skills+=Number(r.skill);
  }else{
   const r=recognizeTiltDash(tilt,orientationGravity(values[0],values[1]),at as number,values[2]);tilt=r.state;dashes+=Number(r.dash);
  }
 }
 return {attacks,dashes,skills};
}
