import { DASH_COOLDOWN_MS } from './tilt-dash';
/** Motion: screen-space swipe/tap/hold. Drag fallback: double-tap/tap/hold. */
export type TouchAction = 'attack' | 'dash' | 'skill';
export type TouchPolicy = 'motion' | 'drag';
export type TouchSignal = { type: 'down' | 'move' | 'up' | 'cancel' | 'tick'; at: number; x?: number; y?: number };
export interface TouchGestureState {
  down: { at: number; x: number; y: number; lastX:number; lastY:number; path:number;
    points:[number,number][]; moved: boolean; held: boolean; second: boolean } | null;
  pendingTap: number | null;
  lastDash:number;
}
export const createTouchGestureState = (): TouchGestureState => ({ down: null, pendingTap: null,lastDash:-Infinity });
export function recognizeTouch(previous: TouchGestureState,event:TouchSignal,policy:TouchPolicy='drag') {
  const state:TouchGestureState={...previous,down:previous.down?{...previous.down,points:[...previous.down.points]}:null};
  let action:TouchAction|null=null,direction:[number,number]|null=null;
  if(event.type==='cancel'||event.type==='down'&&state.down)
    return {state:{...createTouchGestureState(),lastDash:state.lastDash},action:null,charge:0,direction};
  if(state.pendingTap!==null&&event.at-state.pendingTap>=300&&!state.down){action='attack';state.pendingTap=null;}
  if(event.type==='down'&&!state.down){
    const x=event.x??0,y=event.y??0;
    state.down={at:event.at,x,y,lastX:x,lastY:y,path:0,points:[[x,y]],moved:false,held:false,
      second:policy==='drag'&&state.pendingTap!==null&&event.at-state.pendingTap<300};
    state.pendingTap=null;
  }
  if(state.down){
    const down=state.down,elapsed=event.at-down.at;
    if(event.type==='move'||event.type==='up'){
      const x=event.x??down.lastX,y=event.y??down.lastY;
      down.path+=Math.hypot(x-down.lastX,y-down.lastY);down.lastX=x;down.lastY=y;
      down.points.push([x,y]);if(down.points.length>64)down.points.splice(1,1);
      if(Math.hypot(x-down.x,y-down.y)>24)down.moved=true;
    }
    if(!down.moved&&!down.held&&elapsed>=550){action='skill';down.held=true;}
    if(event.type==='up'){
      const dx=down.lastX-down.x,dy=down.lastY-down.y,distance=Math.hypot(dx,dy);
      // Endpoint/path ratio and lateral deviation reject hooks, circles and zigzags.
      const straight=distance/(down.path||1)>=.85&&down.points.every(([x,y])=>
        Math.abs((x-down.x)*dy-(y-down.y)*dx)/(distance||1)<=Math.max(12,distance*.18));
      if(policy==='motion'&&!down.held&&elapsed>=0&&elapsed<=300&&distance>=55&&straight){
        if(event.at-state.lastDash>=DASH_COOLDOWN_MS){action='dash';direction=[dx/distance,dy/distance];state.lastDash=event.at;}
      }else if(!down.held&&!down.moved&&elapsed<250){
        if(policy==='motion')action='attack';
        else if(down.second){if(event.at-state.lastDash>=DASH_COOLDOWN_MS){action='dash';state.lastDash=event.at;}}
        else state.pendingTap=event.at;
      }
      state.down=null;
    }
  }
  return {state,action,direction,charge:state.down&&!state.down.moved&&!state.down.held?Math.min(1,(event.at-state.down.at)/550):0};
}
