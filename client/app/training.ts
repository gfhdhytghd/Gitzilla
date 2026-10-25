import { createTouchGestureState, recognizeTouch, type TouchSignal } from '../input/touch-gestures';
// Motion v3 gesture training (lobby, phones): 5 short steps with an animated pixel phone, a live meter and a ✓ per
// step. Doubles as the tutorial. Hold/tilt/swing read DeviceOrientation/DeviceMotion directly; the dash step (tilt the
// phone ≥50° toward where you go, back under 35° to re-arm) and the spin step (a circle drawn with the phone, NOT a
// gyro turn) run codex-input's own recognizer through input.calibration, so training and the fight agree. Stores per-player thresholds in localStorage (`kaiju.gestureProfile`), which game.ts hands to
// input.setProfile(...), and in codex-input's own threshold store.
import { defaultThresholds, sanitizeThresholds, saveThresholds } from "../input/thresholds";
import { orientationGravity, gravityMove } from "../input/gestures";
import { loadTiltSensitivity, TILT_FULL_SPEED, loadMotionProfile, createInput, type InputController } from "../input";
import { h, store, vibrate } from "./util";

export interface GestureProfile {
  v: 3;
  neutral: [number, number]; // beta, gamma at the playing pose
  tilt: { left: number; right: number; up: number; down: number }; // degrees reached
  swing: number; // m/s² threshold for an attack swing
  twist?: number; // legacy (gyro twist dash, gone: dash is a hard tilt with fixed thresholds)
  spin: number; // spinAngle: monotonic acceleration sweep (°) of a circle drawn with the phone (280–340)
  spinMagnitude?: number; // centripetal linear acceleration floor for that circle, m/s²
  at: number;
}
const KEY = "kaiju.gestureProfile";

export function loadGestureProfile(): GestureProfile | null {
  try {
    const p = JSON.parse(store.get(KEY) ?? "null");
    return p?.v === 3 ? (p as GestureProfile) : null;
  } catch {
    return null;
  }
}
export const isTrained = () => !!loadGestureProfile();

/** Map the trainer's result onto codex-input's GestureThresholds (partial; the rest keeps its defaults). */
/** The trainer's swing (old m/s² scale) and twist values are not passed on: codex-input owns the force scale and the
 *  dash thresholds are fixed; only the learned circle-spin values are. */
