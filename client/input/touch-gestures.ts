/** Pure touch vocabulary; attacks wait for the double-tap window, holds never fire. */
export type TouchAction = 'attack' | 'dash' | 'skill';
export type TouchSignal = { type: 'down' | 'move' | 'up' | 'cancel' | 'tick'; at: number; x?: number; y?: number };
export interface TouchGestureState {
  down: { at: number; x: number; y: number; moved: boolean; held: boolean; second: boolean } | null;
  pendingTap: number | null;
}
export const createTouchGestureState = (): TouchGestureState => ({ down: null, pendingTap: null });
export function recognizeTouch(previous: TouchGestureState, event: TouchSignal): { state: TouchGestureState; action: TouchAction | null; charge: number } {
  const state: TouchGestureState = { ...previous, down: previous.down ? { ...previous.down } : null };
  let action: TouchAction | null = null;
  if (event.type === 'cancel') return { state: createTouchGestureState(), action: null, charge: 0 };
  if (state.pendingTap !== null && event.at - state.pendingTap >= 300 && !state.down) {
    action = 'attack'; state.pendingTap = null;
  }
  if (event.type === 'down' && !state.down) {
    state.down = { at: event.at, x: event.x ?? 0, y: event.y ?? 0, moved: false, held: false,
      second: state.pendingTap !== null && event.at - state.pendingTap < 300 };
    state.pendingTap = null;
  }
  if (state.down) {
    const down = state.down;
    if (event.type === 'move' && Math.hypot((event.x ?? down.x) - down.x, (event.y ?? down.y) - down.y) > 24) down.moved = true;
    if (!down.moved && !down.held && event.at - down.at >= 550) { action = 'skill'; down.held = true; }
    if (event.type === 'up') {
      if (!down.held && !down.moved && event.at - down.at < 250) {
        if (down.second) action = 'dash';
        else state.pendingTap = event.at;
      }
      state.down = null;
    }
  }
  return { state, action, charge: state.down && !state.down.moved && !state.down.held ? Math.min(1, (event.at - state.down.at) / 550) : 0 };
}
