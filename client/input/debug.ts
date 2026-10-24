export interface InputDebugState {
  mode: string;
  permission: string;
  beta: number;
  gamma: number;
  angle: number;
  acceleration: { x: number; y: number; z: number };
  move: [number, number];
  gestures: string[];
}

export const debugState: InputDebugState = {
  mode: 'uninitialized', permission: 'unknown', beta: 0, gamma: 0, angle: 0,
  acceleration: { x: 0, y: 0, z: 0 }, move: [0, 0], gestures: [],
};

export function recordGesture(gesture: string): void {
  debugState.gestures.unshift(`${(performance.now() / 1000).toFixed(1)}s ${gesture}`);
  debugState.gestures.length = Math.min(debugState.gestures.length, 6);
}

/** Append the returned panel wherever useful. Call panel.dispose() before removing it. */
export function createInputDebugPanel(): HTMLDivElement & { dispose(): void } {
  const panel = document.createElement('div') as HTMLDivElement & { dispose(): void };
  panel.className = 'kj-input-debug';
  panel.style.cssText = 'white-space:pre;font:11px monospace;padding:10px;background:#0b1120;color:#9df5c4;pointer-events:none';
  const render = () => {
    const s = debugState;
    const a = s.acceleration;
    panel.textContent = `INPUT ${s.mode} | permission: ${s.permission}\n` +
      `beta ${s.beta.toFixed(1)} gamma ${s.gamma.toFixed(1)} screen ${s.angle}°\n` +
      `accel x ${a.x.toFixed(2)} y ${a.y.toFixed(2)} z ${a.z.toFixed(2)}\n` +
      `move ${s.move.map(v => v.toFixed(2)).join(', ')}\n` + s.gestures.join('\n');
  };
  render();
  const timer = window.setInterval(render, 100);
  panel.dispose = () => { window.clearInterval(timer); panel.remove(); };
  return panel;
}
