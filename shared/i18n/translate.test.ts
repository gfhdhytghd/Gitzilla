import { describe, it, expect } from 'vitest';
import { createTranslator } from './translate';
import { languageFrom, isLocale } from './locale';
import { localizeClassroomPlan } from '../classroom-localize';
import { pythonClassroomPlan } from '../classroom-presets';
import { defaultClassroomPlan } from '../classroom-defaults';

describe('four-language localization primitives', () => {
  const t = createTranslator([
    ['Hello', '你好', 'Hola', 'Bonjour'],
    ['Step {0}: {1}', '第 {0} 步：{1}', 'Paso {0}: {1}', '{1} : étape {0}'],
    ['{0}: {1}', '{0}：{1}', '{0}: {1}', '{0}: {1}'],
  ]);
  it('normalizes supported browser language tags and rejects forged room values', () => {
    expect(languageFrom('zh-CN')).toBe('zh'); expect(languageFrom('es-ES')).toBe('es'); expect(languageFrom('fr-CA')).toBe('fr');
    expect(languageFrom('de')).toBe('en'); expect(isLocale('es-ES')).toBe(false); expect(isLocale('fr')).toBe(true);
  });
  it('translates text from any known source language and keeps placeholder values unchanged', () => {
    expect(t('你好','fr')).toBe('Bonjour');
    expect(t('Step 2: foo/bar.py','fr')).toBe('foo/bar.py : étape 2');
    expect(t('Paso 2: <img onerror=x>','zh')).toBe('第 2 步：<img onerror=x>');
    expect(t('custom: actual teacher text','fr')).toBe('custom: actual teacher text');
    expect(t('teacher authored title','es')).toBe('teacher authored title');
  });
  it('does not overwrite custom course edits, timing, checks, or the source plan', () => {
    const plan=pythonClassroomPlan('09-dict');
    plan.title='My own course'; plan.steps[0].instructions='Teacher custom prose with inventory["apple"]'; plan.steps[0].durationSec=123;
    plan.steps[1].checks.push({id:'custom',kind:'contains',path:'custom.py',text:'DO NOT TRANSLATE',label:'Teacher check'});
    const original=JSON.stringify(plan), result=localizeClassroomPlan(plan,'fr');
    expect(result.title).toBe('My own course'); expect(result.steps[0].instructions).toBe(plan.steps[0].instructions);
    expect(result.steps[0].durationSec).toBe(123); expect(result.steps[1].checks.at(-1)).toEqual(plan.steps[1].checks.at(-1));
    expect(JSON.stringify(plan)).toBe(original);
  });
  it('keeps default lesson identifiers and grading signals stable in every language', () => {
    const plan = defaultClassroomPlan();
    const contract = (p: typeof plan) => p.steps.map(s => [s.id, s.durationSec, s.checksWeight, s.rubric.source,
      s.rubric.criteria.map(c => [c.id, c.signal, c.weight, c.target, c.check])]);
    for (const lang of ['en','zh','es','fr'] as const) expect(contract(localizeClassroomPlan(plan, lang))).toEqual(contract(plan));
  });
});
