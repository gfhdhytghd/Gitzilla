// Game screen: integer-scaled pixel canvas, snapshot interpolation (~100ms buffer), render composition,
// camera shake / hit-stop / slow-mo driven by events, boss intro + victory/defeat outro, input + motion setup.
// Landscape/desktop/big screen show the whole 480x288 arena. Phones in portrait get a camera viewport that follows
// the hero (full arena height, ~230 px of width), edge indicators, a minimap and a control deck under the viewport.
import type { GameEvent, MatchState, PlayerState, ServerMsg } from "../../shared/types";
import { ARENA_H, ARENA_W } from "../../shared/types";
import { type AppCtx, type Screen } from "./app";
import { createHud, rankPvp } from "./hud";
import { createLessonFeed, createQuizOverlay, type LessonFeed, type QuizOverlay } from "../edu";
import { audio, muteBtn } from "./sound";
import { bossPortraitCanvas } from "./lobby";
import { type InputHandle, R, X, createInput, loadModules, loaded, safe } from "./renderers";
import { asciiBar, clamp, fmtTime, h, isPhone, isTouchDevice, lerp, vibrate } from "./util";

const BUFFER = 0.1; // seconds of interpolation delay
const RES = 1; // internal render scale (logical px -> canvas px)

interface Snap {
  t: number;
  s: MatchState;
}

