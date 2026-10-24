import type { ClassroomPlan } from './classroom';
import { pythonClassroomPlan, pythonClassroomPresets } from './classroom-presets';
import { defaultClassroomPlan } from './classroom-defaults';
import { LOCALES, type Locale } from './i18n/locale';
import { translate } from './i18n/text';

// Only replace strings still identical to an official template. Custom teacher text stays verbatim.
function mergeTemplate(current: unknown, from: unknown, to: unknown): unknown {
  if (typeof current === 'string') return current === from && typeof to === 'string' ? to : current;
  if (Array.isArray(current) && Array.isArray(from) && Array.isArray(to)) return current.map((value, i) => {
    const id = value && typeof value === 'object' ? value.id : undefined;
    const match = id ? from.findIndex(v => v?.id === id) : i;
    const index = match >= 0 ? match : i;
    return mergeTemplate(value, from[index], to[index]);
  });
  if (current && typeof current === 'object' && from && typeof from === 'object' && to && typeof to === 'object') {
    return Object.fromEntries(Object.entries(current).map(([k, v]) => [k, mergeTemplate(v, (from as Record<string, unknown>)[k], (to as Record<string, unknown>)[k])]));
  }
  return current;
}
function translateDefault(plan: ClassroomPlan, lang: Locale): ClassroomPlan {
  const text = (value: string) => translate(value, lang);
  return { ...plan, title: text(plan.title), bossName: text(plan.bossName), steps: plan.steps.map(step => ({
    ...step, title: text(step.title), instructions: text(step.instructions),
    checks: step.checks.map(check => ({ ...check, label: text(check.label) })),
    rubric: { ...step.rubric, title: text(step.rubric.title), criteria: step.rubric.criteria.map(criterion => ({
      ...criterion, name: text(criterion.name), description: text(criterion.description),
    })), ...(step.rubric.unparsed ? { unparsed: step.rubric.unparsed.map(text) } : {}) },
  })) };
}
const planCache = new Map<string, ClassroomPlan>();
export function localizeClassroomPlan(plan: ClassroomPlan, lang: Locale): ClassroomPlan {
  const key = lang + '\0' + JSON.stringify(plan), cached = planCache.get(key);
  if (cached) return structuredClone(cached);
  let result = structuredClone(plan);
  const preset = pythonClassroomPresets.find(p => plan.steps.some(step => step.id.startsWith(`${p.id}-`)));
  for (const from of LOCALES) {
    const original = preset ? pythonClassroomPlan(preset.id, from) : translateDefault(defaultClassroomPlan(), from);
    const target = preset ? pythonClassroomPlan(preset.id, lang) : translateDefault(defaultClassroomPlan(), lang);
    result = mergeTemplate(result, original, target) as ClassroomPlan;
  }
  if (planCache.size >= 24) planCache.clear(); planCache.set(key, structuredClone(result));
  return result;
}
