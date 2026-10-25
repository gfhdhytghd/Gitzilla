// A desktop UA or an installed WebXR runtime alone does not identify a headset.
export type DeviceKind = "headset" | "phone" | "desktop";
let resolved: DeviceKind | null = null;
let pending: Promise<DeviceKind> | null = null;

/** Null only before detectDevice() resolves. Room routing waits for detection before mounting views. */
export const getDevice = (): DeviceKind | null => resolved;
export const isHeadset = (): boolean => resolved === "headset";
/** Headsets are display devices: never initialize local motion/keyboard gameplay input or report readiness. */
export const usesLocalControls = (): boolean => !isHeadset();
/** PairPanel's required option; classroom headset pages are spectators instead. */
export const requiresPhoneController = (mode?: string): boolean => isHeadset() && mode !== "edu";

export function detectDevice(): Promise<DeviceKind> {
  return pending ??= (async () => {
    const override = new URLSearchParams(globalThis.location?.search ?? "").get("device");
    if (override === "headset" || override === "phone" || override === "desktop") return publish(override);
    const nav = globalThis.navigator;
    const ua = nav?.userAgent ?? "";
    const candidate = (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 0) || /OculusBrowser|Quest|Pico/i.test(ua);
    if (candidate) {
      try {
        if (await nav?.xr?.isSessionSupported("immersive-vr")) return publish("headset");
      } catch { /* Missing/denied XR support is ordinary desktop/tablet behavior. */ }
    }
    // Preserve the app's existing phone layout test; touch-capable tablets remain desktop-sized views.
    const phone = globalThis.matchMedia?.("(pointer: coarse)").matches && Math.min(globalThis.innerWidth, globalThis.innerHeight) < 600;
    return publish(phone ? "phone" : "desktop");
  })();
}
function publish(kind: DeviceKind): DeviceKind {
  resolved = kind;
  (globalThis as typeof globalThis & { __kaijuDevice?: DeviceKind }).__kaijuDevice = kind;
  return kind;
}
