import type { ServerMsg } from './types';

export type ClassroomPacket = Extract<ServerMsg, {t: 'classroom'}>;

/** Opt-in clients must merge each classroom frame before handing its state/reports to the UI.
 * Welcome/lobby snapshots remain complete. The first classroom frame on every new socket/session is complete.
 */
export function mergeClassroomPacket(previous: ClassroomPacket | undefined, packet: ClassroomPacket): ClassroomPacket {
  if (!packet.delta) return packet;
  if (!previous) throw new Error('A classroom delta requires an initial full classroom packet');
  const {delta, ...next} = packet;
  const reports = {...previous.reports,...packet.reports};
  for (const id of delta.removedReports) delete reports[id];
  return {...next,state:{...packet.state,
    ...(delta.planUnchanged?{plan:previous.state.plan}:{}),
    ...(delta.roundsUnchanged?{rounds:previous.state.rounds}:{})},reports};
}