export function createGame(app: AppCtx): Screen & { outroDone: boolean } {
  const spectator = app.role === "screen";
  const canvas = h("canvas.game-canvas", { "data-testid": "game-canvas", width: ARENA_W * RES, height: ARENA_H * RES }) as HTMLCanvasElement;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingEnabled = false;
  const flash = h("div.fx-flash");
  const danger = h("div.fx-danger");
  const stage = h("div.stage", null, canvas, flash, danger);
  const hud = createHud(spectator);
  const overlay = h("div.game-overlay");
  // blurred, dimmed copy of the arena that fills the letterbox margins
  const ambient = h("canvas.ambient", { width: 96, height: 58 }) as HTMLCanvasElement;
  const actx = ambient.getContext("2d")!;
  const minimap = h("canvas.minimap", { width: ARENA_W / 4, height: ARENA_H / 4 }) as HTMLCanvasElement;
  const mctx = minimap.getContext("2d")!;
  // editor-style tab over the minimap: the arena is the boss's source file
  const miniTab = h("div.mini-tab", { title: "minimap of the whole arena" }, "▾ arena.map");
  stage.append(h("div.mini-wrap", null, miniTab, minimap));
  // portrait control deck: HUD panels are re-homed here; the DASH/SKILL buttons (client/input) dock at its bottom
  const sensorRow = h("div.deck-sensors");
  const deckMid = h("div.deck-mid");
  const deck = h("div.deck", null, sensorRow, deckMid);
  const lateQr = spectator
    ? h("div.late-qr", null, h("img", { src: `/api/qr?text=${encodeURIComponent(`${location.origin}/r/${app.room}`)}`, alt: "join QR" }), h("div", null, `join: ${app.room}`))
    : null;
  const el = h("div.screen.game.waiting", null, ambient, stage, hud.el, deck, overlay, lateQr);

  // ---------------- layout ----------------
  let cssScale = 1;
  // visible window into the arena, in logical px (camera); landscape = whole arena
  const view = { x: 0, y: 0, w: ARENA_W, h: ARENA_H };
  let portrait = false;
  const safeProbe = h("div.safe-probe");
  document.body.append(safeProbe);
  const placeParts = () => {
    const P = hud.parts;
    if (portrait) {
      deck.insertBefore(P.self, sensorRow);
      deckMid.replaceChildren(P.team, P.combo);
      deck.append(P.review, P.log, P.toasts);
      stage.append(P.timer);
      sensorRow.append(muteBtn);
    } else {
      hud.el.append(P.self, P.team, P.combo, P.log, P.review, P.toasts, P.timer);
      document.body.append(muteBtn);
    }
  };
  const layout = () => {
    const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
    const phone = isPhone();
    el.classList.toggle("phone-landscape", phone && W > H);
    const wasPortrait = portrait;
    portrait = phone && H >= W && !spectator;
    el.classList.toggle("phone-portrait", portrait);
    if (portrait !== wasPortrait || !el.dataset.placed) {
      el.dataset.placed = "1";
      placeParts();
    }
    if (portrait) {
      const cs = getComputedStyle(safeProbe);
      const safeTop = parseFloat(cs.paddingTop) || 0, safeBot = parseFloat(cs.paddingBottom) || 0;
      const barH = 44 + safeTop; // boss bar sits directly under the notch inset
      const avail = H - barH - safeBot;
      // Height budget for the viewport: leave a full deck on tall phones, a compact one (~210px) on short ones.
      const deckMin = avail >= 640 ? 240 : 210;
      const budget = Math.min(avail * 0.66, avail - deckMin);
      // Prefer the biggest integer DEVICE-pixel scale (crisp); if that wastes >15% of the budget (e.g. 360x640 @2x
      // would floor to 1 device px = a 144px-tall arena), use a fractional scale that fills it (pixelated upscaling).
      const s = Math.max(1, Math.floor((budget * dpr) / ARENA_H));
      cssScale = (ARENA_H * s) / dpr >= budget * 0.85 ? s / dpr : budget / ARENA_H;
      // keep at least ~200 logical px of arena visible across the width
      cssScale = Math.min(cssScale, W / 200);
      view.w = Math.min(ARENA_W, Math.floor(W / cssScale));
      view.h = ARENA_H;
      const w = view.w < ARENA_W ? W : Math.round(view.w * cssScale), hh = Math.round(view.h * cssScale);
      const left = Math.round((W - w) / 2);
      el.classList.toggle("deck-compact", H - barH - hh - safeBot < 290);
      Object.assign(stage.style, { width: `${w}px`, height: `${hh}px`, left: `${left}px`, top: `${Math.round(barH)}px` });
      if (canvas.width !== view.w * RES) canvas.width = view.w * RES;
      if (canvas.height !== view.h * RES) canvas.height = view.h * RES;
      for (const [k, v] of Object.entries({ "--gw": w, "--gh": hh, "--gx": left, "--gy": Math.round(barH), "--deck-top": Math.round(barH + hh) })) {
        el.style.setProperty(k, `${v}px`);
        document.body.style.setProperty(k, `${v}px`); // touch overlay + mute button live on <body>
      }
      for (const c of ["dock-x", "dock-narrow", "dock-y"]) el.classList.remove(c);
      return;
    }
    view.x = 0;
    view.w = ARENA_W;
    view.h = ARENA_H;
    if (canvas.width !== ARENA_W * RES) canvas.width = ARENA_W * RES;
    if (canvas.height !== ARENA_H * RES) canvas.height = ARENA_H * RES;
    const s = Math.floor(Math.min((W * dpr) / ARENA_W, (H * dpr) / ARENA_H));
    cssScale = s >= 1 ? s / dpr : Math.min(W / ARENA_W, H / ARENA_H);
    // integer device-pixel scale wastes too much space on some phones; fall back to fractional nearest-neighbour
    if ((ARENA_H * cssScale) / H < 0.78 && (ARENA_W * cssScale) / W < 0.78) cssScale = Math.min(W / ARENA_W, H / ARENA_H);
    const w = Math.round(ARENA_W * cssScale), hh = Math.round(ARENA_H * cssScale);
    Object.assign(stage.style, { width: `${w}px`, height: `${hh}px`, left: `${Math.round((W - w) / 2)}px`, top: `${Math.round((H - hh) / 2)}px` });
    el.style.setProperty("--gw", `${w}px`);
    el.style.setProperty("--gh", `${hh}px`);
    el.style.setProperty("--gx", `${Math.round((W - w) / 2)}px`);
    el.style.setProperty("--gy", `${Math.round((H - hh) / 2)}px`);
    // dock HUD panels into the margins when they're wide/tall enough
    const gx = (W - w) / 2, gy = (H - hh) / 2;
    el.style.setProperty("--dw", `${Math.floor(gx - 10)}px`);
    document.body.style.setProperty("--dw-btn", `${Math.floor(gx - 10)}px`); // touch overlay lives on <body>
    el.classList.toggle("dock-x", gx >= 88);
    el.classList.toggle("dock-narrow", gx >= 88 && gx < 150);
    el.classList.toggle("dock-y", gy >= 56);
  };
  layout();
  addEventListener("resize", layout);
  const toArena = (cx: number, cy: number): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [view.x + ((cx - r.left) / r.width) * view.w, view.y + ((cy - r.top) / r.height) * view.h];
  };

  // ---------------- snapshots / timeline ----------------
  const snaps: Snap[] = [];
  const pendingEvents: { t: number; e: GameEvent }[] = [];
  let offset: number | null = null; // local seconds - server t
  let lag = 0; // extra delay accumulated by hit-stop / slow-mo
  let latest: MatchState | null = null;
  let ownBullets = new Set<number>();
  const seenBullets = new Set<number>();
  let lastDashCd = 0;

  const onSnapshot = (s: MatchState) => {
    const now = performance.now() / 1000;
    if (latest && s.t < latest.t - 1) {
      // new match (rematch): reset timeline
      snaps.length = 0;
      pendingEvents.length = 0;
      offset = null;
      introStarted = false;
      outro = null;
    }
    const o = now - s.t;
    if (offset === null || o < offset) offset = o;
    else offset += (o - offset) * 0.02;
    if (snaps.length && snaps[snaps.length - 1].t >= s.t) snaps[snaps.length - 1] = { t: s.t, s };
    else snaps.push({ t: s.t, s });
    if (snaps.length > 30) snaps.shift();
    for (const e of s.events) pendingEvents.push({ t: s.t, e });
    // audio runs on arrival (once per authoritative snapshot), not on the delayed render timeline
    audio.music(s.status === "victory" || s.status === "defeat" ? s.status : arenaTheme(s), s.boss?.phase ?? 1);
    audio.onEvents(s.events, app.you ?? "");
    // muzzle flashes for everyone: a player's new bullet ids mean they just fired
    for (const b of s.bullets)
      if (b.owner !== "boss" && !seenBullets.has(b.id)) {
        seenBullets.add(b.id);
        X.notePlayerShot(b.owner);
      }
    if (seenBullets.size > 4000) seenBullets.clear();
    const me = s.players.find((p) => p.id === app.you);
    if (me) {
      let fired = false;
      const ids = new Set<number>();
      for (const b of s.bullets)
        if (b.owner === me.id) {
          ids.add(b.id);
          if (!ownBullets.has(b.id)) fired = true;
        }
      ownBullets = ids;
      if (fired) audio.onFire(me.kit.weapon);
      if (me.dashCd > lastDashCd + 0.05) audio.onDash();
      lastDashCd = me.dashCd;
    }
    latest = s;
    el.classList.remove("waiting");
    if (s.mode === "edu") updateEdu(s);
    if (!introStarted && (s.status === "countdown" || s.t < 1.2)) startIntro(s);
    introStarted = true;
  };

  // arena look: follows the boss in battle; edu PvP (no boss) uses the notebook "classroom" theme
  const arenaSeed = [...app.room].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const arenaTheme = (s: MatchState) => s.boss?.kit.theme ?? "notebook";

  // ---------------- edu (classroom PvP): lesson cards + quiz overlay from client/edu ----------------
  let feed: LessonFeed | null = null;
  let quiz: QuizOverlay | null = null;
  const eduVariant = () => (spectator ? "screen" : portrait ? "phone" : "desktop") as "screen" | "phone" | "desktop";
  const updateEdu = (s: MatchState) => {
    const students = s.players.map((p) => ({ id: p.id, name: p.name, repo: p.kit.repo, quality: p.kit.quality }));
    if (!feed) {
      try {
        feed = createLessonFeed({ variant: eduVariant(), ctx: { mode: s.mode, you: app.you, spectator, players: students, boss: null } });
        quiz = createQuizOverlay({ variant: eduVariant(), engine: feed.engine });
        feed.el.classList.add("edu-mount");
        quiz.el.classList.add("edu-mount");
        if (portrait) sensorRow.after(feed.el); // phone: lesson cards replace the event log in the deck
        else overlay.append(feed.el);
        (portrait ? deck : overlay).append(quiz.el);
      } catch (e) {
        console.warn("[kaiju] edu components failed", e);
        return;
      }
    } else if (students.length !== lastStudentCount) feed.setContext({ players: students });
    lastStudentCount = students.length;
    try {
      feed.update(s);
      quiz?.update(s, app.you);
    } catch (e) {
      console.warn("[kaiju] edu update failed", e);
    }
  };
  let lastStudentCount = 0;

  // ---------------- juice state ----------------
  let trauma = 0;
  let hitstop = 0;
  let slowmo = 0;
  let flashA = 0;
  let flashCol = "255,255,255";
  let zoom = 1;
  let zoomTarget: [number, number] = [ARENA_W / 2, ARENA_H / 2];
  let glitchUntil = 0;
  const nudge: [number, number] = [0, 0]; // directional camera kick from hits on you
  const releasedEvents: GameEvent[] = [];

  let lastStopAt = 0;
  // prefers-reduced-motion: quarter shake, no full-screen flashes/glitches (photosensitivity)
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).has("calm");
  const kick = (t: number, stop = 0, slow = 0) => {
    trauma = Math.min(1, trauma + (calm ? t * 0.25 : t));
    // small hit-stops are rate-limited so rapid-fire crits don't turn into a stutter
    const now = performance.now();
    if (stop >= 0.06 || (stop > 0 && now - lastStopAt > 350)) {
      hitstop = Math.max(hitstop, stop);
      lastStopAt = now;
    }
    slowmo = Math.max(slowmo, slow);
  };
  let lastFlashAt = 0;
  const doFlash = (a: number, col = "255,255,255") => {
    if (calm) a = Math.min(a, 0.12); // a faint tint, never a strobe
    const now = performance.now();
    if (now - lastFlashAt < 340 && a < flashA + 0.2) return; // ≤3 full-screen flashes per second
    lastFlashAt = now;
    if (a >= flashA) flashCol = col;
    flashA = Math.max(flashA, a);
  };

  const handleEvent = (e: GameEvent, s: MatchState) => {
    const you = app.you;
    switch (e.type) {
      case "hit": {
        const impact = e.impact ?? 0.3;
        const stop = (e.hitStop ?? 0) / 1000;
        const mine = !!you && e.source === you;
        if (e.target === "boss") {
          if (e.crit && mine) kick(0.12 + impact * 0.2, Math.min(0.06, stop || 0.04));
          else if (e.combo && e.combo >= 2) kick(0.06 + e.combo * 0.03, mine ? Math.min(0.05, stop) : 0);
          else kick(mine ? 0.01 + impact * 0.05 : 0.008);
        } else if (e.target === you) {
          kick(0.25 + impact * 0.3, Math.min(0.08, stop || 0.05));
          doFlash(0.3 + impact * 0.2, "255,30,60");
          vibrate(e.crit ? [40, 30, 60] : 45);
          if (e.direction) {
            nudge[0] += e.direction[0] * (2 + impact * 4);
            nudge[1] += e.direction[1] * (2 + impact * 4);
          }
        }
        break;
      }
      case "limbBroken":
        kick(0.65, 0.06, 0.55);
        doFlash(0.5);
        vibrate([30, 30, 60]);
        break;
      case "downed":
        if (e.player === you) {
          kick(0.6, 0.09, 0.4);
          doFlash(0.55, "255,20,40");
          vibrate([80, 40, 140]);
        } else kick(0.2);
        if (Math.random() < 0.4) taunt(s);
        break;
      case "obstacleBroken":
        kick(0.18);
        break;
      case "pickup":
        if (e.player === you) vibrate(15);
        break;
      case "perk":
        if (e.player === you) {
          doFlash(0.25, "57,255,136");
          vibrate([20, 30, 20]);
        }
        break;
      case "revived":
        if (e.player === you) {
          youRingUntil = performance.now() + 4000;
          doFlash(0.4, "57,255,136");
          vibrate([20, 20, 20]);
        }
        break;
      case "telegraph":
        if (e.targetPlayer && e.targetPlayer === you) vibrate([25, 40, 25]);
        break;
      case "phase":
        taunt(s, true);
        kick(0.55, 0.05, 0.35);
        if (!calm) glitchUntil = performance.now() + 700;
        doFlash(0.3, "255,40,90");
        break;
      case "victory":
        kick(0.9, 0.1, 1.8);
        doFlash(0.8);
        startOutro(true);
        break;
      case "defeat":
        kick(0.7, 0.08, 1.2);
        doFlash(0.6, "255,0,40");
        startOutro(false);
        break;
    }
    hud.event(e, s, app.you);
  };

  // ---------------- boss taunts (Gemini design) ----------------
  const bubble = h("div.taunt");
  overlay.append(bubble);
  let bubbleUntil = 0;
  let nextTaunt = 0;
  let tauntIdx = 0;
  const taunt = (s: MatchState, force = false) => {
    const lines = s.boss?.kit.design?.taunts;
    if (!lines?.length || s.status !== "fighting") return;
    if (!force && performance.now() < bubbleUntil + 2000) return;
    const text = lines[tauntIdx++ % lines.length];
    bubble.textContent = text;
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
    bubbleUntil = performance.now() + 2800;
    nextTaunt = performance.now() + 15000;
    hud.say(text);
  };

  // ---------------- intro ----------------
  let introStarted = false;
  let introEnd = 0;
  const intro = h("div.intro", { "data-testid": "boss-intro" });
  const startIntro = (s: MatchState) => {
    if (!s.boss) return startPvpIntro(s);
    const kit = s.boss.kit;
    const t0 = performance.now();
    const lines = kit.design?.intro?.length ? kit.design.intro.slice(0, 4) : ["WARNING: KAIJU DETECTED"];
    introEnd = t0 + 2400 + lines.length * 350;
    zoom = 1.9;
    zoomTarget = [s.boss.x, s.boss.y];
    const clone = h("div.in-line.dim");
    const bar = h("div.in-line.green");
    const warn = h("div.in-lines");
    const name = h("div.in-name");
    const epithet = h("div.in-line.in-epithet");
    const meta = h("div.in-line.dim");
    let portrait: HTMLCanvasElement | null = null;
    try {
      portrait = bossPortraitCanvas(kit, 96);
    } catch {
      /* placeholder */
    }
    intro.replaceChildren(
      h("div.lb.top"),
      h("div.lb.bot"),
      h("div.in-card", null, portrait ? h("div.in-portrait", null, portrait) : null, h("div.in-text", null, clone, bar, warn, name, epithet, meta)),
    );
    intro.classList.remove("out");
    overlay.append(intro);
    el.classList.add("intro-on");
    clone.textContent = `$ git clone github.com/${kit.repo}`;
    const iv = setInterval(() => {
      const k = (performance.now() - t0) / 1000;
      const p = clamp(k / 1.1, 0, 1);
      bar.textContent = `Receiving objects: ${asciiBar(p, 18)} ${Math.round(p * 100)}%`;
      const shown = Math.min(lines.length, Math.max(0, Math.floor((k - 0.8) / 0.35) + 1));
      while (warn.childElementCount < shown) warn.append(h("div.in-line.red", null, lines[warn.childElementCount]));
      const kn = k - 0.8 - lines.length * 0.35;
      if (kn > 0) name.textContent = kit.name.slice(0, Math.floor(kn * 40));
      if (kn > 0.4 && kit.design?.epithet) epithet.textContent = kit.design.epithet;
      if (kn > 0.6) {
        const knots = kit.limbs.filter((l) => l.weakPoint).length;
        const hl = kit.code?.heartLines?.find((l) => l.trim().length > 6)?.trim();
        meta.textContent = `♥ ${kit.heart || "heart"} · ${kit.limbs.length} limbs · ${knots} knots · ${kit.theme}${hl ? `\n  > ${hl}` : ""}`;
      }
      if (performance.now() > introEnd && latest?.status !== "countdown") {
        clearInterval(iv);
        intro.classList.add("out");
        el.classList.remove("intro-on");
        const go = h("div.fight-flash", null, "$ ./fight --now");
        overlay.append(go);
        setTimeout(() => go.remove(), 1100);
        setTimeout(() => intro.remove(), 500);
      }
    }, 50);
  };

  const startPvpIntro = (s: MatchState) => {
    const t0 = performance.now();
    introEnd = t0 + 2600;
    intro.replaceChildren(
      h("div.lb.top"),
      h("div.lb.bot"),
      h(
        "div.in-card",
        null,
        h(
          "div.in-text",
          null,
          h("div.in-line.dim", null, `$ make class ROOM=${app.room}`),
          h("div.in-line.green", null, `${s.players.length} heroes compiled · stats graded from code quality`),
          h("div.in-name", null, "CLASSROOM BRAWL"),
          h("div.in-line.in-epithet", null, s.pvp ? `best of ${s.pvp.rounds} rounds · most KOs wins` : "free-for-all"),
        ),
      ),
    );
    intro.classList.remove("out");
    overlay.append(intro);
    el.classList.add("intro-on");
    const iv = setInterval(() => {
      if (performance.now() > introEnd && latest?.status !== "countdown") {
        clearInterval(iv);
        intro.classList.add("out");
        el.classList.remove("intro-on");
        const go = h("div.fight-flash", null, "$ ./fight --pvp");
        overlay.append(go);
        setTimeout(() => go.remove(), 1100);
        setTimeout(() => intro.remove(), 500);
      }
    }, 50);
  };

  // ---------------- outro ----------------
  let outro: { victory: boolean; at: number } | null = null;
  const result = { outroDone: false };
  const finishOutro = () => {
    if (result.outroDone) return;
    result.outroDone = true;
    app.refresh();
  };
  const startOutro = (victory: boolean) => {
    if (outro) return;
    outro = { victory, at: performance.now() };
    const kit = latest?.boss?.kit;
    setTimeout(() => {
      if (latest && !latest.boss) {
        const ranked = rankPvp(latest);
        const meIdx = ranked.findIndex((r) => r.id === app.you);
        overlay.append(
          h(
            "div.defeat.pvp-end",
            null,
            h("div.df-title", null, "CLASS DISMISSED"),
            h("p", null, `★ ${ranked[0]?.name ?? "—"} wins with ${ranked[0]?.kos ?? 0} KOs`),
            meIdx >= 0 ? h("p", null, `you placed #${meIdx + 1} of ${ranked.length}`) : null,
            h("p.dim", null, "loading report cards…"),
          ),
        );
        return;
      }
      const card = victory
        ? h(
            "div.bsod",
            null,
            h("div.bsod-title", null, ` ${kit?.name ?? "KAIJU"} `),
            h("p", null, `A fatal exception 0E has occurred at ${kit?.heart || "0028:C0011E36"} in VXD KAIJU(01).`),
            h("p", null, "The current boss will be terminated."),
            h("p", null, "*  Segmentation fault (core dumped)"),
            h("p", null, `*  boss: exit 139 (segfault) · squad: exit 0 (victory) after ${fmtTime(latest?.t ?? 0)}`),
            h("p.bsod-press", null, "Press any key to view the autopsy _"),
          )
        : h(
            "div.defeat",
            null,
            h("div.df-title", null, "SQUAD TERMINATED"),
            h("p", null, "Process exited with code 1 (defeat)"),
            h("p", null, `${kit?.name ?? "the boss"} survives. tech debt wins this round.`),
            h("p.dim", null, "loading autopsy…"),
          );
      overlay.append(card);
    }, victory ? 1000 : 500);
    setTimeout(finishOutro, victory ? 3200 : 2000);
  };

  // ---------------- input ----------------
  let destroyed = false;
  let input: InputHandle | null = null;
  let selfPos: { x: number; y: number } | null = null;
  let sendIv: ReturnType<typeof setInterval> | null = null;
  let motionOverlay: HTMLElement | null = null;
  let hint: HTMLElement | null = null;
  let sensorBadge: HTMLElement | null = null;

  const setupInput = async () => {
    void loadModules(); // Optional art must not delay sensor listeners or the input sender.
    if (destroyed || spectator) return;
    if (!loaded.input) {
      console.error("[kaiju] PHONE INPUT FAILURE: real input unavailable; refusing placeholder");
      return;
    }
    input = createInput({ canvas, toArena, getSelf: () => selfPos });
    if (isTouchDevice()) console.info("[kaiju] motion-v2 real input active; waiting for sensor delivery");
    sendIv = setInterval(() => {
      if (!input || !latest || latest.status === "victory" || latest.status === "defeat") return;
      app.conn.send({ t: "input", frame: input.sample() });
      updatePhoneControls();
    }, 1000 / 30);
    if (input.mode === "keyboard") showKeyHint();
    else showMotionFlow();
  };

  const showKeyHint = () => {
    hint = h(
      "div.key-hint",
      null,
      h("span", null, h("kbd", null, "WASD"), " move"),
      h("span", null, h("kbd", null, "MOUSE"), " aim"),
      h("span", null, h("kbd", null, "LMB"), "/", h("kbd", null, "J"), " fire"),
      h("span", null, h("kbd", null, "SPACE"), " dash"),
      h("span", null, h("kbd", null, "E"), " skill"),
      h("span.dim", null, h("kbd", null, "H"), " hide"),
    );
    overlay.append(hint);
    setTimeout(() => hint?.classList.add("fade"), 9000);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === "h" && hint) hint.classList.toggle("fade");
    if (outro && performance.now() - outro.at > 1200) finishOutro();
  };
  addEventListener("keydown", onKey);
  overlay.addEventListener("pointerdown", () => {
    if (outro && performance.now() - outro.at > 1200) finishOutro();
  });
  // phones: first tap goes fullscreen and tries to lock portrait (both may fail; that's fine)
  const lockPortrait = () => {
    if (!isPhone()) return;
    try {
      const d = document.documentElement;
      const lock = () => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("portrait").catch(() => {});
      if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen({ navigationUI: "hide" }).then(lock, () => {});
      else lock();
    } catch {
      /* unsupported */
    }
  };

  // Phones (motion or touch): sensor pill, recalibrate, a compact "enable tilt" pill, and mode-specific hints.
  // Nothing covers the arena during the intro; permission is normally granted in the lobby controls card.
  let enablePill: HTMLButtonElement | null = null;
  let recalBtn: HTMLElement | null = null;
  let tipsShown = false;
  const showMotionFlow = () => {
    sensorBadge = h("div.kj-sensor-status", { "data-testid": "input-sensors" }, "motion: waiting");
    recalBtn = h("button.btn.btn-tiny.recal", { "data-testid": "motion-recalibrate", onclick: () => (input?.calibrate(), vibrate(20)) }, "⟲ recalibrate");
    enablePill = h("button.btn.btn-tiny.enable-pill", { "data-testid": "motion-enable", hidden: true }, "tap to enable tilt") as HTMLButtonElement;
    enablePill.addEventListener("click", (event) => {
      event.stopPropagation();
      // Both native permission calls execute synchronously inside this gesture.
      void input!.requestPermission().then(() => enablePill && (enablePill.hidden = true));
    });
    // portrait: pill + buttons live in the control deck; landscape: top-left of the arena
    if (portrait) sensorRow.append(sensorBadge, enablePill, recalBtn);
    else {
      sensorBadge.classList.add("floating");
      overlay.append(sensorBadge, enablePill, recalBtn);
    }
  };
  /** Called every input tick: keeps the phone controls UI truthful about the live input mode. */
  const updatePhoneControls = () => {
    if (!input || !sensorBadge) return;
    const mode = input.mode, st = input.sensorStatus ?? "off";
    sensorBadge.textContent = mode === "touch" ? "touch controls" : `motion: ${st}`;
    sensorBadge.dataset.status = mode === "touch" ? "touch" : st;
    sensorBadge.dataset.mode = mode;
    if (recalBtn) recalBtn.hidden = mode !== "motion";
    const introOver = performance.now() > introEnd;
    if (enablePill) enablePill.hidden = !(introOver && mode === "motion" && input.needsPermission);
    if (introOver && !tipsShown && latest?.status === "fighting") {
      tipsShown = true;
      const tips = h("div.motion-tips", null, mode === "touch" ? "drag on the arena to move · tap to attack · DASH / SKILL buttons" : "tilt to move · tap or swing to attack · DASH / SKILL buttons");
      overlay.append(tips);
      setTimeout(() => tips.classList.add("fade"), 6000);
      if (mode === "touch") showTouchSplit();
    }
  };
  /** 5s ghost hint over the viewport for touch mode: what the left/right of the arena do. */
  const showTouchSplit = () => {
    const ghost = h("div.touch-ghost", { "aria-hidden": "true" }, h("div.tg-l", null, "MOVE", h("small", null, "drag here")), h("div.tg-r", null, "ATTACK", h("small", null, "tap anywhere")));
    stage.append(ghost);
    const off = () => ghost.classList.add("fade");
    setTimeout(off, 5000);
    addEventListener("pointerdown", off, { once: true });
    setTimeout(() => ghost.remove(), 6500);
  };
  // Portrait works too: removed the old rotate-only blocker and forced landscape lock.

  setupInput();
  // Register AFTER input: fullscreen consumes transient activation. Both iOS sensor
  // permission requests must run first in this same gesture, not after fullscreen.
  addEventListener("pointerdown", lockPortrait, { once: true, capture: true });

  // ---------------- render loop ----------------
  let raf = 0;
  let last = performance.now();
  let visTime = 0;
  let skillCdMax = 1;
  let ambientTick = 0;
  let miniTick = 0;
  // "where am I?": pulsing ring + YOU tag under your hero for the first seconds and after a revive
  let youRingUntil = 0;
  let youRingStarted = false;
  let meWasDown = false;
  const drawYouRing = (me: PlayerState, now: number, scale: number) => {
    const pulse = 0.5 + 0.5 * Math.sin(now * 8);
    const rx = (10 + pulse * 3) * scale, ry = (4 + pulse) * scale;
    ctx.save();
    ctx.strokeStyle = `rgba(255,210,61,${0.55 + 0.45 * pulse})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(Math.round(me.x) + 0.5, Math.round(me.y + 8 * scale) + 0.5, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.fillStyle = "#000";
    ctx.fillText("YOU", Math.round(me.x) + 1, Math.round(me.y + 22 * scale) + 1);
    ctx.fillStyle = "#ffd23d";
    ctx.fillText("YOU", Math.round(me.x), Math.round(me.y + 22 * scale));
    ctx.textAlign = "left";
    ctx.restore();
  };
  let camX = 0;
  let camInit = false;

  // ---------------- portrait: edge indicators + minimap ----------------
  const FONT8 = '8px "Press Start 2P", monospace';
  // pixel triangle whose tip is at (x, y), pointing outward (dir = +1 right edge, -1 left edge)
  const arrow = (x: number, y: number, dir: -1 | 1, col: string) => {
    ctx.fillStyle = "#000";
    for (let i = 0; i <= 6; i++) ctx.fillRect(x - dir * i - (dir > 0 ? 0 : 0), y - i - 1, 1, i * 2 + 3);
    ctx.fillStyle = col;
    for (let i = 1; i <= 5; i++) ctx.fillRect(x - dir * i, y - i + 1, 1, i * 2 - 1);
  };
  const edgeLabel = (x: number, y: number, dir: -1 | 1, text: string, col: string) => {
    ctx.font = FONT8;
    ctx.textBaseline = "middle";
    ctx.textAlign = dir > 0 ? "right" : "left";
    const tx = x - dir * 9;
    ctx.fillStyle = "#000";
    ctx.fillText(text, tx + 1, y + 1);
    ctx.fillStyle = col;
    ctx.fillText(text, tx, y);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  };
  const pixHeart = (x: number, y: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 2, 2);
    ctx.fillRect(x + 3, y, 2, 2);
    ctx.fillRect(x - 0, y + 1, 5, 2);
    ctx.fillRect(x + 1, y + 3, 3, 1);
    ctx.fillRect(x + 2, y + 4, 1, 1);
  };
  const drawIndicators = (s: MatchState, me: PlayerState | null, now: number) => {
    const offscreen = (x: number) => x < view.x + 6 || x > view.x + view.w - 6;
    const place = (x: number, y: number) => {
      const dir: -1 | 1 = x < view.x ? -1 : 1;
      return { ex: dir < 0 ? 2 : view.w - 2, ey: clamp(y - view.y, 22, view.h - 14), dir };
    };
    const pulse = 0.5 + 0.5 * Math.sin(now * 10);
    // boss (or an attack aimed at you, which outranks it)
    const b = s.boss;
    if (b && offscreen(b.x)) {
      const { ex, ey, dir } = place(b.x, b.y);
      const atMe = !!b.casting && b.targetPlayer === app.you;
      if (atMe) {
        const name = b.kit.attacks.find((a) => a.id === b.casting!.attackId)?.name ?? "incoming";
        arrow(dir < 0 ? ex + 6 : ex, ey, dir, pulse > 0.5 ? "#ff3355" : "#ffd23d");
        edgeLabel(dir < 0 ? ex + 6 : ex, ey, dir, `! ${name.slice(0, 16)}`, "#ff3355");
      } else {
        arrow(dir < 0 ? ex + 6 : ex, ey, dir, "#ff3355");
        pixHeart(dir < 0 ? ex + 9 : ex - 15, ey - 2, pulse > 0.3 ? "#ff3355" : "#ff8fa0");
        edgeLabel(dir < 0 ? ex + 10 : ex - 4, ey, dir, "BOSS", "#ffd0d8");
      }
    }
    // downed teammates
    for (const p of s.players) {
      if (p.alive || p.id === app.you || !offscreen(p.x)) continue;
      const { ex, ey, dir } = place(p.x, p.y);
      arrow(dir < 0 ? ex + 6 : ex, ey, dir, "#39ff88");
      edgeLabel(dir < 0 ? ex + 6 : ex, ey, dir, `${p.name.slice(0, 8)} ${Math.round(p.reviveProgress * 100)}%`, "#39ff88");
    }
    void me;
  };
  const drawMinimap = (s: MatchState, now: number) => {
    const g = mctx, k = 0.25;
    g.clearRect(0, 0, minimap.width, minimap.height);
    g.fillStyle = "rgba(3,6,5,.78)";
    g.fillRect(0, 0, minimap.width, minimap.height);
    // faint "code" rows like an editor minimap, shaped by the boss's real heart lines
    const lines = s.boss?.kit.code?.heartLines?.length ? s.boss.kit.code.heartLines : ["function f() {", "  return x;", "}"];
    const SYN = ["rgba(97,175,239,.16)", "rgba(198,120,221,.16)", "rgba(152,195,121,.14)", "rgba(171,178,191,.1)"];
    for (let row = 0, i = 0; row < minimap.height; row += 3, i++) {
      const ln = lines[i % lines.length];
      const indent = Math.min(16, (ln.length - ln.trimStart().length) * 2);
      const words = ln.trim().split(/\s+/);
      let x = 2 + indent;
      for (let w = 0; w < words.length && x < minimap.width - 2; w++) {
        const len = Math.max(2, Math.min(18, words[w].length * 1.5));
        g.fillStyle = SYN[(i + w) % SYN.length];
        g.fillRect(x, row + 1, len, 1);
        x += len + 2;
      }
    }
    g.fillStyle = "#24343c";
    for (const o of s.obstacles ?? []) g.fillRect(Math.round((o.x - o.w / 2) * k), Math.round((o.y - o.h / 2) * k), Math.max(2, Math.round(o.w * k)), Math.max(2, Math.round(o.h * k)));
    if (s.perkOffer) {
      g.fillStyle = "#39ff88";
      for (const pad of s.perkOffer.pads) g.fillRect(Math.round(pad.x * k) - 2, Math.round(pad.y * k) - 2, 4, 4);
    }
    for (const z of s.hazards) {
      g.fillStyle = z.armed ? "rgba(255,51,85,.8)" : "rgba(255,51,85,.4)";
      if (z.kind === "laser") {
        for (let d = 0; d < 140; d += 4) g.fillRect(Math.round((z.x + Math.cos(z.angle) * d) * k), Math.round((z.y + Math.sin(z.angle) * d) * k), 1, 1);
      } else g.fillRect(Math.round((z.x - z.r) * k), Math.round((z.y - z.r) * k), Math.max(2, Math.round(z.r * 2 * k)), Math.max(2, Math.round(z.r * 2 * k)));
    }
    const PK: Record<string, string> = { heart: "#ff3355", energy: "#3de8ff", armor: "#c8d4e0" };
    for (const p of s.pickups ?? []) {
      g.fillStyle = PK[p.kind] ?? "#fff";
      g.fillRect(Math.round(p.x * k), Math.round(p.y * k), 1, 1);
    }
    g.fillStyle = "#8a1328";
    for (const r of s.boss?.regions ?? []) g.fillRect(Math.round((r.x - r.r) * k), Math.round((r.y - r.r) * k), Math.max(2, Math.round(r.r * 2 * k)), Math.max(2, Math.round(r.r * 2 * k)));
    g.fillStyle = "#ff3355";
    if (s.boss) g.fillRect(Math.round(s.boss.x * k) - 1, Math.round(s.boss.y * k) - 1, 3, 3);
    for (const p of s.players) {
      if (p.id === app.you) continue;
      g.fillStyle = "#000";
      g.fillRect(Math.round(p.x * k) - 2, Math.round(p.y * k) - 2, 4, 4);
      g.fillStyle = p.alive ? "#3de8ff" : "#777";
      g.fillRect(Math.round(p.x * k) - 1, Math.round(p.y * k) - 1, 2, 2);
    }
    const me = s.players.find((p) => p.id === app.you);
    if (me) {
      g.fillStyle = "#000";
      g.fillRect(Math.round(me.x * k) - 3, Math.round(me.y * k) - 3, 6, 6);
      g.fillStyle = Math.floor(now * 4) % 2 ? "#ffffff" : "#ffd23d";
      g.fillRect(Math.round(me.x * k) - 2, Math.round(me.y * k) - 2, 4, 4);
    }
    g.strokeStyle = "rgba(255,255,255,.55)";
    g.strokeRect(Math.round(view.x * k) + 0.5, 0.5, Math.round(view.w * k) - 1, minimap.height - 1);
  };

  const interp = (rt: number): MatchState | null => {
    if (!snaps.length) return null;
    let a = snaps[0], b = snaps[snaps.length - 1];
    if (rt <= a.t) b = a;
    else if (rt >= b.t) a = b;
    else
      for (let i = snaps.length - 1; i > 0; i--) {
        if (snaps[i - 1].t <= rt) {
          a = snaps[i - 1];
          b = snaps[i];
          break;
        }
      }
    const span = b.t - a.t;
    const f = span > 0 ? clamp((rt - a.t) / span, 0, 1) : 1;
    const S = b.s, A = a.s;
    const players: PlayerState[] = S.players.map((p) => {
      const q = A.players.find((x) => x.id === p.id);
      if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 80) return p;
      return { ...p, x: lerp(q.x, p.x, f), y: lerp(q.y, p.y, f) };
    });
    const SB = S.boss, AB = A.boss ?? S.boss;
    const dtB = clamp(rt - b.t, -0.15, 0.1);
    const bullets = S.bullets.map((u) => ({ ...u, x: u.x + u.vx * dtB, y: u.y + u.vy * dtB }));
    const minions = S.minions.map((m) => {
      const q = A.minions.find((x) => x.id === m.id);
      return q ? { ...m, x: lerp(q.x, m.x, f), y: lerp(q.y, m.y, f) } : m;
    });
    const hazards = S.hazards.map((z) => ({ ...z, t: clamp(z.t + dtB, 0, z.total) }));
    let boss: MatchState["boss"] = null;
    if (SB && AB) {
      const regions = (SB.regions ?? []).map((r) => {
        const q = AB.regions?.find((x) => x.id === r.id);
        return q ? { ...r, x: lerp(q.x, r.x, f), y: lerp(q.y, r.y, f) } : r;
      });
      const casting = SB.casting ? { ...SB.casting, t: clamp(SB.casting.t + dtB, 0, SB.casting.total) } : null;
      boss = { ...SB, x: lerp(AB.x, SB.x, f), y: lerp(AB.y, SB.y, f), regions, casting };
    }
    return { ...S, t: lerp(A.t, S.t, f), players, bullets, minions, hazards, boss };
  };

  const frame = (nowMs: number) => {
    raf = requestAnimationFrame(frame);
    const dtReal = Math.min(0.1, (nowMs - last) / 1000);
    last = nowMs;
    const now = nowMs / 1000;

    // time dilation
    let rate = 1;
    if (hitstop > 0) {
      hitstop -= dtReal;
      rate = 0;
    } else if (slowmo > 0) {
      slowmo -= dtReal;
      rate = 0.3;
    }
    lag += dtReal * (1 - rate);
    if (rate === 1 && lag > 0) lag = Math.max(0, lag - dtReal * 0.35);
    lag = Math.min(lag, 0.8);
    visTime += dtReal * rate;

    if (offset === null) {
      drawWaiting(now);
      return;
    }
    const rt = now - offset - BUFFER - lag;
    while (pendingEvents.length && pendingEvents[0].t <= rt) releasedEvents.push(pendingEvents.shift()!.e);
    const s = interp(rt);
    if (!s) return;
    for (const e of releasedEvents) handleEvent(e, s);

    const me = s.players.find((p) => p.id === app.you);
    selfPos = me ? { x: me.x, y: me.y } : null;
    if (me && me.alive && meWasDown) youRingUntil = Math.max(youRingUntil, performance.now() + 3000); // respawn / revive
    meWasDown = !!me && !me.alive;

    // camera
    trauma = Math.max(0, trauma - dtReal * 1.6);
    const sh = trauma * trauma;
    nudge[0] *= Math.exp(-dtReal * 12);
    nudge[1] *= Math.exp(-dtReal * 12);
    const sx = Math.round((Math.random() * 2 - 1) * sh * 7 + nudge[0]);
    const sy = Math.round((Math.random() * 2 - 1) * sh * 7 + nudge[1]);
    zoom = lerp(zoom, 1, performance.now() < introEnd - 900 ? 0.01 : 0.06);
    if (zoom < 1.003) zoom = 1;

    // camera: portrait follows the hero (slight lead in the move direction); the intro looks at the boss first
    if (view.w < ARENA_W) {
      const focus = (performance.now() < introEnd - 600 || !me) && s.boss ? s.boss.x : me ? me.x + clamp(me.vx * 0.35, -36, 36) : ARENA_W / 2;
      const target = clamp(focus - view.w / 2, 0, ARENA_W - view.w);
      camX = camInit ? camX + (target - camX) * (1 - Math.exp(-dtReal * 5)) : target;
      camInit = true;
      view.x = Math.round(camX);
    }
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.save();
    {
      const zx = zoom === 1 ? view.x + view.w / 2 : clamp(zoomTarget[0], view.w / 2 / zoom, ARENA_W - view.w / 2 / zoom);
      const zy = zoom === 1 ? view.y + view.h / 2 : clamp(zoomTarget[1], view.h / 2 / zoom, ARENA_H - view.h / 2 / zoom);
      ctx.translate(view.w / 2, view.h / 2);
      if (zoom !== 1) ctx.scale(zoom, zoom);
      ctx.translate(-zx, -zy);
    }
    ctx.translate(sx, sy);
    X.trackPlayers(s.players);
    const tgt = s.boss ? s.players.find((p) => p.id === s.boss!.targetPlayer) : null;
    if (tgt) X.bossLookAt(tgt.x, tgt.y);
    safe("drawArenaBackground", R.drawArenaBackground, ctx, arenaTheme(s), s.boss?.kit.seed ?? arenaSeed, visTime);
    safe("drawPerkPads", R.drawPerkPads, ctx, s.perkOffer ?? null, s.players, visTime);
    safe("drawObstacles", R.drawObstacles, ctx, s.obstacles ?? [], visTime);
    safe("drawPickups", R.drawPickups, ctx, s.pickups ?? [], visTime);
    safe("drawHazards", R.drawHazards, ctx, s.hazards, visTime);
    safe("drawMinions", R.drawMinions, ctx, s.minions, visTime);
    if (s.boss) safe("drawBoss", R.drawBoss, ctx, s.boss, visTime);
    const order = [...s.players].sort((a, b) => a.y - b.y);
    for (const p of order) safe("drawPlayer", R.drawPlayer, ctx, p, visTime, p.id === app.you);
    if (me && me.alive && performance.now() < youRingUntil) drawYouRing(me, now, s.heroScale ?? 1);
    safe("drawBullets", R.drawBullets, ctx, s.bullets, visTime);
    safe("drawEvents", R.drawEvents, ctx, releasedEvents, visTime, view);
    ctx.restore();
    safe("drawPostFx", R.drawPostFx, ctx, visTime, sh, view);
    if (portrait) {
      drawIndicators(s, me ?? null, now);
      if ((miniTick = (miniTick + 1) % 2) === 0) drawMinimap(s, now);
    }
    if ((ambientTick = (ambientTick + 1) % 3) === 0) actx.drawImage(canvas, 0, 0, ambient.width, ambient.height);
    releasedEvents.length = 0;

    // DOM fx
    flashA = Math.max(0, flashA - dtReal * 3);
    flash.style.background = flashA > 0.01 ? `rgba(${flashCol},${flashA.toFixed(3)})` : "transparent";
    stage.classList.toggle("glitch", performance.now() < glitchUntil);
    let inDanger = false;
    if (me && me.alive)
      for (const z of s.hazards) {
        if (z.armed || z.kind === "firewall") continue;
        if (z.kind === "laser") {
          const dx = me.x - z.x, dy = me.y - z.y;
          const along = dx * Math.cos(z.angle) + dy * Math.sin(z.angle);
          const perp = Math.abs(-dx * Math.sin(z.angle) + dy * Math.cos(z.angle));
          if (along > 0 && perp < z.r + 6) inDanger = true;
        } else if (Math.hypot(me.x - z.x, me.y - z.y) < z.r + 6) inDanger = true;
      }
    danger.classList.toggle("on", inDanger);
    stage.classList.toggle("enraged", !!s.boss && (s.boss.enraged || s.boss.phase >= 2));

    hud.update(s, app.you, input?.mode ?? null);
    if (me) {
      // on-screen DASH/SKILL buttons (touch fallback and motion-v2) get cooldown fill + countdown
      const sk = document.querySelector<HTMLElement>(".kj-touch-skill");
      const da = document.querySelector<HTMLElement>(".kj-touch-dash");
      skillCdMax = Math.max(skillCdMax, me.skillCd);
      if (sk) {
        sk.style.setProperty("--cd", me.skillCd > 0 ? (1 - me.skillCd / skillCdMax).toFixed(2) : "1");
        sk.dataset.ready = me.skillCd > 0 ? "0" : "1";
        sk.dataset.cd = me.skillCd > 0 ? me.skillCd.toFixed(1) : "";
        sk.dataset.code = `$ ${me.kit.skill}`;
      }
      if (da) {
        da.style.setProperty("--cd", me.dashCd > 0 ? Math.max(0, 1 - me.dashCd / 1.2).toFixed(2) : "1");
        da.dataset.ready = me.dashCd > 0 ? "0" : "1";
        da.dataset.cd = me.dashCd > 0 ? me.dashCd.toFixed(1) : "";
      }
    }
    const mapKey = s.boss?.kit.repo ?? "pvp";
    if (portrait && miniTab.dataset.boss !== mapKey) {
      miniTab.dataset.boss = mapKey;
      miniTab.textContent = s.boss ? `▾ ${(s.boss.kit.heart || "arena").split("/").pop()} · map` : "▾ classroom.map";
    }
    if (s.status === "fighting" && !youRingStarted && performance.now() > introEnd) {
      youRingStarted = true;
      youRingUntil = performance.now() + 10000;
    }
    if (s.status === "fighting") {
      if (!nextTaunt) nextTaunt = performance.now() + 5000;
      else if (performance.now() > nextTaunt) taunt(s);
    }
    const showBubble = performance.now() < bubbleUntil && !!s.boss;
    bubble.classList.toggle("show", showBubble);
    if (showBubble) {
      const b = s.boss!;
      const top = b.regions?.length ? Math.min(...b.regions.map((r) => r.y - r.r)) : b.y - 50;
      bubble.style.left = `${stage.offsetLeft + clamp(b.x - view.x, 30, view.w - 30) * cssScale}px`;
      bubble.style.top = `${stage.offsetTop + Math.max(20, top) * cssScale}px`;
    }
    if (motionOverlay && input && (!input.needsPermission || input.mode !== "motion")) {
      motionOverlay.remove();
      motionOverlay = null;
    }
  };

  const drawWaiting = (now: number) => {
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = "#39ff88";
    ctx.textAlign = "center";
    ctx.fillText(`booting arena${".".repeat(Math.floor(now * 3) % 4)}`, view.w / 2, view.h / 2);
    ctx.textAlign = "left";
  };
  raf = requestAnimationFrame(frame);

  return Object.assign(result, {
    el,
    onMsg(m: ServerMsg) {
      if (m.t === "snapshot") onSnapshot(m.state);
      if (m.t === "autopsy" && !outro) startOutro(m.result.victory);
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      removeEventListener("resize", layout);
      safeProbe.remove();
      document.body.append(muteBtn);
      removeEventListener("keydown", onKey);
      if (sendIv) clearInterval(sendIv);
      input?.dispose();
      feed?.dispose();
      quiz?.dispose();
      el.remove();
    },
  });
}
