import { describe, expect, it } from 'vitest';
import type { Rubric } from '../../shared/types.ts';
import { normalizeRubric } from '../../server/rubrics.ts';
import { editableRubric, rubricsEqual } from './rubric.ts';

const custom = (): Rubric => ({
  title: 'Class rubric', criteria: [
    { id: 'tests', name: 'Testing', weight: 30, signal: 'tests', description: 'Include tests', target: 0.2 },
    { id: 'paths', name: 'Project layout', weight: 70, signal: 'check', description: 'Tests directory', check: { value: 'tests/', kind: 'path-exists' } },
  ], source: 'doc', unparsed: ['Present your design'],
});

describe('rubric equality after actual server normalization', () => {
  it('matches ACK after the real normalizer reconstructs rubric, criteria and check fields', () => {
    const draft = custom(), ack = normalizeRubric(draft);
    expect(Object.keys(ack)).not.toEqual(Object.keys(draft));
    expect(Object.keys(ack.criteria[0])).not.toEqual(Object.keys(draft.criteria[0]));
    expect(Object.keys(ack.criteria[1].check!)).not.toEqual(Object.keys(draft.criteria[1].check!));
    expect(rubricsEqual(draft, ack)).toBe(true);
    expect(rubricsEqual(editableRubric(ack), ack)).toBe(true);
  });
  it('matches server-trimmed labels, scaled weights and absent versus empty optional lines', () => {
    const draft = custom(); draft.title = '  Class rubric '; draft.criteria[0].name = ' Testing ';
    draft.criteria.forEach(c => { c.weight *= 13; }); delete draft.unparsed;
    const ack = normalizeRubric(draft); ack.unparsed = [];
    expect(rubricsEqual(draft, ack)).toBe(true);
  });
  it('keeps criterion order and unparsed-line order meaningful', () => {
    const draft = custom(), reversed = normalizeRubric(draft); reversed.criteria.reverse();
    expect(rubricsEqual(draft, reversed)).toBe(false);
    const other = custom(); other.unparsed = ['Other requirement', 'Present your design'];
    const swapped = structuredClone(other); swapped.unparsed!.reverse();
    expect(rubricsEqual(other, swapped)).toBe(false);
  });
  it.each(['title', 'source', 'id', 'name', 'description', 'signal', 'weight', 'target', 'check-kind', 'check-value', 'unparsed'])(
    'still detects an unsaved change to %s', field => {
      const original = custom(), changed = normalizeRubric(original);
      switch (field) {
        case 'title': changed.title = 'Other rubric'; break;
        case 'source': changed.source = 'default'; break;
        case 'id': changed.criteria[0].id = 'other'; break;
        case 'name': changed.criteria[0].name = 'Other'; break;
        case 'description': changed.criteria[0].description = 'Different requirement'; break;
        case 'signal': changed.criteria[0].signal = 'documentation'; break;
        case 'weight': changed.criteria[0].weight = 0.8; break;
        case 'target': changed.criteria[0].target = 0; break;
        case 'check-kind': changed.criteria[1].check!.kind = 'path-absent'; break;
        case 'check-value': changed.criteria[1].check!.value = 'src/'; break;
        case 'unparsed': changed.unparsed = []; break;
      }
      expect(rubricsEqual(original, changed)).toBe(false);
    });
  it('distinguishes absent checks/targets from actual checks and zero targets', () => {
    const original = custom(), other = structuredClone(original); delete other.criteria[1].check;
    expect(rubricsEqual(original, other)).toBe(false);
    delete other.criteria[0].target; original.criteria[0].target = 0; delete original.criteria[1].check;
    expect(rubricsEqual(original, other)).toBe(false);
  });
});
