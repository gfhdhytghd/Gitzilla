import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36";
let xr: ReturnType<typeof vi.fn>;
function environment(ua: string, touch: number, vr: boolean | "missing" | "rejected", coarse = false, width = 1280, search = "") {
  xr = vr === "rejected" ? vi.fn().mockRejectedValue(new Error("not allowed")) : vi.fn().mockResolvedValue(vr);
  vi.stubGlobal("navigator", { userAgent: ua, maxTouchPoints: touch, xr: vr === "missing" ? undefined : { isSessionSupported: xr } });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: coarse })));
  vi.stubGlobal("innerWidth", width); vi.stubGlobal("innerHeight", 900);
  vi.stubGlobal("location", { search }); vi.stubGlobal("__kaijuDevice", undefined);
}
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("device detection uses UA candidate AND actual immersive support", () => {
  it.each([
    ["Vision Pro's desktop Macintosh UA", MAC, 5, true, false, 1280, "headset", true],
    ["ordinary Mac Safari", MAC, 0, "missing", false, 1280, "desktop", false],
    ["Mac XR runtime without touch", MAC, 0, true, false, 1280, "desktop", false],
    ["iPad desktop UA lacks immersive-vr", MAC, 5, false, true, 1024, "desktop", true],
    ["iPad without WebXR", MAC, 5, "missing", true, 1024, "desktop", false],
    ["Mac touchscreen candidate with rejected WebXR", MAC, 5, "rejected", false, 1280, "desktop", true],
    ["Quest", "Mozilla OculusBrowser/34 Quest 3", 0, true, false, 1280, "headset", true],
    ["Oculus with missing immersive-vr", "Mozilla OculusBrowser/34", 5, false, false, 1280, "desktop", true],
    ["Pico", "Mozilla PICO Browser", 0, true, false, 1280, "headset", true],
    ["Pico without XR", "Mozilla Pico Browser", 0, "missing", false, 1280, "desktop", false],
    ["desktop Chrome with XR runtime", CHROME, 0, true, false, 1280, "desktop", false],
    ["touch desktop Chrome with XR runtime", CHROME, 5, true, true, 1280, "desktop", false],
    ["iPhone stays phone despite XR runtime", "Mozilla iPhone Mobile Safari", 5, true, true, 390, "phone", false],
    ["Android stays phone", "Mozilla Android Chrome Mobile", 5, false, true, 390, "phone", false],
    ["tablet stays desktop-sized", "Mozilla Android Chrome", 5, false, true, 900, "desktop", false],
  ] as const)("%s", async (_, ua, touch, vr, coarse, width, expected, probed) => {
    environment(ua, touch, vr, coarse, width);
    const device = await import("./device"); expect(device.getDevice()).toBeNull();
    expect(await device.detectDevice()).toBe(expected);
    expect(device.getDevice()).toBe(expected); expect((globalThis as any).__kaijuDevice).toBe(expected);
    expect(xr).toHaveBeenCalledTimes(probed ? 1 : 0);
    if (probed) expect(xr).toHaveBeenCalledWith("immersive-vr");
    expect(device.usesLocalControls()).toBe(expected !== "headset");
    expect(device.requiresPhoneController("battle")).toBe(expected === "headset");
    expect(device.requiresPhoneController("pvp")).toBe(expected === "headset");
    expect(device.requiresPhoneController("edu")).toBe(false);
  });
  it.each(["headset", "phone", "desktop"] as const)("explicit %s override bypasses feature probes", async kind => {
    environment(MAC, 5, true, true, 390, `?device=${kind}`);
    const device = await import("./device"); expect(await device.detectDevice()).toBe(kind); expect(xr).not.toHaveBeenCalled();
  });
  it("ignores invalid overrides and caches the first detection/promise", async () => {
    environment(MAC, 5, true, false, 1280, "?device=toaster");
    const device = await import("./device"); const first = device.detectDevice();
    expect(device.detectDevice()).toBe(first); expect(await first).toBe("headset");
    vi.stubGlobal("location", { search: "?device=desktop" });
    expect(await device.detectDevice()).toBe("headset"); expect(xr).toHaveBeenCalledTimes(1);
  });
});

describe("headset view default and device overrides", () => {
  it.each([
    ["headset", "", null, true], ["headset", "", "0", false], ["headset", "&view=2d", "1", false],
    ["headset", "&view=25d", "0", true], ["headset", "&view=xr", "0", true],
    ["desktop", "", "0", false], ["desktop", "", "1", true],
    ["phone", "", null, false], ["phone", "&view=2d", "1", false],
  ] as const)("%s %s saved=%s =>3D%s", async (kind, suffix, saved, wanted) => {
    environment(CHROME, 0, false, false, 1280, `?device=${kind}${suffix}`);
    vi.stubGlobal("localStorage", { getItem: () => saved });
    await (await import("./device")).detectDevice();
    const view = await import("./view25d"); expect(view.view25dWanted()).toBe(wanted);
  });
});
