import type { IncomingMessage } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { githubIdFromSession, resolveGithubIdentity } from './github-identity';

describe('controller GitHub identity', () => {
  it('uses a signed GitHub subject ID directly and never derives identity from a login', async () => {
    const token = vi.fn(async () => 'secret'), fetcher = vi.fn();
    expect(await resolveGithubIdentity({} as IncomingMessage, { userId:'github|42',login:'renamed' }, token, fetcher)).toEqual({id:'42',login:'renamed'});
    expect(token).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
    for(const userId of ['github|0','github|alice','auth0|42','github|99999999999999999999'])expect(githubIdFromSession({userId,login:'42'})).toBeNull();
  });
  it('resolves linked Auth0 subjects using only the GitHub user endpoint and does not return a token', async () => {
    const fetcher=vi.fn(async (url,init)=>{expect(url).toBe('https://api.github.com/user');expect(init.headers.Authorization).toBe('Bearer fixture-token');expect(init.redirect).toBe('error');return Response.json({id:42,login:'alice'});}) as unknown as typeof fetch;
    const result=await resolveGithubIdentity({} as IncomingMessage,{userId:'auth0|linked',login:'old'},async()=> 'fixture-token',fetcher);
    expect(result).toEqual({id:'42',login:'alice'});expect(JSON.stringify(result)).not.toContain('fixture-token');
    expect(await resolveGithubIdentity({} as IncomingMessage,{userId:'auth0|linked',login:'old'},async()=>null,fetcher)).toBeNull();
    for(const body of [{id:0,login:'alice'},{id:42},{id:'42',login:'alice'}])expect(await resolveGithubIdentity({} as IncomingMessage,{login:'alice'},async()=> 'token',async()=>Response.json(body))).toBeNull();
  });
});
