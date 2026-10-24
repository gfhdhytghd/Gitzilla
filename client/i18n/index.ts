import { isLocale, languageFrom, languageNames, LOCALES, type Locale } from '../../shared/i18n/locale';
import { translate } from '../../shared/i18n/text';
export { languageNames, LOCALES, type Locale };
let preferred: Locale = 'en';
try { preferred = languageFrom(localStorage.getItem('gitzilla.locale') || navigator.language); } catch { /* Private browsing and tests. */ }
let classroom: Locale | null = null;
const listeners = new Set<() => void>();
export const locale = (): Locale => classroom ?? preferred;
export const onLocaleChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
function notify() { if (typeof document !== 'undefined') document.documentElement.lang = locale(); for (const fn of listeners) fn(); }
export function setLanguage(value: Locale) {
  if (!isLocale(value) || classroom !== null) return;
  preferred = value; try { localStorage.setItem('gitzilla.locale', value); } catch { /* Optional preference storage. */ } notify();
}
export function setClassroomLanguage(value: Locale | null) {
  if (classroom === value) return; classroom = value; notify();
}
export const t = (source: string, lang: Locale = locale()) => translate(source, lang);
export const formatNumber = (value: number, digits = 1) => new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

/** Localize owned UI nodes; never edit inputs, code, repositories, or authored lesson text. */
export function installLanguageUi() {
  const skip = 'script,style,code,pre,textarea,[translate="no"],[data-i18n-skip],.cr-instructions,.cr-title h1,.cr-task h2,.cr-steps,.cr-person b,.cr-version,.gh-name';
  const saved = new WeakMap<Node, { source: string; rendered: string }>();
  const attrs = new WeakMap<Element, Map<string, { source: string; rendered: string }>>();
  const translateText = (node: Node) => {
    if (node.nodeType !== Node.TEXT_NODE || !node.parentElement || node.parentElement.closest(skip)) return;
    const value = node.nodeValue ?? ''; if (!value.trim()) return;
    const before = saved.get(node), source = before?.rendered === value ? before.source : value;
    const leading = source.match(/^\s*/)?.[0] ?? '', trailing = source.match(/\s*$/)?.[0] ?? '';
    const whole = t(source);
    const rendered = leading + (whole === source ? t(source.trim()) : whole.trim()) + trailing;
    saved.set(node, { source, rendered }); if (value !== rendered) node.nodeValue = rendered;
  };
  const translateAttrs = (element: Element) => {
    if (element.closest(skip)) return;
    for (const name of ['title', 'placeholder', 'aria-label']) {
      const value = element.getAttribute(name); if (!value) continue;
      const map = attrs.get(element) ?? new Map(); attrs.set(element, map);
      const before = map.get(name), source = before?.rendered === value ? before.source : value, rendered = t(source);
      map.set(name, { source, rendered }); if (value !== rendered) element.setAttribute(name, rendered);
    }
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { translateText(node); return; }
    if (!(node instanceof Element)) return;
    if (!node.closest('[translate="no"],[data-i18n-skip],script,style,code,pre')) translateAttrs(node);
    if (node.closest(skip)) return; for (const child of node.childNodes) walk(child);
  };
  const refresh = () => { document.documentElement.lang = locale(); walk(document.body); };
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') translateText(record.target);
      else if (record.type === 'attributes') translateAttrs(record.target as Element);
      else for (const node of record.addedNodes) walk(node);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] });
  const unsubscribe = onLocaleChange(refresh); refresh();
  return () => { observer.disconnect(); unsubscribe(); };
}
