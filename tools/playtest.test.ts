import { describe, expect, it } from 'vitest';
import { parseOptions, playtestBaseURL } from './playtest';

describe('DEV server targeting', () => {
  it('defaults to shared DEV and accepts an explicit override', () => {
    expect(playtestBaseURL('')).toBe('http://localhost:5175');
    expect(playtestBaseURL('http://localhost:6000/')).toBe('http://localhost:6000');
  });
  it('rejects stable live targets without making a request', () => {
    expect(() => playtestBaseURL('http://localhost:5173')).toThrow('stable live');
    expect(() => playtestBaseURL('https://gitzilla.wilflin.me')).toThrow('stable live');
  });
});

describe('playtest CLI options', () => {
  it('uses the documented four-player sixty-second default', () => {
    expect(parseOptions([])).toEqual({ players: 4, boss: 'pallets/flask', seconds: 60, headed: false });
  });
  it('accepts all requested options without depending on their order', () => {
    expect(parseOptions(['--headed', '--seconds', '12.5', '--boss', 'facebook/react', '--players', '8']))
      .toEqual({ players: 8, boss: 'facebook/react', seconds: 12.5, headed: true });
  });
  it.each(['0', '9', '1.5', 'nope'])('rejects invalid player count %s', count => {
    expect(() => parseOptions(['--players', count])).toThrow('--players');
  });
  it.each(['0', '-1', 'Infinity', 'nope'])('rejects invalid duration %s', value => {
    expect(() => parseOptions(['--seconds', value])).toThrow('--seconds');
  });
  it('reports unsupported flags and missing values', () => {
    expect(() => parseOptions(['--wat'])).toThrow('Unknown option');
    expect(() => parseOptions(['--boss'])).toThrow('Missing value');
    expect(() => parseOptions(['--players', '--headed'])).toThrow('Missing value');
  });
});
