import { describe, expect, it } from 'vitest';
import { loadBalanceProfiles, syntheticProfile } from './bots.ts';
import { bossKitFromProfile, playerKitFromProfile } from './kits.ts';
import { createMatch } from './match.ts';
import type { SocialBossKit } from './social.ts';

describe('Adopt an Organ source data and equal budget', () => {
  it('marks up to two measured maintainers fragile and normalizes effective durability', () => {
    const p = syntheticProfile(5); p.cycles = []; p.components[0].maintainers = 1; p.components[1].maintainers = 2;
    const kit = bossKitFromProfile(p, 8);
    expect(kit.limbs[0]).toMatchObject({ fragile: true, weakPoint: false, maintainers: 1 });
    expect(kit.limbs[1]).toMatchObject({ fragile: true, weakPoint: false, maintainers: 2 });
    expect(kit.limbs[2].fragile).toBeUndefined();
    expect(kit.limbs.reduce((sum, l) => sum + l.maxHp / (l.weakPoint || l.fragile ? 1.5 : 1), 0) / kit.maxHp).toBeCloseTo(0.36, 3);
    const stable = structuredClone(p); stable.components[0].maintainers = 3;
    expect(kit.maxHp).toBe(bossKitFromProfile(stable, 8).maxHp);
    expect(kit.attacks).toEqual(bossKitFromProfile(stable, 8).attacks);
  });
  it('uses the least-maintained measured organ for repo bus factor one, breaking ties stably', () => {
    const p = syntheticProfile(5); p.cycles = []; p.busFactor = 1;
    p.components.forEach((c, i) => { c.maintainers = i === 0 ? 5 : 3; });
    const kit = bossKitFromProfile(p, 4);
    expect(kit.limbs.filter(l => l.fragile).map(l => l.component)).toEqual([p.components[1].name]);
    expect(kit.limbs.reduce((sum, l) => sum + l.maxHp / (l.weakPoint || l.fragile ? 1.5 : 1), 0) / kit.maxHp).toBeCloseTo(0.36, 3);
    p.components.forEach(c => { delete c.maintainers; });
    expect(bossKitFromProfile(p, 4).limbs.some(l => l.fragile)).toBe(false);
  });
  it('preserves real issues, maintainers and advisory fixes through cloned kits and autopsy', () => {
    const p = syntheticProfile(5), c = p.components[0]; c.maintainers = 1; c.topMaintainers = ['actual-fixture-author'];
    c.issues = [{ number: 12, title: 'Add parser tests', url: 'https://github.com/example/fixture/issues/12', labels: ['good first issue'] }];
    p.busFactor = 2; p.repoIssues = [{ number: 13, title: 'Improve docs', url: 'https://github.com/example/fixture/issues/13', labels: ['help wanted'] }];
    p.vulns = [{ id: 'OSV-FIXTURE', pkg: 'fixture', ecosystem: 'npm', summary: 'Public advisory fixture', fixed: '2.0', component: c.name }];
    const kit = structuredClone(bossKitFromProfile(p, 4)) as SocialBossKit;
    expect(kit.social?.topMaintainers[c.name]).toEqual(c.topMaintainers);
    const m = createMatch([{ id: 'a', name: 'A', kit: playerKitFromProfile(p) }], kit);
    const report = m.autopsy().boss;
    expect(report.busFactor).toBe(2); expect(report.repoIssues).toEqual(p.repoIssues);
    expect(report.limbs[0]).toMatchObject({ fragile: true, maintainers: 1, issues: c.issues, parasites: p.vulns });
    report.limbs[0].issues![0].title = 'mutated'; expect(m.autopsy().boss.limbs[0].issues![0].title).toBe('Add parser tests');
    report.repoIssues![0].title = 'mutated'; expect(m.autopsy().boss.repoIssues![0].title).toBe('Improve docs');
  });
  it('does not fabricate missing issues, authors or vulnerabilities', () => {
    const kit = bossKitFromProfile(syntheticProfile(2), 4);
    expect(kit.limbs.every(l => l.maintainers === undefined && l.issues === undefined && l.parasites === undefined)).toBe(true);
    expect((kit as SocialBossKit).social?.busFactor).toBeUndefined();
  });
  it('carries repo-level adoptable issues even without a component issue', () => {
    const p = syntheticProfile(2);
    p.repoIssues = [{ number: 3, title: 'Help with examples', url: 'https://github.com/example/fixture/issues/3', labels: ['help wanted'] }];
    const m = createMatch([{ id: 'a', name: 'A', kit: playerKitFromProfile(p) }], bossKitFromProfile(p, 4));
    expect(m.autopsy().boss.repoIssues).toEqual(p.repoIssues);
    expect(m.autopsy().boss.limbs.every(l => l.issues === undefined)).toBe(true);
  });
  it('gives the real bus-factor-one ripgrep profile a fragile organ with unchanged total budget', () => {
    const p = loadBalanceProfiles().find(p => p.slug === 'burntsushi/ripgrep')!;
    expect(p.busFactor).toBe(1);
    const least = Math.min(...p.components.flatMap(c => c.maintainers === undefined ? [] : [c.maintainers]));
    for (const count of [4, 6, 8]) {
      const kit = bossKitFromProfile(p, count);
      expect(kit.limbs.some(l => l.fragile && l.maintainers === least)).toBe(true);
      expect(kit.limbs.reduce((sum, l) => sum + l.maxHp / (l.weakPoint || l.fragile ? 1.5 : 1), 0) / kit.maxHp).toBeCloseTo(0.36, 3);
    }
  });
  it('slowly wears infected visual HP without changing break thresholds or core budget', () => {
    const p = syntheticProfile(5); p.vulns = [{ id: 'OSV-FIXTURE', pkg: 'fixture', ecosystem: 'npm', summary: 'Public fixture', component: p.components[0].name }];
    const m = createMatch([{ id: 'a', name: 'A', kit: playerKitFromProfile(p) }], bossKitFromProfile(p, 4));
    const raw = m as unknown as { state: ReturnType<typeof m.snapshot> }; const hp = raw.state.boss.limbs[0].hp;
    raw.state.t = 62;
    const s = m.snapshot(), limb = s.boss.limbs[0] as typeof s.boss.limbs[number] & { displayHp: number };
    expect(limb.hp).toBe(hp); expect(limb.displayHp).toBeCloseTo(hp * 0.9); expect(limb.broken).toBe(false);
    expect((s.boss.limbs[1] as unknown as { displayHp?: number }).displayHp).toBeUndefined();
  });
  it('gives fragile hits 1.5x organ damage and crit feedback without free core damage', () => {
    const p = syntheticProfile(5); p.cycles = []; p.components[0].maintainers = 1;
    const stable = structuredClone(p); stable.components[0].maintainers = 3;
    const make = (profile: typeof p) => createMatch([{ id: 'a', name: 'A', kit: playerKitFromProfile(p) }], bossKitFromProfile(profile, 4));
    const fragile = make(p), normal = make(stable);
    type Raw = { hurtBoss(p: ReturnType<typeof fragile.snapshot>['players'][number], id: string, damage: number, x: number, y: number): void };
    for (const m of [fragile, normal]) (m as unknown as Raw).hurtBoss(m.snapshot().players[0], 'limb-0', 10, 200, 100);
    const a = fragile.snapshot(), b = normal.snapshot();
    expect(a.boss.maxHp - a.boss.hp).toBeCloseTo(b.boss.maxHp - b.boss.hp);
    expect(a.boss.kit.limbs[0].maxHp - a.boss.limbs[0].hp).toBe(15);
    expect(b.boss.kit.limbs[0].maxHp - b.boss.limbs[0].hp).toBe(10);
    expect(a.events.find(e => e.type === 'hit')).toMatchObject({ crit: true });
  });
});
