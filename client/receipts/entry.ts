import { h } from '../app/util';
import { t } from '../i18n';
/** Wallet discovery is loaded only after an eligible player opens their receipt. */
export function createReceiptEntry(id:string,token:string) {
  let dead=false,dispose:(()=>void)|undefined;
  const el=h('section.panel.ap-receipt',{'data-testid':'match-receipt'});
  const button=h('button.btn',{onclick:async()=>{
    button.disabled=true;
    try {
      const {openReceipt}=await import('./panel');
      if(dead)return;
      dispose=await openReceipt(el,id,token,()=>dead);
    }catch{if(!dead){button.disabled=false;button.textContent=t('Receipt unavailable. Try again.');}}
  }},'Open match receipt');
  el.append(h('h2.panel-title',null,'MATCH RECEIPT'),h('p',null,'Save your signed PvP result. A wallet is optional.'),button);
  return {el,destroy(){dead=true;dispose?.();el.remove();}};
}
