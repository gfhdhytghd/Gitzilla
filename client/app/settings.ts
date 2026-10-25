import { languageNames, LOCALES, locale, onLocaleChange, setLanguage, t, type Locale } from '../i18n';
import { isLocale } from '../../shared/i18n/locale';
import { getMotionPermissionState, loadMotionProfile, saveMotionProfile, subscribeMotionPermission, requestMotionPermission } from '../input';
import { createControlsCard } from './controls';
import { controlsTrained, openControlTraining } from './training';
import { h, store } from './util';
import { usesLocalControls } from './device';
import { isMuted, setMuted } from './sound';
import { setView25d, view25dPinned, view25dWanted } from './view25d';

interface SettingsContext {
  classroom?: boolean;
  host?: boolean;
  connected?: boolean;
  changeLanguage?: (lang: Locale) => void;
  spectator?: boolean;
}
let context: SettingsContext = {};
let dialog: HTMLDialogElement;
let button: HTMLButtonElement;
let disposeContent = () => {};
let onboarding = false;
let dismissed = false;
let training = false;
const COMPLETE = 'gitzilla.onboarding.v1';
// The first-run sheet shows at most once per browser session (iOS forgets motion permission on every load, but the
// lobby/fight gate asks for that per page — the sheet must not re-appear after every name prompt / room load).
const SESSION_SHOWN = 'gitzilla.onboarding.session';
const sessionShown = () => { try { return sessionStorage.getItem(SESSION_SHOWN) === '1'; } catch { return false; } };
const markSessionShown = () => { try { sessionStorage.setItem(SESSION_SHOWN, '1'); } catch { /* private mode */ } };

export function configureSettings(next: SettingsContext) {
  const changed = ['classroom', 'host', 'connected', 'spectator'].some(key => context[key as keyof SettingsContext] !== next[key as keyof SettingsContext]);
  context = next;
  if (changed && dialog?.open) render();
  maybeOnboard();
}
function signal(open: boolean) {
  document.body.classList.toggle('settings-open', open);
  window.dispatchEvent(new CustomEvent('gitzilla:settings', { detail: { open } }));
}
function close() {
  dismissed = true;
  if (onboarding) store.set(COMPLETE, '1');
  dialog.close();
  disposeContent(); disposeContent = () => {};
  signal(false);
  button.focus();
}
function practice() {
  const motion = getMotionPermissionState();
  if (motion.required && motion.needsPermission) {
    void requestMotionPermission().then(granted => { if (granted) startPractice(); });
    return;
  }
  startPractice();
}
function startPractice() {
  training = true;
  dialog.close(); signal(true);
  openControlTraining({ onDone: () => {
    training = false;
    render(); dialog.showModal(); signal(true);
  } });
}
function render() {
  disposeContent();
  const title = h('h2', { id: 'settings-title' }, onboarding ? 'Before you play' : 'Settings');
  const intro = onboarding ? h('p.settings-intro', null, context.classroom ? 'Choose your language before joining the class.' : 'Choose your language and controls, then try them before the fight.') : null;
  const language = h('section.settings-section', null, h('h3', null, 'Language'));
  if (context.classroom && !context.host) {
    language.append(h('p', { 'data-testid': 'language-host-only' }, 'Only the host can change the classroom language'));
  } else {
    const select = h('select', { 'data-testid': context.classroom ? 'classroom-language' : 'language-select', 'aria-label': context.classroom ? 'Classroom language' : 'Language', 'data-i18n-skip': true },
      ...LOCALES.map(lang => h('option', { value: lang }, languageNames[lang]))) as HTMLSelectElement;
    select.value = locale();
    select.disabled = !!context.classroom && !context.connected;
    select.onchange = () => {
      if (!isLocale(select.value)) return;
      if (context.classroom) context.changeLanguage?.(select.value);
      else setLanguage(select.value);
    };
    language.append(select);
  }
  const sound = h('section.settings-section', null, h('h3', null, 'Sound'),
    h('label.settings-toggle', null,
      h('input', { type: 'checkbox', 'data-testid': 'settings-sound', checked: !isMuted(), onchange: (e: Event) => setMuted(!(e.target as HTMLInputElement).checked) }),
      h('span', null, 'music & sound effects')));
  // View: [ 2D | 3D ] segmented switch (the fight in the three.js stage); a ?view=… link pins it
  const view = context.classroom || onboarding ? null : h('section.settings-section', null, h('h3', { id: 'settings-view-label' }, 'View'),
    viewSwitch(), view25dPinned() ? h('p.settings-status', null, 'Set by this link.') : null);
  const children: (HTMLElement | null)[] = [title, intro, language, sound, view];
  if (!context.classroom && !context.spectator && usesLocalControls()) {
    if (getMotionPermissionState().mobile) {
      const controls = createControlsCard(practice);
      disposeContent = controls.dispose;
      children.push(h('section.settings-section', null, h('h3', null, 'Controls'), controls.el));
      if (onboarding) children.push(h('p.settings-status', { 'data-testid': 'onboarding-training-status' }, controlsTrained() ? '✓ controls practiced' : 'Practice your controls before the fight. You can retry in Settings.'));
    } else {
      children.push(h('section.settings-section', null, h('h3', null, 'Controls'),
        h('p', null, 'WASD / arrows: move · mouse: aim · J / click: attack · Space: dash · E: skill')));
    }
  }
  const motion = usesLocalControls() ? getMotionPermissionState() : null;
  const needsSetup = onboarding && !context.classroom && !context.spectator && motion?.mobile && (!motion.ready || !controlsTrained());
  children.push(h('div.settings-actions', null,
    h('button.btn.btn-primary', { 'data-testid': 'settings-close', onclick: close }, needsSetup ? 'Continue without practice' : onboarding ? 'Continue' : 'Close')));
  dialog.replaceChildren(...children.filter((x): x is HTMLElement => !!x));
}
/** [ 2D | 3D ] with a sliding thumb: role=radiogroup, roving tabindex, ←/→ (and Home/End) select, disabled when pinned. */
function viewSwitch(): HTMLElement {
  const pinned = view25dPinned();
  const opts = [['2d', '2D'], ['3d', '3D']] as const;
  const group = h('div.seg-switch', { role: 'radiogroup', 'aria-labelledby': 'settings-view-label', 'data-testid': 'settings-view', 'aria-disabled': String(pinned) });
  const thumb = h('span.seg-thumb', { 'aria-hidden': 'true' });
  const btns = opts.map(([v, label]) => h('button.seg-opt', { type: 'button', role: 'radio', 'data-testid': `settings-view-${v}`, 'data-v': v, disabled: pinned,
    onclick: () => pick(v === '3d', true) }, label) as HTMLButtonElement);
  const sync = () => {
    const on3d = view25dWanted();
    group.dataset.value = on3d ? '3d' : '2d';
    btns.forEach((b) => {
      const sel = (b.dataset.v === '3d') === on3d;
      b.setAttribute('aria-checked', String(sel));
      b.tabIndex = sel ? 0 : -1;
    });
  };
  const pick = (on3d: boolean, focus: boolean) => {
    if (pinned) return;
    setView25d(on3d);
    sync();
    if (focus) btns[on3d ? 1 : 0].focus();
  };
  group.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    const to = k === 'ArrowRight' || k === 'ArrowDown' || k === 'End' ? true : k === 'ArrowLeft' || k === 'ArrowUp' || k === 'Home' ? false : null;
    if (to === null) return;
    e.preventDefault();
    pick(to, true);
  });
  group.append(thumb, ...btns);
  sync();
  return group;
}

