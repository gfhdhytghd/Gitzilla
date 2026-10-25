import { readSensorTraceStatus } from './trace';
import type { RotationRate } from './gestures';
import type { MotionProfile } from '../../shared/types';
import { readAudioDebugStatus } from '../audio/status';

export interface InputDebugState {
  mode: string;
  permission: string;
  sensors: 'on' | 'waiting' | 'off';
  calibrating: boolean;
  profile: MotionProfile;
  beta: number;
  gamma: number;
  angle: number;
  acceleration: { x: number; y: number; z: number };
  rotationRate: RotationRate | null;
  dashTiltDegrees: number;
  dashArmed: boolean;
  spinDegrees: number;
  spinMagnitude: number;
  spinGyroDegrees: number;
  move: [number, number];
  gestures: string[];
}

export const debugState: InputDebugState = {
  mode: 'uninitialized', permission: 'unknown', sensors: 'off', calibrating: false, profile: 'standard', beta: 0, gamma: 0, angle: 0,
  acceleration: { x: 0, y: 0, z: 0 }, rotationRate: null, dashTiltDegrees:0, dashArmed:true, spinDegrees: 0, spinMagnitude: 0, spinGyroDegrees: 0, move: [0, 0], gestures: [],
};

export function recordGesture(gesture: string): void {
  debugState.gestures.unshift(`${(performance.now() / 1000).toFixed(1)}s ${gesture}`);
  debugState.gestures.length = Math.min(debugState.gestures.length, 6);
}

/** Append the returned panel wherever useful. Call panel.dispose() before removing it. */
export function createInputDebugPanel(): HTMLDivElement & { dispose(): void } {
  const panel = document.createElement('div') as HTMLDivElement & { dispose(): void };
  panel.className = 'kj-input-debug';
  panel.setAttribute('data-testid', 'input-debug');
  panel.style.cssText = 'position:fixed;left:8px;top:48px;z-index:1000;max-width:calc(100vw - 16px);white-space:pre-wrap;font:11px monospace;padding:10px;background:#0b1120ee;color:#9df5c4;pointer-events:none';
  const render = () => {
    const s = debugState;
    const a = s.acceleration;
    const audio = readAudioDebugStatus();
    const trace = readSensorTraceStatus();
    panel.textContent = `INPUT ${s.mode} | profile: ${s.profile} | sensors: ${s.sensors} | permission: ${s.permission}${s.calibrating ? ' | calibrating' : ''}\n` +
      `audio: ${audio.state} | music: ${audio.musicPlaying ? 'playing' : 'idle'} | session: ${audio.session}${audio.muted ? ' | muted' : ''}${audio.needsGesture ? ' | tap to resume' : ''}${audio.error ? ` | ${audio.error}` : ''}\n` +
      `trace: ${trace.source} ${trace.status}${trace.error ? ' | ' + trace.error : ''}\n` +
      `beta ${s.beta.toFixed(1)} gamma ${s.gamma.toFixed(1)} screen ${s.angle}°\n` +
      `accel x ${a.x.toFixed(2)} y ${a.y.toFixed(2)} z ${a.z.toFixed(2)} |a| ${Math.hypot(a.x, a.y, a.z).toFixed(2)}\n` +
      `gyro ${s.rotationRate ? Object.values(s.rotationRate).map(v => v.toFixed(0)).join(', ') + ' deg/s' : 'unavailable (tilt/double-tap dash)'} | circle ${s.spinDegrees.toFixed(0)}° @ ${s.spinMagnitude.toFixed(1)}m/s² gyroΣ ${s.spinGyroDegrees.toFixed(0)}°\n` +
      `dash tilt ${s.dashTiltDegrees.toFixed(1)}° / 50° | ${s.dashArmed ? 'armed' : 'return below35°'}\n` +
      `move ${s.move.map(v => v.toFixed(2)).join(', ')}\n` + s.gestures.join('\n');
  };
  render();
  const timer = window.setInterval(render, 100);
  panel.dispose = () => { window.clearInterval(timer); panel.remove(); };
  return panel;
}
