import { expect,it } from 'vitest';
import { createTouchGestureState,recognizeTouch,type TouchPolicy,type TouchSignal } from './touch-gestures';
function sequence(events:TouchSignal[],policy:TouchPolicy='motion'){
 let s=createTouchGestureState();return events.map(e=>{const r=recognizeTouch(s,e,policy);s=r.state;return r;});
}
const directions=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]];
it.each(directions)('straight swipe %s,%s emits one directed dash and no tap',(x,y)=>{
 const r=sequence([{type:'down',at:0,x:100,y:100},{type:'move',at:80,x:100+x*35,y:100+y*35},
  {type:'up',at:160,x:100+x*70,y:100+y*70},{type:'tick',at:1000}]);
 expect(r.map(f=>f.action)).toEqual([null,null,'dash',null]);
 expect(r[2].direction?.[0]).toBeCloseTo(x/Math.hypot(x,y));expect(r[2].direction?.[1]).toBeCloseTo(y/Math.hypot(x,y));
});
it.each([[55,300,'dash'],[54,250,null],[80,301,null]])('bounds %spx/%sms yield %s without a tap',(x,at,action)=>{
 const r=sequence([{type:'down',at:0,x:0,y:0},{type:'up',at:Number(at),x:Number(x),y:0},{type:'tick',at:1000}]);
 expect(r[1].action).toBe(action);expect(r[2].action).toBeNull();
});
it('motion double-tap is two attacks, never a dash or delayed third attack',()=>{
 const r=sequence([{type:'down',at:0},{type:'up',at:80},{type:'down',at:160},{type:'up',at:240},{type:'tick',at:1000}]);
 expect(r.map(f=>f.action)).toEqual([null,'attack',null,'attack',null]);
});
it('long-press casts once and cannot turn into a swipe or release attack',()=>{
 const r=sequence([{type:'down',at:0},{type:'tick',at:550},{type:'move',at:600,x:80,y:0},{type:'up',at:650,x:80,y:0},{type:'tick',at:1000}]);
 expect(r.map(f=>f.action)).toEqual([null,'skill',null,null,null]);
});
it('movement over24px cancels tap and charge, even if the finger returns to its origin',()=>{
 const r=sequence([{type:'down',at:0},{type:'move',at:80,x:25,y:0},{type:'move',at:150,x:0,y:0},
  {type:'tick',at:600},{type:'up',at:650},{type:'tick',at:1000}]);
 expect(r.every(f=>!f.action&&f.charge===0)).toBe(true);
});
it('hooks and a curved quarter-circle are not mostly-straight swipes',()=>{
 const hook=sequence([{type:'down',at:0},{type:'move',at:70,x:65,y:0},{type:'up',at:140,x:65,y:65}]);
 expect(hook.at(-1)?.action).toBeNull();
 const arc:TouchSignal[]=[{type:'down',at:0,x:0,y:0}];
 for(let i=1;i<10;i++){const a=i/10*Math.PI/2;arc.push({type:'move',at:i*20,x:100*Math.sin(a),y:100*(1-Math.cos(a))});}
 arc.push({type:'up',at:200,x:100,y:100});expect(sequence(arc).at(-1)?.action).toBeNull();
});
it('a second finger or cancel prevents every action',()=>{
 for(const interruption of ['down','cancel'] as const){
  const r=sequence([{type:'down',at:0},{type:'move',at:80,x:30},{type:interruption,at:100,x:50},{type:'up',at:160,x:80},{type:'tick',at:1000}]);
  expect(r.every(f=>!f.action)).toBe(true);
 }
});
it('swipes respect650ms cooldown; drag fallback still moves without swipe-dashing',()=>{
 const events:TouchSignal[]=[];
 for(const at of [0,300,700])events.push({type:'down',at},{type:'up',at:at+100,x:80,y:0});
 expect(sequence(events).filter(f=>f.action==='dash')).toHaveLength(2);
 expect(sequence(events,'drag').every(f=>!f.action)).toBe(true);
});
