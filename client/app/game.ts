// Game screen: integer-scaled 480x288 pixel canvas, snapshot interpolation (~100ms buffer), render composition,
// camera shake / hit-stop / slow-mo driven by events, boss intro + victory/defeat outro, input + motion setup.
import type { GameEvent, MatchState, PlayerState, ServerMsg } from "../../shared/types";
import { ARENA_H, ARENA_W } from "../../shared/types";
import { type AppCtx, type Screen } from "./app";
import { createHud } from "./hud";
import { audio } from "./sound";
import { bossPortraitCanvas } from "./lobby";
import { type InputHandle, R, X, createInput, loadModules, loaded, safe } from "./renderers";
import { asciiBar, clamp, fmtTime, h, isTouchDevice, lerp, vibrate } from "./util";

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
  const el = h("div.screen.game.waiting", null, ambient, stage, hud.el, overlay);

  // ---------------- layout ----------------
  let cssScale = 1;
  const layout = () => {
    const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
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
    el.classList.toggle("portrait", H > W && isTouchDevice());
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
    return [((cx - r.left) / r.width) * ARENA_W, ((cy - r.top) / r.height) * ARENA_H];
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
    audio.music(s.status === "victory" || s.status === "defeat" ? s.status : s.boss.kit.theme, s.boss.phase);
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
    if (!introStarted && (s.status === "countdown" || s.t < 1.2)) startIntro(s);
    introStarted = true;
  };

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
  const kick = (t: number, stop = 0, slow = 0) => {
    trauma = Math.min(1, trauma + t);
    // small hit-stops are rate-limited so rapid-fire crits don't turn into a stutter
    const now = performance.now();
    if (stop >= 0.06 || (stop > 0 && now - lastStopAt > 350)) {
      hitstop = Math.max(hitstop, stop);
      lastStopAt = now;
    }
    slowmo = Math.max(slowmo, slow);
  };
  const doFlash = (a: number, col = "255,255,255") => {
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
        glitchUntil = performance.now() + 700;
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
    const lines = s.boss.kit.design?.taunts;
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
    const kit = latest?.boss.kit;
    setTimeout(() => {
      const card = victory
        ? h(
            "div.bsod",
            null,
            h("div.bsod-title", null, ` ${kit?.name ?? "KAIJU"} `),
            h("p", null, `A fatal exception 0E has occurred at ${kit?.heart || "0028:C0011E36"} in VXD KAIJU(01).`),
            h("p", null, "The current boss will be terminated."),
            h("p", null, "*  Segmentation fault (core dumped)"),
            h("p", null, `*  exit 139 after ${fmtTime(latest?.t ?? 0)}`),
            h("p.bsod-press", null, "Press any key to view the autopsy _"),
          )
        : h(
            "div.defeat",
            null,
            h("div.df-title", null, "SQUAD TERMINATED"),
            h("p", null, "Killed: out of memory (exit 137)"),
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
      if (sensorBadge) {
        sensorBadge.textContent = `sensors: ${input.sensorStatus ?? "off"}`;
        sensorBadge.dataset.status = input.sensorStatus ?? "off";
        sensorBadge.dataset.mode = input.mode;
      }
    }, 1000 / 30);
    if (input.mode === "motion") showMotionFlow();
    else if (input.mode === "keyboard") showKeyHint();
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

  const showMotionFlow = () => {
    sensorBadge = h("div.kj-sensor-status", { "data-testid": "input-sensors" }, "sensors: waiting");
    Object.assign(sensorBadge.style, { position: "absolute", left: "8px", top: "32px", font: "12px monospace", color: "#9df5c4", pointerEvents: "none" });
    overlay.append(sensorBadge);
    const recal = h("button.btn.btn-tiny.recal", { "data-testid": "motion-recalibrate", onclick: () => (input?.calibrate(), vibrate(20)) }, "⟲ recalibrate");
    overlay.append(recal);
    const tips = h("div.motion-tips", null, "tilt = move · tap / swing = attack · DASH / SKILL buttons");
    Object.assign(tips.style, { whiteSpace: "normal", textAlign: "center", fontSize: "12px", bottom: "28px", width: "70%" });
    overlay.append(tips);
    setTimeout(() => tips.classList.add("fade"), 6000);
    if (!input?.needsPermission) return; // neutral auto-calibrates, no mandatory second tap
    const enable = h("button.btn.btn-big.btn-primary", { "data-testid": "motion-enable" }, "TAP TO ENABLE SENSORS");
    motionOverlay = h("div.motion-flow", null,
      h("div.mf-title", null, "$ sudo enable-sensors"),
      h("div.mf-sub", null, "Hold comfortably. Neutral calibrates automatically; tilt to move, tap or swing to attack."), enable);
    enable.addEventListener("click", event => {
      event.stopPropagation();
      // Both native permission calls execute synchronously inside this gesture.
      const request = input!.requestPermission();
      void request.then(() => { motionOverlay?.remove(); motionOverlay = null; });
    });
    overlay.append(motionOverlay);
  };
  // Portrait works too: removed the old rotate-only blocker and forced landscape lock.

  setupInput();

  // ---------------- render loop ----------------
  let raf = 0;
  let last = performance.now();
  let visTime = 0;
  let skillCdMax = 1;
  let ambientTick = 0;

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
    const bx = lerp(A.boss.x, S.boss.x, f), by = lerp(A.boss.y, S.boss.y, f);
    const regions = (S.boss.regions ?? []).map((r) => {
      const q = A.boss.regions?.find((x) => x.id === r.id);
      return q ? { ...r, x: lerp(q.x, r.x, f), y: lerp(q.y, r.y, f) } : r;
    });
    const dtB = clamp(rt - b.t, -0.15, 0.1);
    const bullets = S.bullets.map((u) => ({ ...u, x: u.x + u.vx * dtB, y: u.y + u.vy * dtB }));
    const minions = S.minions.map((m) => {
      const q = A.minions.find((x) => x.id === m.id);
      return q ? { ...m, x: lerp(q.x, m.x, f), y: lerp(q.y, m.y, f) } : m;
    });
    const hazards = S.hazards.map((z) => ({ ...z, t: clamp(z.t + dtB, 0, z.total) }));
    const casting = S.boss.casting ? { ...S.boss.casting, t: clamp(S.boss.casting.t + dtB, 0, S.boss.casting.total) } : null;
    return { ...S, t: lerp(A.t, S.t, f), players, bullets, minions, hazards, boss: { ...S.boss, x: bx, y: by, regions, casting } };
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

    // camera
    trauma = Math.max(0, trauma - dtReal * 1.6);
    const sh = trauma * trauma;
    nudge[0] *= Math.exp(-dtReal * 12);
    nudge[1] *= Math.exp(-dtReal * 12);
    const sx = Math.round((Math.random() * 2 - 1) * sh * 7 + nudge[0]);
    const sy = Math.round((Math.random() * 2 - 1) * sh * 7 + nudge[1]);
    zoom = lerp(zoom, 1, performance.now() < introEnd - 900 ? 0.01 : 0.06);
    if (zoom < 1.003) zoom = 1;

    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    ctx.save();
    if (zoom !== 1) {
      const zx = clamp(zoomTarget[0], ARENA_W / 2 / zoom, ARENA_W - ARENA_W / 2 / zoom);
      const zy = clamp(zoomTarget[1], ARENA_H / 2 / zoom, ARENA_H - ARENA_H / 2 / zoom);
      ctx.translate(ARENA_W / 2, ARENA_H / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-zx, -zy);
    }
    ctx.translate(sx, sy);
    const kit = s.boss.kit;
    X.trackPlayers(s.players);
    const tgt = s.players.find((p) => p.id === s.boss.targetPlayer);
    if (tgt) X.bossLookAt(tgt.x, tgt.y);
    safe("drawArenaBackground", R.drawArenaBackground, ctx, kit.theme, kit.seed, visTime);
    safe("drawPerkPads", R.drawPerkPads, ctx, s.perkOffer ?? null, s.players, visTime);
    safe("drawObstacles", R.drawObstacles, ctx, s.obstacles ?? [], visTime);
    safe("drawPickups", R.drawPickups, ctx, s.pickups ?? [], visTime);
    safe("drawHazards", R.drawHazards, ctx, s.hazards, visTime);
    safe("drawMinions", R.drawMinions, ctx, s.minions, visTime);
    safe("drawBoss", R.drawBoss, ctx, s.boss, visTime);
    const order = [...s.players].sort((a, b) => a.y - b.y);
    for (const p of order) safe("drawPlayer", R.drawPlayer, ctx, p, visTime, p.id === app.you);
    safe("drawBullets", R.drawBullets, ctx, s.bullets, visTime);
    safe("drawEvents", R.drawEvents, ctx, releasedEvents, visTime);
    ctx.restore();
    safe("drawPostFx", R.drawPostFx, ctx, visTime, sh);
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
    stage.classList.toggle("enraged", s.boss.enraged || s.boss.phase >= 2);

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
      }
      if (da) {
        da.style.setProperty("--cd", me.dashCd > 0 ? Math.max(0, 1 - me.dashCd / 1.2).toFixed(2) : "1");
        da.dataset.ready = me.dashCd > 0 ? "0" : "1";
        da.dataset.cd = me.dashCd > 0 ? me.dashCd.toFixed(1) : "";
      }
    }
    if (s.status === "fighting") {
      if (!nextTaunt) nextTaunt = performance.now() + 5000;
      else if (performance.now() > nextTaunt) taunt(s);
    }
    const showBubble = performance.now() < bubbleUntil;
    bubble.classList.toggle("show", showBubble);
    if (showBubble) {
      const top = s.boss.regions?.length ? Math.min(...s.boss.regions.map((r) => r.y - r.r)) : s.boss.y - 50;
      bubble.style.left = `${stage.offsetLeft + s.boss.x * cssScale}px`;
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
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = "#39ff88";
    ctx.textAlign = "center";
    ctx.fillText(`booting arena${".".repeat(Math.floor(now * 3) % 4)}`, ARENA_W / 2, ARENA_H / 2);
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
      removeEventListener("keydown", onKey);
      if (sendIv) clearInterval(sendIv);
      input?.dispose();
      el.remove();
    },
  });
}
