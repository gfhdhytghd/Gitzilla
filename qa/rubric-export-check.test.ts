import { describe, expect, it } from 'vitest';
import { assertFeedbackExport } from './rubric-export-check.ts';

const students = [
  { id: 'one', name: 'QA_Student_One', repo: 'pallets/flask', score: 86.2 },
  { id: 'two', name: 'QA_Student_Two', repo: 'golang/example', score: 90.8 },
];
const csv = '"Name","Repository","Rubric score"\r\n"QA_Student_One","pallets/flask","86.2"\r\n"QA_Student_Two","golang/example","90.8"\r\n';
const md = '# Custom rubric\n\n## QA\\_Student\\_One — pallets/flask\n\nRubric score: **86.2/100**.\n\n## QA\\_Student\\_Two — golang/example\n\nRubric score: **90.8/100**.\n';

describe('real export format semantics', () => {
  for (const [format, text] of [['csv', csv], ['md', md]] as const) {
    it(`${format}: retains exact student/repository/score bindings, including escaped Markdown names`, () => {
      expect(() => assertFeedbackExport(format, text, students)).not.toThrow();
    });
    it(`${format}: rejects swapped scores even when both names and both scores are present`, () => {
      const swapped = text.replaceAll('86.2', 'TEMP').replaceAll('90.8', '86.2').replaceAll('TEMP', '90.8');
      expect(() => assertFeedbackExport(format, swapped, students)).toThrow();
    });
    it(`${format}: rejects a substituted repository`, () => {
      expect(() => assertFeedbackExport(format, text.replace('pallets/flask', 'wrong/repo'), students)).toThrow();
    });
  }
});
