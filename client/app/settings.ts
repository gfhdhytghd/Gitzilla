import { languageNames, LOCALES, locale, onLocaleChange, setLanguage, t, type Locale } from '../i18n';
import { isLocale } from '../../shared/i18n/locale';
import { getMotionPermissionState, loadMotionProfile, saveMotionProfile, subscribeMotionPermission, requestMotionPermission } from '../input';
import { createControlsCard } from './controls';
import { controlsTrained, openControlTraining } from './training';
import { h, store } from './util';

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
  const children: (HTMLElement | null)[] = [title, intro, language];
  if (!context.classroom && !context.spectator) {
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
  const motion = getMotionPermissionState();
  const needsSetup = onboarding && !context.classroom && !context.spectator && motion.mobile && (!motion.ready || !controlsTrained());
  children.push(h('div.settings-actions', null,
    h('button.btn.btn-primary', { 'data-testid': 'settings-close', onclick: close }, needsSetup ? 'Continue without practice' : onboarding ? 'Continue' : 'Close')));
  dialog.replaceChildren(...children.filter((x): x is HTMLElement => !!x));
}
export function openSettings() {
  if (!dialog || training) return;
  onboarding = false;
  render();
  if (!dialog.open) dialog.showModal();
  signal(true);
}
function maybeOnboard() {
  if (!dialog || dismissed || dialog.open || training || context.spectator || context.classroom) return;
  const motion = getMotionPermissionState();
  if (store.get(COMPLETE) === '1' && (!motion.mobile || motion.ready && controlsTrained())) return;
  onboarding = true;
  render(); dialog.showModal(); signal(true);
}
export function placeSettingsButton(container?: HTMLElement) {
  if (!button) return;
  button.classList.toggle('settings-inline', !!container);
  (container ?? document.body).append(button);
}
export function installSettings() {
  if (loadMotionProfile() === 'seated') saveMotionProfile('standard');
  button = h('button.btn.settings-button', { 'data-testid': 'settings-open', 'aria-label': 'Settings', onclick: openSettings }, '⚙ ', h('span', null, 'Settings')) as HTMLButtonElement;
  dialog = h('dialog.settings-dialog', { 'data-testid': 'settings-dialog', 'aria-labelledby': 'settings-title', 'data-input-ignore': true }) as HTMLDialogElement;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.body.append(button, dialog);
  onLocaleChange(() => { if (dialog.open) render(); button.setAttribute('aria-label', t('Settings')); });
  subscribeMotionPermission(() => { if (dialog.open && !training) render(); });
}
