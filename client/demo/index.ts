// /demo: the live-demo "slide" page. A fixed 1920×1080 stage scaled to the window (so 1280×720 is the same picture),
// one frame loop for the ambient layer + the active scene, keyboard/clicker navigation, track badges, progress bar.
//   → Space PageDown next · ← PageUp back · 1–9, 0 jump · F fullscreen · R next repo · ?scene=N&beat=B to deep link
import "./demo.css";
import { h } from "../app/util.ts";
import { audio } from "../app/sound.ts";
import { loadModules } from "../app/renderers.ts";
import { setClassroomLanguage } from "../i18n/index.ts";
import { profile, FEATURED } from "./data.ts";
import { Life, TRACKS, W, H, pixelCanvas, type DemoCtx, type Scene, type SceneHandle } from "./core.ts";
import { SCENES } from "./scenes.ts";

export async function mountDemo(root: HTMLElement) {
  document.title = "Gitzilla · live demo";
  document.body.classList.add("demo-page");
  // the stage speaks English whatever the projector laptop's locale (session-only override, nothing saved)
  setClassroomLanguage("en");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  await Promise.race([loadModules(), new Promise((r) => setTimeout(r, 2500))]);
  await document.fonts.load('32px "Press Start 2P"').catch(() => []);

  const rain = pixelCanvas(960, 540, "ds-rain");
  const stage = h("div.ds-scene");
  const badges = h("div.ds-badges");
  const corner = h("div.ds-corner");
  const bar = h("div.ds-progress");
  const help = h("div.ds-help", null, "→ next · ← back · 1–9 0 jump · F fullscreen · R next repo");
  const ds = h("div.ds", null, rain, stage, badges, corner, bar, h("div.ds-crt"));
  const shell = h("div#demo.demo" + (calm ? ".calm" : ""), { translate: "no" }, ds, help);
  root.replaceChildren(shell);

  const fit = () => { const s = Math.min(innerWidth / W, innerHeight / H); ds.style.transform = `translate(-50%, -50%) scale(${s})`; };
  fit();
  addEventListener("resize", fit);

  // ---- shared context
  const repoFns = new Set<(i: number) => void>();
  const ctx: DemoCtx = {
    calm,
    shake(power = 1) {
      if (calm) return;
      ds.style.setProperty("--swell", String(1 + 0.006 * Math.min(2, power)));
      ds.classList.remove("swell"); void ds.offsetWidth; ds.classList.add("swell");
    },
    repo: 0,
    onRepo(fn, life) { repoFns.add(fn); life.add(() => repoFns.delete(fn)); },
    blip(kind = "ui") { try { if (kind === "boom") audio.onBossIntro(); else audio.onUi(); } catch { /* audio locked until a key press */ } },
  };
  const cycleRepo = (dir = 1) => {
    ctx.repo = (ctx.repo + dir + FEATURED.length) % FEATURED.length;
    repoFns.forEach((f) => f(ctx.repo));
  };

  // ---- scenes
  const segs = SCENES.map((s, i) => h("button.ds-seg", { title: `${i + 1} · ${s.title}`, onclick: () => go(i, 0) }, h("i")));
  bar.append(...segs);
  let index = -1, beat = 0, life: Life | null = null, handle: SceneHandle | void, leaving: HTMLElement | null = null;
  const beatsOf = (s: Scene) => Math.max(1, s.beats ?? 1);

  function chrome(s: Scene) {
    corner.replaceChildren(h("b", null, String(index + 1).padStart(2, "0")), ` / ${SCENES.length} · ${s.title}`);
    badges.replaceChildren(...(s.tracks ?? []).map((t, i) => h("div.ds-badge", { style: `--i:${i}` }, h("span.ds-badge-k", null, "HackPSU track"), h("span.ds-badge-v", null, TRACKS[t]))));
    segs.forEach((el, i) => {
      el.classList.toggle("on", i === index);
      el.classList.toggle("done", i < index);
      (el.firstChild as HTMLElement).style.width = i < index ? "100%" : i === index ? `${((beat + 1) / beatsOf(s)) * 100}%` : "0";
    });
    history.replaceState(null, "", `/demo?scene=${index + 1}${beat ? `&beat=${beat + 1}` : ""}`);
  }
  function go(i: number, b = 0) {
    i = Math.max(0, Math.min(SCENES.length - 1, i));
    if (i === index) { setBeat(b); return; }
    life?.dispose();
    leaving?.remove();
    const old = stage.firstElementChild as HTMLElement | null;
    if (old) { old.classList.add("ds-out"); leaving = old; setTimeout(() => old.remove(), 380); }
    index = i; beat = 0;
    const s = SCENES[i];
    const el = h(`section.scene.scene-${s.id}.ds-in`);
    stage.append(el);
    life = new Life();
    try { handle = s.mount(el, life, ctx); }
    catch (e) { console.error("[demo] scene failed", s.id, e); el.append(h("div.scene-error", null, `scene ${s.id} failed: ${String(e)}`)); }
    chrome(s);
    ctx.shake(0.6);
    if (b) setBeat(b);
  }
  function setBeat(b: number) {
    const s = SCENES[index];
    beat = Math.max(0, Math.min(beatsOf(s) - 1, b));
    handle?.beat?.(beat);
    chrome(s);
  }
  const next = () => (beat < beatsOf(SCENES[index]) - 1 ? setBeat(beat + 1) : go(index + 1));
  const prev = () => (beat > 0 ? setBeat(beat - 1) : go(index - 1, 0));

  addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === "ArrowRight" || k === " " || k === "PageDown" || k === "Enter") { e.preventDefault(); next(); }
    else if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") { e.preventDefault(); prev(); }
    else if (/^[0-9]$/.test(k)) go(k === "0" ? 9 : Number(k) - 1);
    else if (k === "f" || k === "F") void (document.fullscreenElement ? document.exitFullscreen() : shell.requestFullscreen?.()).catch?.(() => {});
    else if (k === "r" || k === "R") cycleRepo(e.shiftKey ? -1 : 1);
    else return;
    help.classList.add("hide");
  });

  // ---- one frame loop: ambient rain + the active scene's callbacks; window.__demo for automated fps checks
  const stats = { scene: "", fps: 0, frameMs: 0, worstMs: 0 };
  (globalThis as unknown as { __demo: typeof stats }).__demo = stats;
  const rctx = rain.getContext("2d")!;
  const tokens = FEATURED.flatMap((slug) => profile(slug).dna?.tokens ?? []).concat(["{", "}", "=>", "0x1F", "git", "fn", "def", "&&", "::"]);
  const cols = Array.from({ length: 48 }, (_, i) => ({ x: i * 20 + 6, y: Math.random() * 540, v: 30 + Math.random() * 70, tok: tokens[i % tokens.length] }));
  let last = performance.now(), ema = 16.7, worst = 0, frames = 0;
  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000), ms = now - last;
    last = now;
    ema += (ms - ema) * 0.05;
    worst = Math.max(worst * 0.995, ms);
    if (++frames % 15 === 0) Object.assign(stats, { scene: SCENES[index]?.id ?? "", fps: Math.round(10000 / ema) / 10, frameMs: Math.round(ema * 10) / 10, worstMs: Math.round(worst) });
    // glyph rain: dim code tokens drifting down (calm: slower, sparser)
    rctx.fillStyle = calm ? "rgba(3,6,5,.5)" : "rgba(3,6,5,.22)";
    rctx.fillRect(0, 0, 960, 540);
    rctx.font = '16px "VT323", monospace';
    for (const c of cols) {
      c.y += c.v * dt * (calm ? 0.25 : 1);
      if (c.y > 560) { c.y = -20; c.tok = tokens[(Math.random() * tokens.length) | 0]; }
      rctx.fillStyle = "rgba(61,255,139,.55)";
      rctx.fillText(c.tok, c.x, c.y);
    }
    const t = now / 1000;
    if (life) for (const fn of life.frames) { try { fn(t, dt); } catch (e) { console.error("[demo] frame", e); } }
  }
  requestAnimationFrame(frame);

  const q = new URLSearchParams(location.search);
  go(Math.max(0, Number(q.get("scene") ?? 1) - 1), Math.max(0, Number(q.get("beat") ?? 1) - 1));
}
