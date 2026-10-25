import { isLocale, type Locale } from '../../shared/i18n/locale';
export type MobileWallet='Phantom'|'Solflare';
const wallets={Phantom:'https://phantom.com/ul/browse/',Solflare:'https://solflare.com/ul/v1/browse/'};
/** Only a short-lived receipt ticket crosses to the wallet; never the room session. */
export function walletBrowseUrl(wallet:MobileWallet,origin:string,id:string,ticket:string,language:Locale):string {
  const site=new URL(origin);
  if(site.protocol!=='https:'||site.origin!==origin)throw new Error('Mobile wallet links require the HTTPS game site');
  if(!/^[a-f0-9-]{36}$/.test(id)||!/^[A-Za-z0-9_-]{43}$/.test(ticket)||!isLocale(language))throw new Error('Invalid wallet link');
  const target=new URL('/receipt.html',site);target.searchParams.set('id',id);target.searchParams.set('lang',language);
  target.hash=new URLSearchParams({handoff:ticket}).toString();
  return wallets[wallet]+encodeURIComponent(target.href)+'?ref='+encodeURIComponent(origin);
}
