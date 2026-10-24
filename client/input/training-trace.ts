import { createSensorTrace, startAutomaticTrace, type SensorTrace } from './trace';
const installed = new WeakSet<Window>();
/** The lobby trainer predates the input recorder. Observe its stable training root so
 * real sessions are captured even when it does not call calibration.startStep(). */
export function installTrainingTrace(): void {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined' || !document.body || installed.has(window)) return;
  if (!window.matchMedia?.('(pointer: coarse)').matches && !(navigator.maxTouchPoints > 0)) return;
  installed.add(window);
  let trace: SensorTrace | null = null;
  let mounted = false, lastStep = '';
  const update = () => {
    const root = document.querySelector('[data-testid="training"]');
    if (root && !mounted) {
      trace = createSensorTrace('training');
      startAutomaticTrace(trace, 'training'); lastStep = '';
    } else if (!root && mounted) { trace?.dispose(); trace = null; }
    mounted = !!root;
    const step = root?.querySelector('.tr-title')?.textContent ?? '';
    if (trace?.active && step !== lastStep) { trace.add({ type: 'gesture', at: performance.now(), kind: 'training-step', step }); lastStep = step; }
  };
  new MutationObserver(update).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('deviceorientation', event => {
    if (trace?.active) trace.add({ type: 'orientation', at: performance.now(), beta: event.beta, gamma: event.gamma, alpha: event.alpha,
      angle: screen.orientation?.angle ?? 0 });
  });
  const vector = (a: DeviceMotionEventAcceleration | null) => a ? { x: a.x, y: a.y, z: a.z } : null;
  window.addEventListener('devicemotion', event => {
    if (trace?.active) trace.add({ type: 'motion', at: performance.now(), acceleration: vector(event.acceleration),
      accelerationIncludingGravity: vector(event.accelerationIncludingGravity), rotationRate: event.rotationRate ? {
        alpha: event.rotationRate.alpha, beta: event.rotationRate.beta, gamma: event.rotationRate.gamma } : null, interval: event.interval });
  });
  update();
}
