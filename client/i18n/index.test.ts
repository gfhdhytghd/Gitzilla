import { afterEach, describe, expect, it } from 'vitest';
import { locale, onLocaleChange, setClassroomLanguage, setLanguage } from './index';
afterEach(()=>{setClassroomLanguage(null);setLanguage('en');});
describe('classroom locale authority',()=>{
 it('locks a student’s local preference while following the host and restores personal preference on exit',()=>{
  setLanguage('es');expect(locale()).toBe('es');setClassroomLanguage('fr');expect(locale()).toBe('fr');
  setLanguage('zh');expect(locale()).toBe('fr');setClassroomLanguage('zh');expect(locale()).toBe('zh');
  setClassroomLanguage(null);expect(locale()).toBe('es');
 });
 it('notifies without a duplicate loop and permits listener cleanup',()=>{
  let count=0;const stop=onLocaleChange(()=>count++);setClassroomLanguage('fr');setClassroomLanguage('fr');expect(count).toBe(1);
  stop();setClassroomLanguage('es');expect(count).toBe(1);
 });
});
