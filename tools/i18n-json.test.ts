import { describe, expect, it } from 'vitest';
import { parseGeneratedJSON } from './i18n-json';
describe('translation JSON formatting repair', () => {
  it('repairs trailing commas while preserving code, quotes and text', () => {
    expect(parseGeneratedJSON('```json\n{"text":"code,} and \\\"quote\\\"", "rows":[1,2,],}\n```'))
      .toEqual({ text: 'code,} and "quote"', rows: [1, 2] });
  });
  it('keeps valid JSON unchanged and rejects truncated or invented structure', () => {
    expect(parseGeneratedJSON('{"en":"Hello", "zh":"你好"}')).toEqual({ en: 'Hello', zh: '你好' });
    expect(() => parseGeneratedJSON('{"en":"Hello')).toThrow();
    expect(() => parseGeneratedJSON('{en: "Hello"}')).toThrow();
  });
});
