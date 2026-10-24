import { describe, expect, it } from 'vitest';
import { messages } from './messages';
import { translate } from './text';
import { LOCALES } from './locale';
import { pythonClassroomPlan } from '../classroom-presets';
// Translation generation runs out of band; this gate prevents deploying an incomplete catalog.
describe('Gemini four-language catalog',()=>{
 it('has complete four-language rows and stable placeholder sets',()=>{
  expect(messages.length).toBeGreaterThan(500);
  const tags=(s:string)=>(s.match(/\{\d+\}/g)??[]).sort();
  for(const row of messages){expect(row).toHaveLength(4);for(const text of row){expect(text.trim()).not.toBe('');expect(tags(text)).toEqual(tags(row[0]));}}
 });
 it('translates host controls and localized curriculum without changing code contracts',()=>{
  for(const lang of ['zh','es','fr'] as const){expect(translate('Classroom language',lang)).not.toBe('Classroom language');expect(translate('Launch class attack',lang)).not.toBe('Launch class attack');}
  const plans=LOCALES.map(lang=>pythonClassroomPlan('09-dict',lang));
  expect(new Set(plans.map(p=>p.steps[0].title)).size).toBe(4);
  expect(new Set(plans.map(p=>p.steps[0].instructions)).size).toBe(4);
  for(const p of plans)expect(p.steps.map(s=>s.checks.map(c=>[c.kind,c.path,c.text]))).toEqual(plans[0].steps.map(s=>s.checks.map(c=>[c.kind,c.path,c.text])));
 });
});
