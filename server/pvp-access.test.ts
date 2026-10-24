import { describe, it, expect, vi } from 'vitest';
import { verifyPvpAccess } from './pvp-access';
const user = { id: 42, login: 'Alice' };
function api(metadata: object, identity = user) {
  return vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/user') ? identity : metadata), { status: 200 })) as unknown as typeof fetch;
}
const own = { owner: { id: 42 }, full_name: 'Alice/project', private: false, fork: false };
describe('authenticated PvP repository eligibility', () => {
  it('accepts an owned original public or private repository by durable user ID', async () => {
    for (const privateRepo of [false, true]) {
      const fetcher = api({ ...own, private: privateRepo });
      expect(await verifyPvpAccess('alice/project', 'personal-token', fetcher)).toEqual({ userId: 42, login: 'Alice', repo: 'Alice/project', private: privateRepo });
      for (const call of (fetcher as any).mock.calls) expect(call[1].headers.Authorization).toBe('Bearer personal-token');
    }
  });
  it('accepts only public maintain/admin collaborators, not read, write or triage', async () => {
    for (const role of ['maintain', 'admin']) expect((await verifyPvpAccess('Alice/project', 't', api({ ...own, owner: { id: 7 }, permissions: { [role]: true } }))).userId).toBe(42);
    for (const permissions of [{ pull: true }, { push: true }, { triage: true }, {}, { maintain: 'true' }])
      await expect(verifyPvpAccess('Alice/project', 't', api({ ...own, owner: { id: 7 }, permissions }))).rejects.toThrow('PvP requires');
    await expect(verifyPvpAccess('Alice/project', 't', api({ ...own, owner: { id: 7 }, private: true, permissions: { admin: true } }))).rejects.toThrow('PvP requires');
  });
  it('never lets an owned fork bypass the restriction using admin permission', async () => {
    await expect(verifyPvpAccess('Alice/project', 't', api({ ...own, fork: true, permissions: { admin: true } }))).rejects.toThrow('own fork');
  });
  it('fails closed for anonymous, malformed, redirected or incomplete identities and metadata', async () => {
    await expect(verifyPvpAccess('Alice/project', '', api(own))).rejects.toThrow('Connect GitHub');
    await expect(verifyPvpAccess('https://github.com/Alice/project', 't', api(own))).rejects.toThrow('owner/repository');
    for (const metadata of [{ ...own, fork: undefined }, { ...own, private: undefined }, { ...own, full_name: 'other/repo' }, { ...own, owner: { login: 'Alice' } }])
      await expect(verifyPvpAccess('Alice/project', 't', api(metadata))).rejects.toThrow('incomplete');
    const failed = vi.fn(async () => new Response('no', { status: 403 })) as unknown as typeof fetch;
    await expect(verifyPvpAccess('Alice/project', 't', failed)).rejects.toThrow('could not verify');
  });
});
