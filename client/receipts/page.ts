import { h } from '../app/util';
import { installLanguageUi, setLanguage } from '../i18n';
import { isLocale } from '../../shared/i18n/locale';
import { openReceipt } from './panel';
import './receipt.css';
// Clear the fragment before network work. Never copy the capability to a query or a return link.
const params=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1));
const id=params.get('id')??'',ticket=fragment.get('handoff');
if(location.hash)history.replaceState(null,'',location.pathname+location.search);
const language=params.get('lang');if(isLocale(language))setLanguage(language);
installLanguageUi();
const root=document.querySelector<HTMLElement>('#receipt-app')!;
const panel=h('section.panel.ap-receipt');
root.append(h('h1',null,'GITZILLA'),h('p',null,'Connect your wallet here. Your game stays in the original browser.'),panel,h('p.dim',null,'When finished, switch back to your original browser tab. Do not join the room again from the wallet.'));
const storageKey='gitzilla.receipt.access.'+id;
let dead=false,dispose:(()=>void)|undefined;
window.addEventListener('pagehide',()=>{dead=true;dispose?.();});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
function error(){panel.replaceChildren(h('h2.panel-title',null,'Wallet link unavailable'),h('p',null,'This wallet link is invalid or expired. Open a new link from the game.'));}
async function start(){
  if(!/^[a-f0-9-]{36}$/.test(id)){error();return;}
  let grant:{token:string;expiresAt:number}|undefined;
  try{
    if(ticket){
      const res=await fetch(`/api/receipts/${id}/redeem`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket}),signal:AbortSignal.timeout(15000)});
      if(!res.ok)throw new Error('Invalid link');grant=await res.json();
      try{sessionStorage.setItem(storageKey,JSON.stringify(grant));}catch{/* Receipt still works until this page closes. */}
    }else{
      try{grant=JSON.parse(sessionStorage.getItem(storageKey)??'null')??undefined;}catch{}
    }
    if(!grant||!grant.token||grant.expiresAt<=Date.now())throw new Error('Expired');
    if(dead)return;
    dispose=await openReceipt(panel,id,grant.token,()=>dead,{scoped:true});
  }catch{try{sessionStorage.removeItem(storageKey);}catch{}if(!dead)error();}
}
void start();
