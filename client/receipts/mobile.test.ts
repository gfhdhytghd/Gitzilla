import {describe,it,expect} from 'vitest';
import {walletBrowseUrl,type MobileWallet} from './mobile';
const origin='https://gitzilla.wilflin.me',id='01234567-1234-1234-1234-0123456789ab',ticket='a'.repeat(43);
describe('mobile wallet browse links',()=>{
  it.each(['Phantom','Solflare'] as MobileWallet[])('uses the official %s browse endpoint and a fragment-only receipt ticket',wallet=>{
    const link=new URL(walletBrowseUrl(wallet,origin,id,ticket,'zh'));
    expect(link.origin).toBe(wallet==='Phantom'?'https://phantom.com':'https://solflare.com');
    const prefix=wallet==='Phantom'?'/ul/browse/':'/ul/v1/browse/';expect(link.pathname.startsWith(prefix)).toBe(true);
    const target=new URL(decodeURIComponent(link.pathname.slice(prefix.length)));
    expect(target.origin).toBe(origin);expect(target.pathname).toBe('/receipt.html');
    expect(target.searchParams.get('id')).toBe(id);expect(target.searchParams.get('lang')).toBe('zh');
    expect(target.search).not.toContain(ticket);expect(new URLSearchParams(target.hash.slice(1)).get('handoff')).toBe(ticket);
    expect(link.searchParams.get('ref')).toBe(origin);
  });
  it('rejects insecure origins and malformed input instead of creating an external redirect',()=>{
    for(const bad of ['http://gitzilla.wilflin.me','javascript:alert(1)','https://gitzilla.wilflin.me/extra'])expect(()=>walletBrowseUrl('Phantom',bad,id,ticket,'en')).toThrow();
    expect(()=>walletBrowseUrl('Phantom',origin,'../evil',ticket,'en')).toThrow();
    expect(()=>walletBrowseUrl('Phantom',origin,id,'not-a-ticket','en')).toThrow();
  });
});