export function openSettings() {
  if (!dialog || training) return;
  onboarding = false;
  render();
  if (!dialog.open) dialog.showModal();
  signal(true);
}
function maybeOnboard() {
  if (!usesLocalControls() || !dialog || dismissed || dialog.open || training || context.spectator || context.classroom || sessionShown()) return;
  if (document.querySelector('.screen.whoami')) return; // never stack on top of the name prompt
  if (document.querySelector('.screen.autopsy, .screen.game')) return; // not over results or a running fight
  const motion = getMotionPermissionState();
  if (store.get(COMPLETE) === '1' && (!motion.mobile || motion.ready && controlsTrained())) return;
  onboarding = true;
  markSessionShown();
  render(); dialog.showModal(); signal(true);
}
export function placeSettingsButton(page?: HTMLElement) {
  if (!button) return;
  const actions = page?.querySelector<HTMLElement>('.lobby-actions');
  const container = actions ?? page?.querySelector<HTMLElement>('.lobby-scroll, .ap-scroll') ?? page;
  button.parentElement?.classList.remove('settings-page');
  button.hidden = !container;
  button.classList.toggle('settings-in-actions', !!actions);
  if (container) {
    if (!actions) container.classList.add('settings-page');
    container.append(button);
  } else document.body.append(button);
}
export function installSettings() {
  if (loadMotionProfile() === 'seated') saveMotionProfile('standard');
  button = h('button.btn.settings-button', { 'data-testid': 'settings-open', 'aria-label': 'Settings', title: 'Settings', hidden: true, onclick: openSettings }, '⚙') as HTMLButtonElement;
  dialog = h('dialog.settings-dialog', { 'data-testid': 'settings-dialog', 'aria-labelledby': 'settings-title', 'data-input-ignore': true }) as HTMLDialogElement;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.body.append(button, dialog);
  onLocaleChange(() => { if (dialog.open) render(); button.setAttribute('aria-label', t('Settings')); });
  if (usesLocalControls()) subscribeMotionPermission(() => { if (dialog.open && !training) render(); });
}
