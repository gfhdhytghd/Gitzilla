// Phone-as-controller visuals (claude-auth). One player on two devices, linked by GitHub account:
// the display (computer / Vision Pro) keeps the game, a signed-in phone drives the same seat.
// Pure views: networking (my-seat lookup, controller hello, resume token, reconnect) lives in take-ui's
// controller-link.ts, which feeds these components and receives their callbacks.
import './pair.css';
import type { LobbyState, MatchState, PlayerKit, PlayerState, ServerMsg } from '../../shared/types';
import type { AppCtx } from './app';
import type { ConnStatus } from './net';
import type { ControllerLink } from './controller-link';
import { locale, onLocaleChange } from '../i18n';
import { tr, useLocale } from './pair-copy';
import { createInput, getMotionPermissionState, subscribeMotionPermission, vibrate, type InputController } from '../input';
import { createControlsCard } from './controls';
import { fetchMe, type GhUser } from './github';
import { R, loadModules } from './renderers';
import { openControlTraining } from './training';
import { clamp, h, isPhone } from './util';


useLocale(locale);

const signInHere = () => location.assign(`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`);
/** Link the phone opens: the room itself; a signed-in phone that owns a seat there is offered controller mode. */
export const controllerUrl = (room: string) => `${location.origin}/r/${room}`;

function portrait(kit: PlayerKit | null | undefined, size: number): HTMLElement {
  const box = h('div.pc-portrait', { style: `width:${size}px;height:${size}px` });
  if (!kit) return box;
  const paint = () => { try { box.replaceChildren(R.playerPortrait(kit, size)); } catch { /* placeholder art */ } };
  paint();
  void loadModules().then(paint);
  return box;
}

// ---------- display side: lobby you-panel + game/XR pre-entry overlay ----------

export interface PairPanel { el: HTMLElement; update(app: AppCtx): void; destroy(): void }

/**
 * "📱 Use your phone as the controller" for the display device's own player seat. Hidden on phones, for spectator screens,
 * in the classroom, and when GitHub sign-in is disabled. `onUnlink` defaults to sending `pairEnd` on the room socket.
 */
