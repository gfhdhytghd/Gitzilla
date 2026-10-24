import { describe,it,expect,vi } from 'vitest';
import { analyzeClassroomSubmission } from './classroom';
import { archive } from './fixtures';
const sha='a'.repeat(40);
const json=(data:unknown)=>new Response(JSON.stringify(data));
const body=archive([{path:'src/main.ts',text:'export const answer = 42'}, {path:'README.md',text:'# Project'}]);
describe('classroom GitHub boundary',()=>{
  it('resolves a branch once, downloads its exact SHA and accepts only matching CI',async()=>{
    const urls:string[]=[];
    const fetcher=vi.fn(async(input:string|URL|Request)=>{
      const url=String(input);urls.push(url);
      if(url.endsWith('/commits/feature%2Fone'))return json({sha});
      if(url.includes('codeload'))return new Response(new Uint8Array(body));
      if(url.includes('/check-runs'))return json({check_runs:[{head_sha:sha,name:'tests',status:'completed',conclusion:'success'},{head_sha:'b'.repeat(40),name:'wrong',status:'completed',conclusion:'success'}]});
      return json({});
    }) as typeof fetch;
    const result=await analyzeClassroomSubmission('demo/repo','feature/one','',fetcher);
    expect(result.commit).toBe(sha);expect(result.files.some(f=>f.path==='src/main.ts')).toBe(true);
    expect(urls).toContain(`https://codeload.github.com/demo/repo/tar.gz/${sha}`); expect(result.checks.map(c=>c.name)).toEqual(['tests']);
    expect(result.profile.fallback).toBeUndefined();expect(urls.some(u=>u.includes('vulns')||u.includes('/issues'))).toBe(false);
  });
  it('fails closed when commit resolution is forbidden without downloading fallback data',async()=>{
    const fetcher=vi.fn(async()=>new Response('',{status:403})) as typeof fetch;
    await expect(analyzeClassroomSubmission('demo/repo','main','',fetcher)).rejects.toThrow('403');expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('uses the authenticated archive for a private submission and treats missing CI as unmet',async()=>{
    const calls:{url:string,init?:RequestInit}[]=[];
    const fetcher=vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{
      const url=String(input);calls.push({url,init});
      if(url.endsWith('/commits/HEAD'))return json({sha});
      if(url.includes('/tarball/'))return new Response(new Uint8Array(body));
      if(url.includes('/check-runs'))return new Response('',{status:403});
      return json({private:true});
    }) as typeof fetch;
    const result=await analyzeClassroomSubmission('demo/repo','HEAD','fixture-only',fetcher);
    expect(result.checks).toEqual([]);expect(calls.find(c=>c.url.endsWith(`/tarball/${sha}`))?.init?.headers).toHaveProperty('Authorization','Bearer fixture-only');
  });
});
