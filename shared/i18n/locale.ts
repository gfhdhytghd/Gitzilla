export const LOCALES = ['en', 'zh', 'es', 'fr'] as const;
export type Locale = typeof LOCALES[number];
export const languageNames: Record<Locale, string> = { en: 'English', zh: '中文', es: 'Español', fr: 'Français' };
export function isLocale(value: unknown): value is Locale { return typeof value === 'string' && (LOCALES as readonly string[]).includes(value); }
export function languageFrom(value: string | null | undefined): Locale {
  const code = value?.toLowerCase().split(/[-_]/)[0]; return isLocale(code) ? code : 'en';
}
export type Message = readonly [en: string, zh: string, es: string, fr: string];
