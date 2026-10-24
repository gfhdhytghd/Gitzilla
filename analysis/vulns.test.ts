import { describe, expect, it, vi } from 'vitest';
import { declaredDependencies } from './dependencies.ts';
import { profileFromFiles } from './graph.ts';
import { shouldKeep } from './files.ts';
import { fixedVersion, queryDeclaredVulns } from './vulns.ts';

const p = () => profileFromFiles('class/deps', [{ path: 'src/main.ts', text: 'export const main = 1' }]);
const json = (data: unknown) => new Response(JSON.stringify(data));
const manifest = (version = '2.0.1') => [{ path: 'src/package.json', text: JSON.stringify({ dependencies: { demo: version } }) }];
const advisory = (id = 'GHSA-fixture') => ({ id, summary: 'Public dependency advisory', affected: [{ package: { name: 'demo', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.0.2' }, { introduced: '2.0.0' }, { fixed: '2.0.4' }] }] }] });

describe('declared dependencies and verified public OSV advisories', () => {
  it('retains supported manifests without counting them as source', () => {
    for (const file of ['requirements.txt', 'requirements-dev.txt', 'requirements/test.txt', 'pyproject.toml', 'Cargo.lock', 'go.mod', 'pom.xml']) expect(shouldKeep(file)).toBe(true);
    expect(shouldKeep('vendor/Cargo.lock')).toBe(false);
    expect(declaredDependencies([{ path: 'package.json', text: '{"dependencies":{"https://user:pass@example.test":"1.0.0"}}' }], p())).toEqual([]);
  });
  it('parses concrete npm, Python, Cargo, Go and Maven declarations while skipping ranges and local forks', () => {
    const deps = declaredDependencies([
      { path: 'src/package.json', text: JSON.stringify({ dependencies: { pinned: '1.2.3', caret: '^1.2.3', minor: '1.2', local: 'file:../other' } }) },
      { path: 'requirements.txt', text: '# ignore==1.0\nrequests==2.0.0; python_version > "3"\nnewer>=1.0\nstar==1.*' },
      { path: 'pyproject.toml', text: '[project]\ndescription="fake==1.0"\ndependencies = [\n "flask==2.0.0",\n]\n[tool.poetry.dependencies]\npython=">=3.11"\njinja2="3.0.0"' },
      { path: 'Cargo.toml', text: '[dependencies]\nserde="=1.0.0"\nrange="1.0.0"\nlocal={path="../local",version="=1.0.0"}' },
      { path: 'Cargo.lock', text: '[[package]]\nname="tokio"\nversion="1.0.0"\nsource="registry+https://github.com/rust-lang/crates.io-index"\n[[package]]\nname="workspace"\nversion="1.0.0"' },
      { path: 'go.mod', text: 'module class/project\nrequire (\n golang.org/x/text v0.1.0\n example.com/replaced v1.0.0\n)\nreplace example.com/replaced => ../local' },
      { path: 'pom.xml', text: '<project><properties><foo.version>1.2.3</foo.version></properties><dependency><groupId>org.example</groupId><artifactId>foo</artifactId><version>${foo.version}</version></dependency><!-- <dependency><groupId>bad</groupId><artifactId>old</artifactId><version>1.0</version></dependency> --></project>' },
    ], p());
    expect(deps.map(d => d.name).sort()).toEqual(['flask', 'golang.org/x/text', 'jinja2', 'org.example:foo', 'pinned', 'requests', 'serde', 'tokio']);
    expect(deps.find(d => d.name === 'pinned')?.component).toBe('src');
    expect(deps.every(d => !/[~^*><]/.test(d.version))).toBe(true);
  });
  it('never sends Flask-style ranges, wildcards, compound constraints, URLs or comments to OSV', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const files = [
      { path: 'pyproject.toml', text: '[project]\ndependencies = [\n "Werkzeug>=3.1",\n "Jinja2>=3.1.2", # "comment==1.0"\n # "ignored==1.0"\n]\n[tool.poetry.dependencies]\nrequests="^2.30"\n[tool.poetry.group.dev.dependencies]\npytest="~8.0"' },
      { path: 'requirements.txt', text: 'one>=1.2\ntwo~=2.0\nthree==1.*\nfour==1.0 ,!=1.0\nfive==1.0,!=1.0\nsix===1.0\nurl @ https://example.test/1.0\n# seven==1.0' },
      { path: 'package.json', text: JSON.stringify({ dependencies: { a: '^1.2.3', b: '~1.2.3', c: '>=1.2.3', d: '*', e: 'latest', f: '1.2.x', g: '1.2.3 || 2.0.0', h: 'npm:demo@1.2.3' } }) },
      { path: 'Cargo.toml', text: '[dependencies]\na="1.2.3"\nb="^1.2.3"\nc="*"\n# d="=1.2.3"' },
    ];
    expect(declaredDependencies(files, p())).toEqual([]);
    expect(await queryDeclaredVulns(files, p(), { fetcher })).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('ignores excluded Go versions and retains the first actual pin source', () => {
    const files = [
      { path: 'go.mod', text: 'module class/project\nrequire example.org/actual v1.2.3\nexclude (\n example.org/excluded v1.0.0\n)\nreplace (\n example.org/fork v2.0.0 => ../local\n)\nrequire (\n example.org/fork v2.0.0\n)' },
      { path: 'src/requirements.txt', text: 'demo==1.0 # pin\n' },
      { path: 'src/requirements-dev.txt', text: 'demo==1.0' },
    ];
    const deps = declaredDependencies(files, p());
    expect(deps.filter(d => d.ecosystem === 'Go').map(d => d.name)).toEqual(['example.org/actual']);
    expect(deps.find(d => d.name === 'demo')?.file).toBe('src/requirements-dev.txt');
  });
  it('records the literal checked version and manifest, never sends auth/source, and selects the containing interval fix', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); calls.push({ url, init });
      return json(url.endsWith('/querybatch') ? { results: [{ vulns: [{ id: 'GHSA-fixture' }] }] } : advisory());
    }) as typeof fetch;
    expect(await queryDeclaredVulns(manifest(), p(), { fetcher })).toEqual([{ id: 'GHSA-fixture', pkg: 'demo', ecosystem: 'npm', version: '2.0.1', source: 'src/package.json', summary: 'Public dependency advisory', fixed: '2.0.4', component: 'src' }]);
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ queries: [{ package: { name: 'demo', ecosystem: 'npm' }, version: '2.0.1' }] });
    expect(calls.every(call => !new Headers(call.init?.headers).has('Authorization'))).toBe(true);
    expect(JSON.stringify(calls)).not.toMatch(/export const|src\/package/);
  });
  it.each(['fixed', 'before-introduced', 'wrong-package', 'wrong-id', 'withdrawn', 'missing-details', 'unsupported-range'])('does not report %s evidence even when a batch ID is returned', async reason => {
    const detail = advisory();
    let version = '2.0.1';
    if (reason === 'fixed') version = '2.0.4';
    if (reason === 'before-introduced') version = '1.9.9';
    if (reason === 'wrong-package') detail.affected[0].package.name = 'different';
    if (reason === 'wrong-id') detail.id = 'GHSA-other';
    if (reason === 'unsupported-range') detail.affected[0].ranges[0].type = 'GIT';
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/querybatch')) return json({ results: [{ vulns: [{ id: 'GHSA-fixture' }] }] });
      if (reason === 'missing-details') return new Response('', { status: 503 });
      return json({ ...detail, ...(reason === 'withdrawn' ? { withdrawn: '2026-01-01' } : {}) });
    }) as typeof fetch;
    expect(await queryDeclaredVulns(manifest(version), p(), { fetcher })).toEqual([]);
  });
  it('requires the exact-version API match even when an advisory for that package exists', async () => {
    const fetcher = vi.fn(async () => json({ results: [{}] })) as typeof fetch;
    expect(await queryDeclaredVulns(manifest(), p(), { fetcher })).toEqual([]);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('distinguishes unavailable from no matches, checks batch alignment, and caps verified records at twelve', async () => {
    const offline = vi.fn(async () => { throw new Error('offline'); }) as typeof fetch;
    expect(await queryDeclaredVulns(manifest(), p(), { fetcher: offline })).toBeUndefined();
    expect(await queryDeclaredVulns(manifest(), p(), { fetcher: vi.fn(async () => json({ results: [] })) as typeof fetch })).toBeUndefined();
    const many = vi.fn(async (input: string | URL | Request) => String(input).endsWith('/querybatch')
      ? json({ results: [{ vulns: Array.from({ length: 20 }, (_, i) => ({ id: `GHSA-${i}` })) }] }) : json(advisory(String(input).split('/').at(-1)))) as typeof fetch;
    expect(await queryDeclaredVulns(manifest(), p(), { fetcher: many })).toHaveLength(12);
  });
  it('merges GHSA/PYSEC/GO aliases for the same version and organ but keeps different versions distinct', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/querybatch')) return json({ results: Array.from({ length: 2 }, () => ({ vulns: [{ id: 'GHSA-one' }, { id: 'GO-two' }] })) });
      const id = String(input).split('/').at(-1);
      return json({ ...advisory(id), aliases: ['CVE-2026-1234', id === 'GHSA-one' ? 'GO-two' : 'GHSA-one'] });
    }) as typeof fetch;
    const result = await queryDeclaredVulns([...manifest(), { path: 'src/sub/package.json', text: '{"dependencies":{"demo":"2.0.2"}}' }], p(), { fetcher });
    expect(result).toHaveLength(2);
    expect(result?.map(v => v.version)).toEqual(['2.0.1', '2.0.2']);
    expect(result?.[0].aliases).toEqual(['CVE-2026-1234', 'GO-two']);
  });
  it('does not invent a fix for open-ended, listed-version-only, unsupported or different-package intervals', async () => {
    const dep = { name: 'demo', ecosystem: 'npm', version: '1.2.3-rc.1', file: 'package.json' };
    expect(fixedVersion({ affected: [{ package: { name: 'different', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '9.0.0' }] }] }] }, dep)).toBeUndefined();
    expect(fixedVersion({ affected: [{ package: { name: 'demo', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.2.3' }] }] }] }, dep)).toBe('1.2.3');
    const fetcher = vi.fn(async (input: string | URL | Request) => json(String(input).endsWith('/querybatch') ? { results: [{ vulns: [{ id: 'GHSA-fixture' }] }] }
      : { id: 'GHSA-fixture', affected: [{ package: { name: 'demo', ecosystem: 'npm' }, versions: ['2.0.1'] }] })) as typeof fetch;
    const result = await queryDeclaredVulns(manifest(), p(), { fetcher });
    expect(result).toHaveLength(1); expect(result?.[0].fixed).toBeUndefined();
    expect(fixedVersion({ affected: [{ package: { name: 'demo', ecosystem: 'PyPI' }, ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '0' }, { fixed: '1.2.3' }] }] }] }, { ...dep, ecosystem: 'PyPI', version: '1.2rc1' })).toBeUndefined();
  });
  it('honors inclusive last_affected and exclusive limit without presenting either as a fix', async () => {
    for (const ending of [{ last_affected: '2.0.1' }, { limit: '2.0.2' }]) {
      const fetcher = vi.fn(async (input: string | URL | Request) => json(String(input).endsWith('/querybatch') ? { results: [{ vulns: [{ id: 'GHSA-fixture' }] }] }
        : { ...advisory(), affected: [{ package: { name: 'demo', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '2.0.0' }, ending] }] }] })) as typeof fetch;
      const result = await queryDeclaredVulns(manifest(), p(), { fetcher });
      expect(result).toHaveLength(1); expect(result?.[0].fixed).toBeUndefined();
      expect(await queryDeclaredVulns(manifest('2.0.2'), p(), { fetcher })).toEqual([]);
    }
  });
});