export function pairPanel(app: AppCtx, opts: { onUnlink?: () => void; compact?: boolean } = {}): PairPanel {
  const el = h('section.pair-panel', { 'data-testid': 'pair-panel', hidden: true });
  if (opts.compact) el.classList.add('compact');
  let me: { enabled: boolean; user: GhUser | null } | null = null;
  let ctx = app;
  let copiedUntil = 0;
  let sig = '';
  void fetchMe().then(r => { me = r; render(true); });

  const copyLink = async (room: string) => {
    const url = controllerUrl(room);
    try { await navigator.clipboard.writeText(url); }
    catch { // http / old WebKit: select-and-copy fallback
      const ta = h('textarea', { style: 'position:fixed;opacity:0' }, url) as HTMLTextAreaElement;
      document.body.append(ta); ta.select(); try { document.execCommand('copy'); } catch { /* nothing else to try */ } ta.remove();
    }
    copiedUntil = Date.now() + 1800; render(true);
    setTimeout(() => render(true), 1900);
  };

  function render(force = false) {
    const lobby = ctx.lobby, seat = lobby?.players.find(p => p.id === ctx.you);
    // only a signed-in player seat can bind a phone (spectator screens can't)
    const show = !!me?.enabled && !!seat && !seat.bot && ctx.role === 'player' && lobby?.mode !== 'edu' && !isPhone();
    const state = !show ? 'hidden' : seat!.paired ? 'paired' : me!.user ? 'signed' : 'signin';
    const next = [state, locale(), lobby?.room, me?.user?.login, Date.now() < copiedUntil].join('|');
    if (!force && next === sig) return;
    sig = next;
    el.hidden = !show; el.dataset.state = state;
    if (!show) { el.replaceChildren(); return; }
    const room = lobby!.room;
    if (state === 'paired') {
      el.replaceChildren(
        h('div.pp-head.ok', { 'data-testid': 'pair-connected' }, tr('connected')),
        h('div.pp-sub', null, tr('connectedSub')),
        h('button.btn.btn-tiny.pp-unlink', { 'data-testid': 'pair-unlink', onclick: () => (opts.onUnlink ?? (() => ctx.conn.send({ t: 'pairEnd' })))() }, tr('disconnect')),
      );
      return;
    }
    const head = h('div.pp-head', null, tr('useTitle'));
    if (state === 'signin') {
      el.replaceChildren(head, h('div.pp-sub', null, tr('signInBoth')),
        h('button.btn.btn-primary.pp-connect', { 'data-testid': 'pair-connect-github', onclick: signInHere }, h('span.gh-mark', { 'aria-hidden': 'true' }, '◉'), ' ', tr('connect')));
      return;
    }
    const host = location.host;
    const user = me!.user!;
    const line = tr('openOn', '\u0000', '\u0001').split(/(\u0000|\u0001)/).map(part =>
      part === '\u0000' ? h('b.pp-url', { translate: 'no' }, `${host}/r/${room}`) : part === '\u0001' ? h('b.pp-login', { translate: 'no' }, `@${user.login}`) : part);
    const copied = Date.now() < copiedUntil;
    el.replaceChildren(
      head,
      h('div.pp-row', null,
        h('div.pp-code', { 'data-testid': 'pair-room-code', translate: 'no', 'aria-label': `${tr('room')} ${room}` }, h('small', null, tr('room')), room),
        h('div.pp-text', null,
          h('div.pp-open', null, ...line),
          h('button.btn.btn-tiny.pp-copy', { 'data-testid': 'pair-copy-link', class: copied ? 'copied' : undefined, onclick: () => void copyLink(room) }, copied ? tr('copied') : tr('copy')))),
      h('div.pp-sub.dim', null, tr('stays')),
    );
  }

  const stopLocale = onLocaleChange(() => render(true));
  render(true);
  return {
    el,
    update(a) { ctx = a; render(); },
    destroy() { stopLocale(); el.remove(); },
  };
}

// ---------- phone side: offer card ----------

export interface ControllerOfferOpts {
  room: string;
  /** The seat this GitHub user owns on another device (GET /api/rooms/:code/my-seat). */
  seat: { seatId?: string; name: string; paired: boolean } | null;
  /** Signed-in GitHub user; fetched from /api/me when omitted. null → the card shows "Connect GitHub". */
  user?: GhUser | null;
  /** "Use this phone as the controller…" */
  onConnect(): void;
  /** "play on this phone instead" */
  onSkip(): void;
}
export interface ControllerOffer { el: HTMLElement; setBusy(busy: boolean): void; setError(message: string | null): void; destroy(): void }