export function toThresholds(p: GestureProfile) {
  return { spinAngle: p.spin, ...(p.spinMagnitude ? { spinMagnitude: p.spinMagnitude } : {}) };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

type StepId = "hold" | "tilt" | "swing" | "dash" | "spin";
const STEPS: { id: StepId; title: string; sub: string; anim: string; need: number }[] = [
  { id: "hold", title: "hold the screen flat", sub: "screen facing up, parallel to the floor. flat means still.", anim: "a-hold", need: 1 },
  { id: "tilt", title: "tilt to move", sub: "from flat, tilt toward each edge. normal: 15° = full speed.", anim: "a-tilt", need: 4 },
  { id: "swing", title: "swing to attack", sub: "flick the phone like a punch. ×3 (or just tap the screen)", anim: "a-swing", need: 3 },
  { id: "dash", title: "swipe to dash", sub: "Swipe quickly toward where you want to dash, or tilt hard (50°) that way. ×3", anim: "a-dash", need: 3 },
  { id: "spin", title: "spin for your skill", sub: "Draw circles with your phone; keep it upright. ×2 — or long-press the screen", anim: "a-spin", need: 2 },
];

/** Opens the full-screen trainer. Resolves when finished or skipped. */
export function openTraining(opts: { onDone?(trained: boolean): void } = {}): () => void {
  let stepIdx = 0;
  let count = 0;
  const got = new Set<string>(); // tilt directions reached
  const peaks = { swing: [] as number[], dash: [] as number[], spin: [] as number[] };
  const tiltMax = { left: 0, right: 0, up: 0, down: 0 };
  let neutral: [number, number] | null = null;
  let ori: [number, number] | null = null; // beta, gamma
  let stableSince = 0;
  const holdSamples: [number, number][] = [];
  let lastGestureAt = 0;
  // dash + spin steps: the input module's recognizers + calibration recorder (created for those steps only)
  let spinInput: InputController | null = null;
  let spinResult: { spinAngle: number; spinMagnitude: number } | null = null;
  let spinGyro = 0;
  let hpVec: [number, number, number] = [0, 0, 0], lowG: [number, number, number] | null = null;
  let meterVal = 0, meterMax = 1;
  let disposed = false;

  const title = h("div.tr-title");
  const sub = h("div.tr-sub");
  const phone = h("div.tr-phone", null, h("div.tr-screen", null, h("span", null, "</>")));
  const meterFill = h("i");
  const meter = h("div.tr-meter", null, meterFill);
  const meterLbl = h("div.tr-meter-lbl");
  const pad = h("div.tr-tiltpad", null, h("b.tr-dot"));
  const checks = h("div.tr-checks");
  const dots = h("div.tr-steps");
  const nextBtn = h("button.btn.btn-primary.tr-next", { "data-testid": "training-next", hidden: true }, "next ▶");
  const skipBtn = h("button.btn.btn-ghost.tr-skip", { "data-testid": "training-skip" }, "skip training");
  const el = h(
    "div.training",
    { "data-testid": "training", "data-input-ignore": true },
    h("div.tr-head", null, h("span.prompt", null, "$ gesture-training"), dots),
    h("div.tr-stage", null, phone, pad),
    title,
    sub,
    meter,
    meterLbl,
    checks,
    h("div.tr-actions", null, skipBtn, nextBtn),
  );
  document.body.append(el);

  const render = () => {
    const s = STEPS[stepIdx];
    title.textContent = `${stepIdx + 1}/5 · ${s.title}`;
    sub.textContent = s.sub;
    phone.className = `tr-phone ${s.anim}`;
    // dash step: the input module's touch surface must see the swipe (it ignores [data-input-ignore]); every other step
    // keeps the trainer's own tap / long-press counting so nothing counts twice
    el.toggleAttribute("data-input-ignore", s.id !== "dash");
    pad.hidden = s.id !== "tilt";
    dots.replaceChildren(...STEPS.map((_, i) => h(`i${i < stepIdx ? ".done" : i === stepIdx ? ".on" : ""}`)));
    const n = s.id === "tilt" ? got.size : s.id === "hold" ? (neutral ? 1 : 0) : count;
    checks.replaceChildren(
      ...(s.id === "tilt"
        ? (["left", "right", "up", "down"] as const).map((d) => h(`span.tr-check${got.has(d) ? ".ok" : ""}`, null, `${got.has(d) ? "✓" : "·"} ${d === "up" ? "forward" : d === "down" ? "back" : d}`))
        : Array.from({ length: s.need }, (_, i) => h(`span.tr-check${i < n ? ".ok" : ""}`, null, i < n ? "✓" : "·"))),
    );
    nextBtn.hidden = n < s.need;
    nextBtn.textContent = stepIdx === STEPS.length - 1 ? "done ✓" : "next ▶";
  };
  const hit = (kind: StepId, value?: number) => {
    const s = STEPS[stepIdx];
    if (s.id !== kind || count >= s.need) return;
    count++;
    if (value !== undefined && (kind === "swing" || kind === "dash" || kind === "spin")) peaks[kind].push(value);
    vibrate(30);
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    render();
    if (count >= s.need) setTimeout(advance, 700);
  };
  const advance = () => {
    if (disposed) return;
    const s = STEPS[stepIdx];
    const n = s.id === "tilt" ? got.size : s.id === "hold" ? (neutral ? 1 : 0) : count;
    if (n < s.need) return;
    if (stepIdx === STEPS.length - 1) return finish(true);
    stepIdx++;
    count = 0;
    meterVal = 0;
    const id = STEPS[stepIdx].id;
    if (id === "dash" || id === "spin") startCalStep(id);
    render();
  };
  const startCalStep = (step: "dash" | "spin") => {
    try {
      spinInput ??= createInput({
        canvas: document.createElement("canvas"), toArena: () => [0, 0], getSelf: () => null,
        // only the fight's own recognizers count: a hard tilt (or double-tap) for dash, a drawn circle (or long-press)
        // for spin; a gyro turn is neither
        onGesture: (g) => {
          const cur = STEPS[stepIdx].id;
          if (cur === "dash" && g.kind === "dash" && (g.via === "swipe" || g.via === "tilt-dash")) hit("dash", spinInput?.calibration.meter().dashTiltDegrees ?? 0);
          if (cur === "spin" && g.kind === "skill" && (g.via === "spin" || g.via === "long-press")) hit("spin", spinInput?.calibration.meter().spinDegrees ?? 0);
        },
      });
      spinInput.calibration.startStep(step);
    } catch (e) {
      console.warn(`[kaiju] ${step} training: input module unavailable, touch alternative only`, e);
      spinInput = null;
    }
  };
  const stopSpin = () => {
    if (!spinInput) return;
    const r = spinInput.calibration.stop(); // skipped / long-press-only keeps the input defaults
    spinResult = { spinAngle: r.spinAngle, spinMagnitude: r.spinMagnitude };
    spinInput.dispose();
    spinInput = null;
  };
  nextBtn.addEventListener("click", advance);
  skipBtn.addEventListener("click", () => finish(false));

  // ---- sensors ----
  const onOri = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    const now = performance.now();
    const prev = ori;
    ori = [e.beta, e.gamma];
    const s = STEPS[stepIdx];
    if (s.id === "hold") {
      const moved = prev ? Math.hypot(ori[0] - prev[0], ori[1] - prev[1]) : 99;
      if (moved > 1.5 || Math.hypot(...ori) > 5) {
        stableSince = now;
        holdSamples.length = 0;
      }
      holdSamples.push(ori);
      meterVal = clamp((now - stableSince) / 1200, 0, 1);
      meterMax = 1;
      if (!neutral && now - stableSince > 1200 && holdSamples.length > 5) {
        neutral = [holdSamples.reduce((a, x) => a + x[0], 0) / holdSamples.length, holdSamples.reduce((a, x) => a + x[1], 0) / holdSamples.length];
        vibrate(30);
        render();
        setTimeout(advance, 600);
      }
    } else if (s.id === "tilt" && neutral) {
      const full = TILT_FULL_SPEED[loadTiltSensitivity()];
      const angle = window.innerWidth < 600 && window.innerHeight > window.innerWidth ? 0
        : window.screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0;
      const move = gravityMove(orientationGravity(...ori), angle, 1, full);
      const dx = move[0] * full, dy = move[1] * full;
      if (dx < 0) tiltMax.left = Math.max(tiltMax.left, -dx);
      else tiltMax.right = Math.max(tiltMax.right, dx);
      if (dy < 0) tiltMax.up = Math.max(tiltMax.up, -dy);
      else tiltMax.down = Math.max(tiltMax.down, dy);
      const before = got.size;
      if (-dx > full * .8) got.add("left");
      if (dx > full * .8) got.add("right");
      if (-dy > full * .8) got.add("up");
      if (dy > full * .8) got.add("down");
      const dot = pad.firstElementChild as HTMLElement;
      dot.style.transform = `translate(${clamp(dx / full, -1, 1) * 40}px, ${clamp(dy / full, -1, 1) * 40}px)`;
      meterVal = Math.min(1, Math.hypot(...move));
      if (got.size !== before) {
        vibrate(20);
        render();
        if (got.size >= 4) setTimeout(advance, 700);
      }
    }
  };
  const onMotion = (e: DeviceMotionEvent) => {
    const now = performance.now();
    // linear acceleration (iOS may give null `acceleration`: high-pass accelerationIncludingGravity)
    let lin = 0;
    const a = e.acceleration;
    if (a && a.x != null && a.y != null && a.z != null) lin = Math.hypot(a.x, a.y, a.z);
    else if (e.accelerationIncludingGravity) {
      const g = e.accelerationIncludingGravity;
      const v: [number, number, number] = [g.x ?? 0, g.y ?? 0, g.z ?? 0];
      lowG = lowG ? (lowG.map((x, i) => x + (v[i] - x) * 0.1) as [number, number, number]) : v;
      hpVec = v.map((x, i) => x - lowG![i]) as [number, number, number];
      lin = Math.hypot(...hpVec);
    }
    const r = e.rotationRate;
    const rot = r ? Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0) : 0; // deg/s (a wrist turn is not a swing)
    const s = STEPS[stepIdx];
    const refractory = now - lastGestureAt < 450;
    if (s.id === "swing") {
      meterVal = lin;
      meterMax = 18;
      if (!refractory && lin > 9 && rot < 300) {
        lastGestureAt = now;
        hit("swing", lin);
      }
    }
  };
  // touch alternates: tap = attack (on release, like the fight), long-press = skill. Dash is the input module's swipe
  // (motion mode has no double-tap dash any more)
  let downAt = 0, pressTimer = 0;
  const ring = h("div.press-ring");
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest("button")) return;
    downAt = performance.now();
    ring.style.left = `${e.clientX}px`;
    ring.style.top = `${e.clientY}px`;
    ring.classList.remove("go");
    void ring.offsetWidth;
    ring.classList.add("go");
    el.append(ring);
    pressTimer = window.setTimeout(() => {
      ring.remove();
      hit("spin", 270);
      downAt = 0;
    }, 550);
  };
  const onUp = () => {
    clearTimeout(pressTimer);
    ring.remove();
    if (!downAt) return;
    const held = performance.now() - downAt;
    downAt = 0;
    if (held > 250) return;
    hit("swing", 12);
  };
  addEventListener("deviceorientation", onOri);
  addEventListener("devicemotion", onMotion);
  el.addEventListener("pointerdown", onDown);
  addEventListener("pointerup", onUp);
  addEventListener("pointercancel", onUp);

  const raf = () => {
    if (disposed) return;
    const s = STEPS[stepIdx].id;
    if (s === "spin" && spinInput) {
      const m = spinInput.calibration.meter();
      meterVal = m.spinDegrees;
      meterMax = 300;
      spinGyro = m.spinGyroDegrees;
    } else if (s === "dash" && spinInput) {
      meterVal = spinInput.calibration.meter().dashTiltDegrees;
      meterMax = 50;
    }
    meterFill.style.width = `${clamp(meterVal / meterMax, 0, 1) * 100}%`;
    meterLbl.textContent =
      s === "hold" ? (ori ? "steady…" : "waiting for sensors…") : s === "tilt" ? "lean until each direction lights up" : s === "swing" ? `${meterVal.toFixed(1)} m/s²` : s === "dash" ? (meterVal >= 50 ? "dash! now tip it back under 35°" : `swipe — or tilt ${Math.round(meterVal)}° of 50°`)
      : spinGyro > 60 ? `keep it upright: it turned ${Math.round(spinGyro)}°` : `circle ${Math.round(meterVal)}° of 300°`;
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  render();

  function finish(trained: boolean) {
    if (disposed) return;
    disposed = true;
    stopSpin();
    if (trained && neutral) {
      const prof: GestureProfile = {
        v: 3,
        neutral,
        tilt: tiltMax,
        swing: clamp(0.6 * (median(peaks.swing) || 12), 6, 14),
        // the input module learned the circle sweep and magnitude; its own clamps are 280–340° / 2–8 m/s²
        spin: clamp(spinResult?.spinAngle ?? 300, 280, 340),
        ...(spinResult ? { spinMagnitude: spinResult.spinMagnitude } : {}),
        at: Date.now(),
      };
      store.set(KEY, JSON.stringify(prof));
      // also persist in codex-input's own threshold store so the real recognizer loads them at match start
      try {
        const mp = loadMotionProfile();
        saveThresholds(sanitizeThresholds(toThresholds(prof), defaultThresholds(mp)), mp);
      } catch (e) {
        console.warn("[kaiju] could not save input thresholds", e);
      }
      window.dispatchEvent(new Event("kaiju:gesture-trained"));
    }
    removeEventListener("deviceorientation", onOri);
    removeEventListener("devicemotion", onMotion);
    removeEventListener("pointerup", onUp);
    removeEventListener("pointercancel", onUp);
    el.remove();
    opts.onDone?.(trained);
  }
  return () => finish(false);
}

