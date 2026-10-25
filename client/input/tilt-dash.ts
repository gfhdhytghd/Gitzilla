import { gravityMove, type Acceleration } from './gestures';
export const DASH_COOLDOWN_MS=650;
export interface TiltDashState { armed: boolean; lastDash: number }
export const createTiltDashState = (): TiltDashState => ({ armed: true, lastDash: -Infinity });
/** Gravity-relative, matching movement's downhill vector; no neutral/gyro needed. */
export function recognizeTiltDash(previous: TiltDashState, gravity: Acceleration, now: number, screenAngle=0) {
  const horizontal=Math.hypot(gravity.x,gravity.y);
  const tilt=Math.atan2(horizontal,gravity.z)*180/Math.PI;
  const state={...previous}; let dash=false;
  if(tilt<35) state.armed=true;
  if(tilt>=50-1e-6&&state.armed){
    state.armed=false; // Crossing during cooldown consumes this excursion too.
    if(now-state.lastDash>=DASH_COOLDOWN_MS){dash=true;state.lastDash=now;}
  }
  const direction=gravityMove(gravity,screenAngle,1,15);
  return {state,dash,direction,tilt};
}
