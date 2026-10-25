import { expect, it } from 'vitest';
import { realTraces, replayRealTrace } from './real-traces';
const attacks=[3,0,0,2,2,0,3,17];
it.each(realTraces.map((t,i)=>({trace:t,expected:attacks[i]})))('replays real $trace.file without losing its acceleration peaks', ({trace,expected})=>{
 const r=replayRealTrace(trace);
 expect(r.attacks).toBe(expected);
 // These recordings contain no quiet-gyro full circle. Never invent skills.
 expect(r.skills).toBe(0);
 if(trace.file.startsWith('1792921441887')) expect(r.dashes).toBeGreaterThan(0);
});

it('strong real acceleration becomes a false circle if gyro rejection is disabled',()=>{
 const strongest=realTraces.find(t=>t.file.startsWith('1792921441887'))!;
 expect(replayRealTrace(strongest).skills).toBe(0);
 expect(replayRealTrace(strongest,true).skills).toBeGreaterThan(0);
});