export const controlsTrained = () => loadMotionProfile() === 'tap-only'
  ? store.get('kaiju.touchTrained.v1') === '1' : isTrained();
export function openControlTraining(opts: { onDone?(trained: boolean): void } = {}) {
  return loadMotionProfile() === 'tap-only' ? openTouchTraining(opts) : openTraining(opts);
}

/** Practice the same tap/double-tap/hold recognizer used by the fight. */
function openTouchTraining(opts: { onDone?(trained: boolean): void }): () => void {
  const steps = [
    { title: 'Drag to move', sub: 'Drag across the practice area.', goal: 1, action: 'move' },
    { title: 'Tap to attack', sub: 'Tap three times, with a short pause between taps.', goal: 3, action: 'attack' },
    { title: 'Double-tap to dash', sub: 'Quickly tap twice. Try it two times.', goal: 2, action: 'dash' },
    { title: 'Hold for your skill', sub: 'Hold your finger down until the skill activates.', goal: 1, action: 'skill' },
  ];
  let index = 0, count = 0, disposed = false, pointer: number | null = null;
  let origin: [number, number] = [0, 0], state = createTouchGestureState();
  const title = h('h2.tr-title'), sub = h('p.tr-sub'), status = h('p.tr-meter-lbl');
  const pad = h('div.touch-practice', { 'data-testid': 'touch-practice' }, h('span', null, '</>'));
  const next = h('button.btn.btn-primary', { 'data-testid': 'training-next', hidden: true, onclick: () => {
    if (count < steps[index].goal) return;
    if (++index === steps.length) { finish(true); return; }
    count = 0; pointer = null; state = createTouchGestureState(); render();
  } }, 'next ▶');
  const el = h('div.training', { 'data-testid': 'training', 'data-input-ignore': true },
    h('div.tr-head', null, 'Touch practice'), title, sub, pad, status,
    h('div.tr-actions', null, h('button.btn.btn-ghost', { 'data-testid': 'training-skip', onclick: () => finish(false) }, 'skip training'), next));
  const render = () => {
    title.textContent = `${index + 1}/4 · ${steps[index].title}`;
    sub.textContent = steps[index].sub;
    status.textContent = `${count} / ${steps[index].goal}`;
    next.hidden = count < steps[index].goal;
    next.textContent = index === 3 ? 'done ✓' : 'next ▶';
  };
  const hit = (action: string) => {
    if (action !== steps[index].action || count >= steps[index].goal) return;
    count++; vibrate(20); render();
  };
  const process = (event: TouchSignal) => {
    const result = recognizeTouch(state, event); state = result.state;
    if (result.action) hit(result.action);
  };
  pad.addEventListener('pointerdown', e => {
    if (pointer !== null) return;
    pointer = e.pointerId; origin = [e.clientX, e.clientY]; pad.setPointerCapture(pointer);
    process({ type: 'down', at: performance.now(), x: e.clientX, y: e.clientY });
  });
  pad.addEventListener('pointermove', e => {
    if (pointer !== e.pointerId) return;
    process({ type: 'move', at: performance.now(), x: e.clientX, y: e.clientY });
    if (Math.hypot(e.clientX - origin[0], e.clientY - origin[1]) >= 44) hit('move');
  });
  pad.addEventListener('pointerup', e => {
    if (pointer !== e.pointerId) return;
    process({ type: 'up', at: performance.now() }); pointer = null;
  });
  pad.addEventListener('pointercancel', () => { pointer = null; state = createTouchGestureState(); });
  const timer = window.setInterval(() => process({ type: 'tick', at: performance.now() }), 16);
  function finish(trained: boolean) {
    if (disposed) return;
    disposed = true; clearInterval(timer); el.remove();
    if (trained) store.set('kaiju.touchTrained.v1', '1');
    opts.onDone?.(trained);
  }
  render(); document.body.append(el);
  return () => finish(false);
}
