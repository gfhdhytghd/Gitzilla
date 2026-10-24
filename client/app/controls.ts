import type { MotionProfile } from '../../shared/types';
import { onLocaleChange } from '../i18n';
import { loadMotionProfile, saveMotionProfile, getMotionPermissionState, requestMotionPermission, subscribeMotionPermission, loadTiltSensitivity, saveTiltSensitivity, TILT_SENSITIVITIES, TILT_FULL_SPEED } from '../input';
import { controlsTrained } from './training';
import { toast } from './app';
import { h } from './util';

export function createControlsCard(train: () => void): { el: HTMLElement; dispose(): void } {
  const el = h("div.controls-card", { "data-testid": "controls-card" });
  const hasSensors = typeof (window as { DeviceMotionEvent?: unknown }).DeviceMotionEvent !== "undefined";
  const render = () => {
    const prof = loadMotionProfile();
    const chosen = (() => {
      try {
        return localStorage.getItem("kaiju.controlsChosen") === "1";
      } catch {
        return false;
      }
    })();
    const pick = (p: MotionProfile) => {
      try {
        localStorage.setItem("kaiju.controlsChosen", "1");
      } catch {
        /* private mode */
      }
      saveMotionProfile(p);
      render();
    };
    const enableMotion = (p: MotionProfile) => {
      const requested = requestMotionPermission(p);
      pick(p);
      void requested.then((granted) => {
        if (!granted) toast("motion permission denied — choose touch only to continue", "info");
        
        render();
      });
    };
    const state = getMotionPermissionState();
    const label = prof === "tap-only" ? "touch: drag to move · tap to attack" : "motion: tilt · swing · twist · spin";
    el.replaceChildren(
      h("div.cc-title", null, "🎮 controls ", state.ready ? h("span.cc-chosen", null, `✓ ${label}`) : h("span.dim", null, "— choose before the fight")),
      ...(!state.ready ? [h("div.cc-permission", { role: "status" }, state.permission === "denied" ? "permission denied — retry or choose touch only" : state.needsPermission ? "📱 tap to enable motion · required on each page load" : "waiting for sensor readings — move your phone or choose touch only")] : []),
      h(
        "div.cc-btns",
        null,
        hasSensors
          ? h(`button.btn${prof === "standard" && chosen ? ".btn-primary" : ""}`, { "data-testid": "controls-motion", onclick: () => enableMotion("standard") }, state.ready ? "tilt phone" : "📱 tap to enable motion")
          : null,
        h(`button.btn${prof === "tap-only" && chosen ? ".btn-primary" : ""}`, { "data-testid": "controls-touch", onclick: () => pick("tap-only") }, "touch only"),
      ),
      ...(prof !== "tap-only" ? [h("div.cc-sensitivity", null,
        h("div", null, "tilt sensitivity · flat = still"),
        h("div.cc-btns", { role: "group", "aria-label": "tilt sensitivity" }, ...TILT_SENSITIVITIES.map(value =>
          h(`button.btn${loadTiltSensitivity() === value ? ".btn-primary" : ""}`, {
            "data-testid": `tilt-${value}`, "aria-pressed": loadTiltSensitivity() === value,
            onclick: () => { saveTiltSensitivity(value); render(); }
          }, `${value} · ${TILT_FULL_SPEED[value]}°`))),
        h("div.dim", null, "tilt toward an edge to move · normal reaches full speed at 15°"))] : []),
      ...(chosen ? [h("div.cc-train", null,
            controlsTrained() ? h("span.ok", null, "✓ gestures trained ") : h("span.dim", null, "not trained yet "),
            h("button.btn-link", { "data-testid": "controls-retrain", onclick: train }, controlsTrained() ? "↻ re-train gestures" : "▶ train gestures (20s)")),
        h("div.cc-legend", null, prof === "tap-only" ? "drag to move · tap = attack · double-tap = dash · hold = skill" : "tilt = move · swing / tap = attack · twist / double-tap = dash · spin / long-press = skill")] : []),
    );
  };
  const stopPermission = subscribeMotionPermission(render);
  const stopLocale = onLocaleChange(render);
  const dispose = () => { stopPermission(); stopLocale(); };
  render();
  return { el, dispose };
}

