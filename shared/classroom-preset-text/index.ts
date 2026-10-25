import type { Locale } from '../i18n/locale';
import type { PresetText } from './types';
import { en } from './en';
import { zh } from './zh';
import { es } from './es';
import { fr } from './fr';

export type { PresetText, StepText, DefaultStepText } from './types';
export const presetText: Record<Locale, PresetText> = { en, zh, es, fr };
