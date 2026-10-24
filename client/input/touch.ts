import { normalize } from './gestures';
import { recordGesture } from './debug';

export interface TouchControls {
  move: [number, number];
  readonly fire: boolean;
  dash: boolean;
  skill: boolean;
  setJoystick(enabled: boolean): void;
  clear(): void;
  dispose(): void;
}

/** Minimal self-contained markup; .kj-touch-* classes are available to the app stylesheet. */
export function createTouchControls(options: { joystick?: boolean } = {}): TouchControls {
  let joystickEnabled = options.joystick ?? true;
  let fireUntil = 0;
  const overlay = document.createElement('div');
  overlay.className = 'kj-touch-overlay';
  const zone = document.createElement('div');
  zone.className = 'kj-touch-joystick-zone';
  zone.setAttribute('aria-label', 'Drag to move');
  const stick = document.createElement('div');
  stick.className = 'kj-touch-joystick';
  const knob = document.createElement('div');
  knob.className = 'kj-touch-knob';
  stick.append(knob);
  zone.append(stick);
  overlay.append(zone);
  const state: TouchControls = {
    move: [0, 0], dash: false, skill: false,
    get fire() { return firePointers.size > 0 || performance.now() < fireUntil; },
    setJoystick(enabled) {
      joystickEnabled = enabled;
      zone.style.display = enabled ? '' : 'none';
      overlay.setAttribute('data-mode', enabled ? 'touch' : 'motion');
      if (!enabled) { joystickPointer = null; state.move = [0, 0]; knob.style.transform = ''; }
    },
    clear() {
      joystickPointer = null;
      state.move = [0, 0];
      fireUntil = 0;
      state.dash = state.skill = false;
      firePointers.clear();
      knob.style.transform = '';
    },
    dispose() { cleanup.forEach(fn => fn()); overlay.remove(); },
  };
  const cleanup: (() => void)[] = [];
  const listen = (target: EventTarget, type: string, fn: (e: PointerEvent) => void) => {
    target.addEventListener(type, fn as EventListener);
    cleanup.push(() => target.removeEventListener(type, fn as EventListener));
  };
  let joystickPointer: number | null = null;
  let origin: [number, number] = [0, 0];
  const firePointers = new Set<number>();
  const updateJoystick = (e: PointerEvent) => {
    state.move = normalize((e.clientX - origin[0]) / 44, (e.clientY - origin[1]) / 44);
    knob.style.transform = `translate(${state.move[0] * 30}px, ${state.move[1] * 30}px)`;
  };
  listen(zone, 'pointerdown', e => {
    if (!joystickEnabled || joystickPointer !== null) return;
    e.preventDefault();
    joystickPointer = e.pointerId;
    origin = [e.clientX, e.clientY];
    const rect = zone.getBoundingClientRect();
    stick.style.left = `${e.clientX - rect.left - 48}px`;
    stick.style.top = `${e.clientY - rect.top - 48}px`;
    stick.style.bottom = 'auto';
    zone.setPointerCapture?.(e.pointerId);
    updateJoystick(e);
  });
  const button = (action: 'dash' | 'skill') => {
    const el = document.createElement('button');
    el.className = `kj-touch-button kj-touch-${action}`;
    el.type = 'button';
    el.setAttribute('aria-label', action.toUpperCase());
    el.setAttribute('data-testid', `input-${action}`);
    el.textContent = action.toUpperCase();
    listen(el, 'pointerdown', e => {
      e.preventDefault();
      state[action] = true;
      recordGesture(`BUTTON → ${action}`);
      el.setPointerCapture?.(e.pointerId);
    });
    overlay.append(el);
  };
  button('dash');
  button('skill');
  // Zero-specificity defaults let the app restyle the classes without !important.
  const style = document.createElement('style');
  style.textContent = `
    :where(.kj-touch-overlay) { position:fixed;inset:0;z-index:30;pointer-events:none;user-select:none;-webkit-user-select:none }
    :where(.kj-touch-joystick-zone) { position:absolute;left:0;bottom:0;width:50%;height:70%;pointer-events:auto;touch-action:none }
    :where(.kj-touch-joystick) { position:absolute;left:28%;bottom:18%;width:96px;height:96px;border:2px solid #75dfca88;border-radius:50%;background:#071c2a66;pointer-events:none }
    :where(.kj-touch-knob) { position:absolute;left:32px;top:32px;width:32px;height:32px;border-radius:50%;background:#75dfca99 }
    :where(.kj-touch-button) { position:absolute;right:16px;width:86px;height:70px;border:2px solid #75dfca;border-radius:12px;background:#102839dd;color:#d5fff5;font:bold 12px monospace;pointer-events:auto;touch-action:none }
    :where(.kj-touch-dash) { bottom:24px }
    :where(.kj-touch-skill) { bottom:106px }
  `;
  overlay.append(style);
  listen(window, 'pointermove', e => {
    if (e.pointerId === joystickPointer) { e.preventDefault(); updateJoystick(e); }
  });
  listen(window, 'pointerdown', e => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if ((e.target as Element | null)?.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) return;
    firePointers.add(e.pointerId);
    fireUntil = Math.max(fireUntil, performance.now() + 400);
    recordGesture('TAP / HOLD → attack');
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId === joystickPointer) {
      joystickPointer = null;
      state.move = [0, 0];
      knob.style.transform = '';
    }
    firePointers.delete(e.pointerId);
  };
  listen(window, 'pointerup', release);
  listen(window, 'pointercancel', release);
  listen(zone, 'lostpointercapture', release);
  state.setJoystick(joystickEnabled);
  document.body.append(overlay);
  return state;
}