/** Full-screen one-tap card on a phone: "Use this phone as the controller for your seat on the big screen". */
export function createControllerOffer(opts: ControllerOfferOpts): ControllerOffer {
  const el = h('div.screen.controller-offer', { 'data-testid': 'controller-offer' });
  let busy = false, error: string | null = null;
  let user: GhUser | null = opts.user ?? null;
  if (opts.user === undefined) void fetchMe().then(r => { user = r.user; render(); });
  const render = () => {
    const signed = opts.user === undefined ? true : !!user; // a my-seat hit already proves the GitHub session
    el.replaceChildren(h('div.term-window', null,
      h('div.term-title', null, h('span.dots', null, '● ● ●'), ` gitzilla@room-${opts.room}`),
      h('div.term-body.co-body', null,
        h('div.co-phone', { 'aria-hidden': 'true' }, h('div.co-screen', null, '🎮')),
        h('h2.co-title', null, tr('offerTitle')),
        signed
          ? h('div.co-who', null, user?.avatar ? h('img.co-avatar', { src: user.avatar, alt: '' }) : null,
              h('span', { translate: 'no' }, tr('offerSeat', user ? `@${user.login}` : 'GitHub', opts.seat?.name ?? '…')))
          : h('div.co-who', null, tr('offerSignIn')),
        signed && opts.seat?.paired ? h('div.co-warn', null, tr('offerTakeover')) : null,
        error ? h('div.co-err', { role: 'alert', 'data-testid': 'controller-offer-error' }, `✗ ${error}`) : null,
        signed
          ? h('button.btn.btn-primary.co-use', { 'data-testid': 'controller-use', disabled: busy, onclick: () => { if (!busy) opts.onConnect(); } },
              busy ? tr('linking') : error ? tr('tryAgain') : tr('offerUse'))
          : h('button.btn.btn-primary.co-use', { 'data-testid': 'controller-connect-github', onclick: signInHere }, h('span.gh-mark', { 'aria-hidden': 'true' }, '◉'), ' ', tr('connect')),
        h('button.btn-link.co-here', { 'data-testid': 'controller-play-here', onclick: () => opts.onSkip() }, tr('offerPlayHere')),
      )));
  };
  const stopLocale = onLocaleChange(render);
  render();
  return {
    el,
    setBusy(b) { busy = b; render(); },
    setError(m) { error = m; busy = false; render(); },
    destroy() { stopLocale(); el.remove(); },
  };
}

// ---------- phone side: controller screen ----------

export interface ControllerScreenOpts {
  room: string;
  /** take-ui's controller-link.ts transport: sends input/controls, publishes state (open/replaced/kicked/unlinked…). */
  link: ControllerLink;
  /** The disconnect button. Default: link.unlink() and the "Phone disconnected" end card. */
  onDisconnect?(): void;
  /** After an unlink / takeover / error: link this phone again (end-card button when given). */
  relink?(): void;
  /** Leave controller mode and join this room as a normal player on the phone (end-card link when given). */
  playHere?(): void;
}
export interface ControllerScreen { el: HTMLElement; destroy(): void }
type EndKind = 'unlinked' | 'replaced' | 'kicked' | 'error';

type Bar = { el: HTMLElement; fill: HTMLElement; val: HTMLElement };
const bar = (cls: string, label: string): Bar => {
  const fill = h('i'), val = h('b');
  return { el: h(`div.cs-bar.${cls}`, null, h('span', null, label), h('div.cs-track', null, fill), val), fill, val };
};
const setBar = (b: Bar, v: number, max: number) => {
  b.fill.style.width = `${clamp(max > 0 ? v / max : 0, 0, 1) * 100}%`;
  const txt = `${Math.ceil(Math.max(0, v))}/${Math.round(max)}`;
  if (b.val.textContent !== txt) b.val.textContent = txt;
};

/**
 * The phone's controller screen (no arena canvas): hero + HP/armor/energy, a touch pad with a joystick ghost,
 * big DASH / SKILL with cooldown fill, motion permission + calibration (client/input + the controls card),
 * haptics on hits. Samples input at 30 Hz during the match and hands frames to `link.send`.
 */
