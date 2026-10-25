import { normalize } from './gestures';
import { recordGesture } from './debug';
import { createTouchGestureState, recognizeTouch, type TouchAction, type TouchSignal } from './touch-gestures';

export interface TouchControls {
  move: [number, number]; readonly fire: boolean; dash: boolean; skill: boolean;
  /** Legacy method name: enables invisible drag movement only, never draws a joystick. */
  setJoystick(enabled: boolean): void;
  clear(): void; dispose(): void;
}

/** Full-screen gesture surface. No drawn buttons/joystick, including sensor fallback. */
export function createTouchControls(options: { joystick?: boolean; onAction?: (action: TouchAction, via: string, direction: [number,number]|null) => boolean|void } = {}): TouchControls {
  let dragEnabled = options.joystick ?? true;
  let fireUntil = 0;
  let pointer: number | null = null;
  let origin: [number, number] = [0, 0];
  let gestures = createTouchGestureState();
  const activePointers=new Set<number>();
  let multitouch=false;
  const overlay = document.createElement('div');
  overlay.className = 'kj-touch-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:30';
  const ring = document.createElement('div');
  ring.setAttribute('data-testid', 'input-charge');
  ring.setAttribute('aria-hidden', 'true');
  ring.style.cssText = 'position:absolute;width:52px;height:52px;margin:-26px;border-radius:50%;pointer-events:none;display:none';
  overlay.append(ring);
  const cancelGesture=()=>{pointer=null;state.move=[0,0];fireUntil=0;state.dash=state.skill=false;
    gestures={...createTouchGestureState(),lastDash:gestures.lastDash};ring.style.display='none';};
  const state: TouchControls = {
    move: [0, 0], dash: false, skill: false,
    get fire() { return performance.now() < fireUntil; },
    setJoystick(enabled) { if(dragEnabled!==enabled){cancelGesture();activePointers.clear();multitouch=false;} dragEnabled = enabled; overlay.setAttribute('data-mode', enabled ? 'touch' : 'motion'); state.move = [0, 0]; },
    clear() { cancelGesture();activePointers.clear();multitouch=false; },
    dispose() { state.clear(); window.clearInterval(timer); cleanup.forEach(fn => fn()); overlay.remove(); },
  };
  const process = (event: TouchSignal) => {
    const priorDash=gestures.lastDash;
    const result = recognizeTouch(gestures, event,dragEnabled?'drag':'motion'); gestures = result.state;
    ring.style.display = result.charge > 0.08 ? '' : 'none';
    ring.style.background = `conic-gradient(#c8ff70 ${result.charge * 360}deg,#152c4288 0deg)`;
    ring.style.boxShadow = 'inset 0 0 0 19px #0b112099';
    if (result.action) {
      const via = result.action === 'skill' ? 'long-press' : result.action === 'dash' ? result.direction?'swipe':'double-tap' : 'tap';
      if(options.onAction?.(result.action,via,result.direction)===false){gestures.lastDash=priorDash;return;}
      if (result.action === 'attack') fireUntil = event.at + 600;
      else { state[result.action] = true; fireUntil = 0; }
      recordGesture(`${via} → ${result.action}`);
    }
  };
  const cleanup: (() => void)[] = [];
  const listen = (type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', fn: (e: PointerEvent) => void) => {
    window.addEventListener(type, fn, { passive: false });
    cleanup.push(() => window.removeEventListener(type, fn));
  };
  listen('pointerdown', e => {
    if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;
    activePointers.add(e.pointerId);
    if(activePointers.size>1||multitouch){multitouch=true;cancelGesture();return;}
    if(pointer!==null)return;
    if ((e.target as Element | null)?.closest?.('button,input,textarea,select,a,[contenteditable="true"],[data-input-ignore]')) return;
    e.preventDefault(); pointer = e.pointerId; origin = [e.clientX, e.clientY];
    ring.style.left = `${e.clientX}px`; ring.style.top = `${e.clientY}px`;
    process({ type: 'down', at: performance.now(), x: e.clientX, y: e.clientY });
  });
  listen('pointermove', e => {
    if (e.pointerId !== pointer) return;
    e.preventDefault(); process({ type: 'move', at: performance.now(), x: e.clientX, y: e.clientY });
    if (dragEnabled) state.move = normalize((e.clientX - origin[0]) / 44, (e.clientY - origin[1]) / 44);
  });
  listen('pointerup', e => {
    activePointers.delete(e.pointerId);
    if(multitouch){if(activePointers.size===0)multitouch=false;return;}
    if (e.pointerId !== pointer) return;
    process({ type: 'up', at: performance.now(),x:e.clientX,y:e.clientY }); pointer = null; state.move = [0, 0];
  });
  listen('pointercancel', e => { activePointers.delete(e.pointerId);if(e.pointerId===pointer)cancelGesture();if(activePointers.size===0)multitouch=false; });
  const timer = window.setInterval(() => process({ type: 'tick', at: performance.now() }), 16);
  state.setJoystick(dragEnabled); document.body.append(overlay);
  return state;
}
