import { describe, expect, it, vi } from 'vitest';
import { profileFromFiles } from './graph.ts';
import { busFactorFromContributors, componentMaintainers, enrichSocial, mapAdoptableIssues, type GitHubApi } from './social.ts';

function profile() {
  const p = profileFromFiles('class/project', [{ path: 'main.ts', text: 'export function main() { return 1; }' }]);
  p.components = ['src/router', 'src/parser', 'root', 'misc'].map(name => ({ name, files: 1, loc: 10, fanIn: 0, fanOut: 0 }));
  return p;
}
const issue = (number: number, title: string, body = '') => ({ number, title, body, html_url: `https://github.com/class/project/issues/${number}`, state: 'open', labels: [{ name: 'good first issue' }] });

describe('real maintenance and adoption data', () => {
  it('counts distinct human authors, ranks public logins and does not publish anonymous emails', () => {
    const measured = componentMaintainers([
      { author: { login: 'alice' } }, { author: { login: 'alice' } }, { author: { login: 'bob' } },
      { author: null, commit: { author: { email: 'unlinked@example.test', name: 'Unlinked' } } },
      { author: null, commit: { author: { email: 'unlinked@example.test', name: 'Unlinked' } } },
      { author: { login: 'dependabot[bot]', type: 'Bot' } },
    ]);
    expect(measured).toEqual({ maintainers: 3, topMaintainers: ['alice', 'bob'] });
    expect(JSON.stringify(measured)).not.toContain('example.test');
    expect(componentMaintainers([{}])).toBeUndefined(); expect(componentMaintainers([])).toEqual({ maintainers: 0, topMaintainers: [] });
  });
  it('computes the fewest humans accounting for strictly more than half of observed complete contribution totals', () => {
    expect(busFactorFromContributors([{ login: 'alice', contributions: 80 }, { login: 'bob', contributions: 20 }])).toBe(1);
    expect(busFactorFromContributors([{ contributions: 50 }, { contributions: 50 }])).toBe(2);
    expect(busFactorFromContributors([{ login: 'bot[bot]', contributions: 1000 }, { login: 'alice', contributions: 3 }])).toBe(1);
    expect(busFactorFromContributors([])).toBeUndefined();
  });
  it('maps actual issue title/body/labels to components, deduplicates and excludes closed issues and pull requests', () => {
    const p = profile();
    mapAdoptableIssues(p, [issue(1, 'Fix route matching', 'See src/router/index.ts'), issue(1, 'Fix route matching', 'See src/router/index.ts'),
      { ...issue(2, 'Improve parsing'), labels: [{ name: 'help wanted' }, { name: 'src/parser' }] },
      issue(3, 'Improve onboarding'), { ...issue(4, 'Closed src/router'), state: 'closed' },
      { ...issue(5, 'PR src/router'), pull_request: {} }, { ...issue(6, 'Unlabeled src/router'), labels: [] }]);
    expect(p.components[0].issues?.map(i => i.number)).toEqual([1]);
    expect(p.components[1].issues?.map(i => i.number)).toEqual([2]); expect(p.repoIssues?.map(i => i.number)).toEqual([3]);
    expect(p.components[0].issues![0].url).toBe('https://github.com/class/project/issues/1');
    expect(p.components[0].issues![0]).not.toHaveProperty('body');
  });
  it('caps issue boards and does not match a path inside a longer component name', () => {
    const p = profile();
    mapAdoptableIssues(p, [...Array.from({ length: 20 }, (_, i) => issue(i + 1, 'src/router task ' + i)), ...Array.from({ length: 20 }, (_, i) => issue(i + 30, 'Unmapped task ' + i)), issue(99, 'src/routerish')]);
    expect(p.components[0].issues).toHaveLength(3); expect(p.repoIssues).toHaveLength(10);
  });
  it('makes at most eight path requests, skips virtual misc, and loads full contributor pages only in precompute mode', async () => {
    const p = profile();
    const first = [{ login: 'alice', contributions: 50 }];
    const calls: string[] = [];
    const api: GitHubApi = async endpoint => {
      calls.push(endpoint);
      if (endpoint.startsWith('/contributors?') && !endpoint.includes('page=2')) return { data: first, link: '<https://api.github.com/repos/class/project/contributors?per_page=100&page=2>; rel="last", <https://api.github.com/repos/class/project/contributors?per_page=100&page=2>; rel="next"' };
      if (endpoint.includes('/contributors?')) return { data: [{ login: 'bob', contributions: 50 }], link: null };
      if (endpoint.startsWith('/commits?')) return { data: [{ author: { login: 'alice' } }], link: null };
      return { data: [issue(1, 'src/router fix')], link: null };
    };
    await enrichSocial(p, api, { fullContributorHistory: true });
    expect(p.busFactor).toBe(2); expect(first).toHaveLength(1);
    expect(p.components[0].maintainers).toBe(1); expect(p.components[0].topMaintainers).toEqual(['alice']);
    const paths = calls.filter(call => call.startsWith('/commits?'));
    expect(paths).toHaveLength(3); expect(paths.every(call => new URL('https://api.github.com' + call).searchParams.get('per_page') === '100')).toBe(true);
    expect(paths.some(call => call.includes('misc'))).toBe(false);
    const labels = calls.filter(call => call.startsWith('/issues?')).map(call => new URL('https://api.github.com' + call).searchParams.get('labels'));
    expect(labels.sort()).toEqual(['good first issue', 'help wanted']);
    const runtime = profile(); calls.length = 0;
    await enrichSocial(runtime, api);
    expect(runtime.busFactor).toBeUndefined(); expect(calls.filter(call => call.startsWith('/contributors?'))).toHaveLength(1);
  });
  it('leaves optional fields absent when rate limited and never invents adoption links or maintenance counts', async () => {
    const p = profile(); const api = vi.fn().mockRejectedValue(new Error('rate limited'));
    await enrichSocial(p, api);
    expect(p).not.toHaveProperty('repoIssues'); expect(p).not.toHaveProperty('busFactor');
    expect(p.components.every(c => c.maintainers === undefined && c.issues === undefined)).toBe(true);
  });
});