export function createControllerScreen(opts: ControllerScreenOpts): ControllerScreen {
  const { link } = opts;
  const session = { room: opts.room, get seatId() { return link.state.seatId ?? ''; } };
  const el = h('div.screen.controller-screen', { 'data-testid': 'controller-screen', 'data-phase': 'lobby' });
  let lobby: LobbyState | null = link.state.lobby;
  let latest: MatchState | null = null;
  let self: PlayerState | null = null;
  let status: ConnStatus = link.state.status === 'open' ? 'open' : 'connecting';
  let ended = false;
  let destroyed = false;

  // --- static skeleton (texts filled by paint) ---
  const linkDot = h('span.cs-link', { 'data-testid': 'controller-link' });
  const roomEl = h('span.cs-room', { translate: 'no' });
  const header = h('div.cs-head', null, h('span.cs-badge'), roomEl, linkDot);
  const pic = h('div.cs-pic');
  const heroName = h('div.cs-name', { translate: 'no' });
  const heroTitle = h('div.cs-title', { translate: 'no' });
  const hp = bar('hp', ''), armor = bar('armor', ''), energy = bar('energy', '');
  const hero = h('div.cs-hero', null, pic, h('div.cs-hero-text', null, heroName, heroTitle, hp.el, armor.el, energy.el));
  const look = h('div.cs-look', { 'data-testid': 'controller-look' });
  const sub = h('div.cs-sub');
  const controlsHost = h('div.cs-controls');
  const sensorPill = h('span.cs-sensor');
  const recal = h('button.btn.btn-tiny.cs-recal', { 'data-testid': 'controller-recalibrate', onclick: () => { input?.calibrate(); vibrate(20); } });
  const sensorRow = h('div.cs-sensor-row', null, sensorPill, recal);
  const knob = h('div.cs-knob');
  const padHint = h('div.cs-pad-hint');
  const pad = h('div.cs-pad', { 'data-testid': 'controller-pad' }, h('div.cs-ring', null, knob), padHint);
  const dashBtn = h('button.cs-act.dash', { 'data-testid': 'controller-dash', 'data-input-ignore': '' });
  const skillBtn = h('button.cs-act.skill', { 'data-testid': 'controller-skill', 'data-input-ignore': '' });
  const acts = h('div.cs-acts', null, dashBtn, skillBtn);
  const unlinkBtn = h('button.btn-link.cs-unlink', { 'data-testid': 'controller-unlink', onclick: () => { stopInput(); if (opts.onDisconnect) opts.onDisconnect(); else link.unlink(); } });
  const flash = h('div.cs-flash', { 'aria-hidden': 'true' });
  const endHost = h('div.cs-end', { hidden: true });
  el.append(flash, header, hero, look, sub, controlsHost, sensorRow, pad, acts, unlinkBtn, endHost);

  // --- big buttons: pointerdown = edge, OR'ed into the next sampled frame ---
  let dashEdge = false, skillEdge = false;
  const press = (btn: HTMLElement, fire: () => void) => btn.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    if (btn.dataset.ready === '0') { vibrate(8); return; }
    fire(); vibrate(18); btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit');
  });
  press(dashBtn, () => (dashEdge = true));
  press(skillBtn, () => (skillEdge = true));

  // --- input (client/input): motion when granted, invisible drag surface otherwise ---
  const surface = document.createElement('canvas'); // createInput wants a canvas; there is no arena here
  let input: InputController | null = null;
  let sendIv: ReturnType<typeof setInterval> | null = null;
  let lastSource = '';
  const stopInput = () => { if (sendIv) clearInterval(sendIv); sendIv = null; input?.dispose(); input = null; };
  const startInput = () => {
    if (input || ended) return;
    input = createInput({ canvas: surface, toArena: () => (self ? [self.x, self.y] : [0, 0]), getSelf: () => (self ? { x: self.x, y: self.y } : null) });
    sendIv = setInterval(() => {
      if (!input) return;
      const frame = input.sample();
      if (dashEdge) { frame.dash = true; dashEdge = false; }
      if (skillEdge) { frame.skill = true; skillEdge = false; }
      const m = frame.move;
      knob.style.transform = `translate(${(m[0] * 34).toFixed(1)}px,${(m[1] * 34).toFixed(1)}px)`;
      pad.classList.toggle('firing', frame.fire);
      if (input.mode !== lastSource) { lastSource = input.mode; el.dataset.input = input.mode; paintSensor(); }
      const live = latest && (latest.status === 'fighting' || latest.status === 'countdown') && !latest.paused && lobby?.phase === 'match';
      if (live && status === 'open') link.send({ t: 'input', frame });
    }, 1000 / 30);
  };

  // --- controls report: the seat's controlsReady follows this phone ---
  const reportControls = () => {
    if (ended) return;
    const st = getMotionPermissionState();
    link.send({ t: 'controls', ready: st.ready, mode: st.profile }); // the link re-sends the latest one after each welcome
  };
  const controlsCard = createControlsCard(() => openControlTraining({ onDone: () => paintControls() }));

  const paintSensor = () => {
    const st = getMotionPermissionState();
    const motion = input?.mode === 'motion' || (st.ready && st.profile !== 'tap-only');
    sensorPill.textContent = motion ? tr('sensorMotion') : tr('sensorTouch');
    sensorPill.dataset.on = motion ? '1' : '0';
    recal.hidden = !motion;
    padHint.textContent = motion ? tr('padMotion') : tr('padTouch');
  };
  const paintControls = () => {
    // full controls card until controls are chosen; afterwards a compact sensor row during the fight
    const ready = getMotionPermissionState().ready;
    const showCard = !ready || lobby?.phase !== 'match';
    if (showCard && !controlsCard.el.isConnected) controlsHost.replaceChildren(controlsCard.el);
    controlsHost.hidden = !showCard;
    el.classList.toggle('choosing', showCard); // the card takes the stick's room; DASH / SKILL stay on screen
  };

  // --- cooldown fill: track the max seen so the fill reads as a fraction ---
  let dashMax = 1, skillMax = 1;
  const paintAct = (btn: HTMLElement, label: string, cd: number, max: number) => {
    const ready = cd <= 0;
    btn.dataset.ready = ready ? '1' : '0';
    btn.style.setProperty('--cd', ready ? '1' : (1 - cd / max).toFixed(3));
    const txt = ready ? label : `${label} ${cd.toFixed(1)}s`;
    if (btn.dataset.txt !== txt) { btn.dataset.txt = txt; btn.replaceChildren(h('span', null, label), h('small', null, ready ? tr('ready') : `${cd.toFixed(1)}s`)); }
  };

  let kitSig = '';
  const paintHero = (kit: PlayerKit | null | undefined, name: string) => {
    const s = `${kit?.seed}|${kit?.repo}|${name}`;
    if (s === kitSig) return;
    kitSig = s;
    pic.replaceChildren(portrait(kit, 72));
    heroName.textContent = name;
    heroTitle.textContent = kit ? `${kit.design?.title ?? kit.title} · ${kit.repo}` : tr('noHero');
  };

  function paint() {
    if (destroyed) return;
    const seat = lobby?.players.find(p => p.id === session.seatId);
    const phase = lobby?.phase ?? 'lobby';
    el.dataset.phase = phase;
    roomEl.textContent = `${tr('ctrl')} · ${session.room}`;
    linkDot.textContent = status === 'open' ? `● ${tr('linked')}` : `○ ${tr('reconnecting')}`;
    linkDot.dataset.status = status;
    const kit = self?.kit ?? seat?.kit ?? null;
    paintHero(kit, self?.name ?? seat?.name ?? '');
    const maxHp = kit?.maxHp ?? 1, maxArmor = kit?.maxArmor ?? 0, maxEnergy = kit?.maxEnergy ?? 1;
    hp.el.firstElementChild!.textContent = tr('hp'); armor.el.firstElementChild!.textContent = tr('armor'); energy.el.firstElementChild!.textContent = tr('energy');
    setBar(hp, self ? self.hp : maxHp, maxHp);
    setBar(armor, self ? self.armor : maxArmor, maxArmor);
    armor.el.hidden = maxArmor <= 0;
    setBar(energy, self ? self.energy : maxEnergy, maxEnergy);
    look.textContent = tr('look');
    const st = latest?.status;
    let line: string;
    if (phase !== 'match') line = seat?.kit ? tr('waiting') : tr('noHero');
    else if (st === 'victory') line = tr('victory');
    else if (st === 'defeat') line = tr('defeat');
    else if (self && !self.alive) line = tr('downed');
    else line = tr('fight');
    sub.textContent = line;
    sub.dataset.tone = st === 'victory' ? 'ok' : st === 'defeat' || (self && !self.alive) ? 'bad' : phase === 'match' ? 'go' : '';
    if (self) {
      if (self.dashCd > 0) dashMax = Math.max(dashMax, self.dashCd); else dashMax = 1;
      if (self.skillCd > 0) skillMax = Math.max(skillMax, self.skillCd); else skillMax = 1;
    }
    paintAct(dashBtn, tr('dash'), self?.dashCd ?? 0, dashMax);
    paintAct(skillBtn, kit ? `${tr('skill')}` : tr('skill'), self?.skillCd ?? 0, skillMax);
    recal.textContent = tr('recal');
    unlinkBtn.textContent = tr('disconnect');
    paintSensor();
    paintControls();
  }

  // --- haptics + hit flash from this snapshot's events ---
  const feel = (s: MatchState) => {
    for (const ev of s.events) {
      if (ev.type === 'hit' && ev.target === session.seatId) {
        vibrate(Math.round(clamp(20 + ev.amount * 6, 25, 90)));
        flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
      } else if (ev.type === 'downed' && ev.player === session.seatId) vibrate([90, 50, 90]);
      else if (ev.type === 'revived' && ev.player === session.seatId) vibrate(40);
      else if (ev.type === 'victory') vibrate([40, 40, 40, 40, 160]);
      else if (ev.type === 'defeat') vibrate(300);
      else if (ev.type === 'limbBroken' && ev.by === session.seatId) vibrate([30, 30, 60]);
    }
  };

  const showEnd = (kind: EndKind, message?: string | null) => {
    if (ended) return;
    ended = true;
    stopInput();
    el.classList.add('ended');
    endHost.hidden = false;
    const text = kind === 'error' ? message ?? tr('unlinked') : tr(kind);
    endHost.replaceChildren(h('div.term-window', null,
      h('div.term-title', null, h('span.dots', null, '● ● ●'), ` gitzilla@room-${session.room}`),
      h('div.term-body', { 'data-testid': `controller-end-${kind}` },
        h('h2', null, kind === 'kicked' || kind === 'error' ? '✗' : '📱', ' ', text),
        kind !== 'kicked' && opts.relink ? h('button.btn.btn-primary', { 'data-testid': 'controller-relink', onclick: () => opts.relink!() }, tr('relink')) : null,
        kind !== 'kicked' && opts.playHere ? h('button.btn-link', { 'data-testid': 'controller-play-here', onclick: () => opts.playHere!() }, tr('offerPlayHere')) : null,
        h('a.btn', { href: '/' }, tr('home')))));
  };

  // subscribe last: the callback fires synchronously and needs the paint helpers above
  const stopPermission = subscribeMotionPermission(() => { reportControls(); paintControls(); paintSensor(); });
  const stopLocale = onLocaleChange(() => { if (ended) return; paint(); });
  startInput();
  paint();
  queueMicrotask(reportControls);

  link.onMessage(m => {
    if (destroyed || ended) return;
    if (m.t === 'welcome' || m.t === 'lobby') {
      lobby = m.lobby;
      if (lobby.phase !== 'match') { latest = null; self = null; }
      if (m.t === 'welcome') reportControls();
    } else if (m.t === 'snapshot') {
      latest = m.state;
      self = m.state.players.find(p => p.id === session.seatId) ?? null;
      if (lobby) lobby.phase = 'match';
      feel(m.state);
    } else if (m.t === 'autopsy' && lobby) lobby.phase = 'autopsy';
    paint();
  });
  const stopState = link.onState(st => {
    if (destroyed) return;
    if (st.status === 'replaced' || st.status === 'kicked' || st.status === 'unlinked' || st.status === 'error') return showEnd(st.status, st.error);
    status = st.status === 'open' ? 'open' : st.status === 'connecting' ? 'connecting' : 'closed';
    if (st.lobby) lobby = st.lobby;
    if (!ended) paint();
  });

  return {
    el,
    destroy() {
      destroyed = true;
      stopInput(); stopPermission(); stopLocale(); stopState(); controlsCard.dispose();
      el.remove();
    },
  };
}
