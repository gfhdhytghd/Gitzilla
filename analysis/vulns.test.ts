import { describe, expect, it, vi } from 'vitest';
import { declaredDependencies } from './dependencies.ts';
import { profileFromFiles } from './graph.ts';
import { shouldKeep } from './files.ts';
import { fixedVersion, queryDeclaredVulns } from './vulns.ts';

const p = () => profileFromFiles('class/deps', [{ path: 'src/main.ts', text: 'export const main = 1' }]);
const json = (data: unknown) => new Response(JSON.stringify(data));

describe('declared dependencies and public OSV advisories', () => {
  it('retains supported manifests without counting them as source', () => {
    for (const file of ['requirements.txt', 'requirements-dev.txt', 'requirements/test.txt', 'pyproject.toml', 'Cargo.lock', 'go.mod', 'pom.xml']) expect(shouldKeep(file)).toBe(true);
    expect(shouldKeep('vendor/Cargo.lock')).toBe(false);
    expect(declaredDependencies([{ path: 'package.json', text: '{"dependencies":{"https://user:pass@example.test":"1.0.0"}}' }], p())).toEqual([]);
  });
  it('parses pinned npm, Python, Cargo, Go and Maven declarations while skipping ranges, local forks and comments', () => {
    const profile = p();
    const deps = declaredDependencies([
      { path: 'src/package.json', text: JSON.stringify({ dependencies: { pinned: '1.2.3', caret: '^1.2.3', minor: '1.2', local: 'file:../other' } }) },
      { path: 'requirements.txt', text: '# ignore==1.0\nrequests==2.0.0; python_version > "3"\nnewer>=1.0\nstar==1.*' },
      { path: 'pyproject.toml', text: '[project]\ndescription="fake==1.0"\ndependencies = [\n "flask==2.0.0",\n]\n[tool.poetry.dependencies]\npython=">=3.11"\njinja2="3.0.0"' },
      { path: 'Cargo.toml', text: '[dependencies]\nserde="=1.0.0"\nrange="1.0.0"\nlocal={path="../local",version="=1.0.0"}' },
      { path: 'Cargo.lock', text: '[[package]]\nname="tokio"\nversion="1.0.0"\nsource="registry+https://github.com/rust-lang/crates.io-index"\n[[package]]\nname="workspace"\nversion="1.0.0"' },
      { path: 'go.mod', text: 'module class/project\nrequire (\n golang.org/x/text v0.1.0\n example.com/replaced v1.0.0\n)\nreplace example.com/replaced => ../local' },
      { path: 'pom.xml', text: '<project><properties><foo.version>1.2.3</foo.version></properties><dependency><groupId>org.example</groupId><artifactId>foo</artifactId><version>${foo.version}</version></dependency><!-- <dependency><groupId>bad</groupId><artifactId>old</artifactId><version>1.0</version></dependency> --></project>' },
    ], profile);
    expect(deps.map(d => d.name).sort()).toEqual(['flask', 'golang.org/x/text', 'jinja2', 'org.example:foo', 'pinned', 'requests', 'serde', 'tokio']);
    expect(deps.find(d => d.name === 'pinned')?.component).toBe('src');
    expect(deps.every(d => !/[~^*><]/.test(d.version))).toBe(true);
  });
  it('queries only package/version metadata, maps public IDs to components and uses the matching fixed version', async () => {
    const profile = p();
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); calls.push({ url, init });
      if (url.endsWith('/querybatch')) return json({ results: [{ vulns: [{ id: 'GHSA-fixture' }] }] });
      return json({ id: 'GHSA-fixture', summary: 'Public dependency advisory', affected: [{ package: { name: 'demo', ecosystem: 'npm' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '1.0.2' }, { introduced: '2.0.0' }, { fixed: '2.0.4' }] }] }] });
    }) as typeof fetch;
    const result = await queryDeclaredVulns([{ path: 'src/package.json', text: '{"dependencies":{"demo":"2.0.1"}}' }], profile, { fetcher });
    expect(result).toEqual([{ id: 'GHSA-fixture', pkg: 'demo', ecosystem: 'npm', summary: 'Public dependency advisory', fixed: '2.0.4', component: 'src' }]);
    const payload = JSON.parse(calls[0].init!.body as string);
    expect(payload).toEqual({ queries: [{ package: { name: 'demo', ecosystem: 'npm' }, version: '2.0.1' }] });
    expect(calls.every(call => !new Headers(call.init?.headers).has('Authorization'))).toBe(true);
    expect(JSON.stringify(calls)).not.toContain('export const');
  });
  it('distinguishes unavailable/not checked from no matches and caps public advisory records at twelve', async () => {
    const file = [{ path: 'package.json', text: '{"dependencies":{"demo":"1.0.0"}}' }];
    const empty = vi.fn(async () => json({ results: [{}] })) as typeof fetch;
    expect(await queryDeclaredVulns(file, p(), { fetcher: empty })).toEqual([]);
    expect(await queryDeclaredVulns([], p(), { fetcher: empty })).toBeUndefined();
    const offline = vi.fn(async () => { throw new Error('offline'); }) as typeof fetch;
    expect(await queryDeclaredVulns(file, p(), { fetcher: offline })).toBeUndefined();
    const many = vi.fn(async (input: string | URL | Request) => String(input).endsWith('/querybatch')
      ? json({ results: [{ vulns: Array.from({ length: 20 }, (_, i) => ({ id: `GHSA-${i}` })) }] }) : json({ summary: 'Advisory' })) as typeof fetch;
    expect(await queryDeclaredVulns(file, p(), { fetcher: many })).toHaveLength(12);
  });
  it('does not recommend a fixed version from another package and handles a prerelease-to-stable fix', () => {
    const dep = { name: 'demo', ecosystem: 'npm', version: '1.2.3-rc1', file: 'package.json' };
    expect(fixedVersion({ affected: [{ package: { name: 'different', ecosystem: 'npm' }, ranges: [{ events: [{ fixed: '9.0.0' }] }] }] }, dep)).toBeUndefined();
    expect(fixedVersion({ affected: [{ package: { name: 'demo', ecosystem: 'npm' }, ranges: [{ events: [{ fixed: '1.2.3' }] }] }] }, dep)).toBe('1.2.3');
  });
});
