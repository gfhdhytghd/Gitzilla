import { getWallets } from '@wallet-standard/app';
import type { SolanaSignMessageFeature } from '@solana/wallet-standard-features';
import type { ReceiptView } from '../../shared/receipt';
import { t, locale } from '../i18n';
import { walletBrowseUrl, type MobileWallet } from './mobile';
import { h } from '../app/util';
import { encode58 } from './base58';
import './receipt.css';
type Wallet=ReturnType<ReturnType<typeof getWallets>['get']>[number];
type Account=Wallet['accounts'][number];
type Connection={connect:()=>Promise<{accounts:readonly Account[]}>};
export async function openReceipt(el:HTMLElement,id:string,token:string,dead:()=>boolean,options:{scoped?:boolean}={}) {
  const endpoint=`/api/receipts/${encodeURIComponent(id)}`;
  async function api<T>(action='',input?:unknown):Promise<T> {
    let res:Response;try{res=await fetch(endpoint+action,{method:input===undefined?'GET':'POST',headers:{[options.scoped?'X-Receipt-Token':'X-Room-Token']:token,...(input===undefined?{}:{'Content-Type':'application/json'})},body:input===undefined?undefined:JSON.stringify(input),signal:AbortSignal.timeout(35000)});}catch{throw new Error('Receipt request timed out. Check its status before retrying.');}
    let data;try{data=await res.json();}catch{throw new Error('Receipt unavailable. Try again.');}if(!res.ok)throw new Error(typeof data.error==='string'?data.error:'Receipt unavailable. Try again.');return data;
  }
  let view=await api<ReceiptView>();if(dead())return ()=>{};
  let wallet:Wallet|undefined,account:Account|undefined,message='',working=false;
  let mobileTicket:{ticket:string;expiresAt:number}|undefined;
  const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const status=h('p',{role:'status','aria-live':'polite'}),controls=h('div.receipt-actions'),wallets=h('div.receipt-actions');
  const preview=h('pre.receipt-message',{translate:'no',hidden:true}),details=h('details',null,h('summary',null,'Signing message'),preview);
  const explain=h('p.dim',null,'Optional Devnet anchor: your wallet address, receipt ID, approximate signing time and salted result digest become public. Anyone can link this wallet to Gitzilla through the app signer. Published history cannot be deleted by Gitzilla. The app pays the test-network fee. Sign a message only; no token transfer.');
  const perform=async(task:()=>Promise<void>)=>{
    if(working||dead())return;working=true;render();
    try{await task();if(!dead())render();}catch(error){if(!dead())status.textContent=t(error instanceof Error?error.message:'Receipt unavailable. Try again.');}
    finally{working=false;if(!dead())render(false);}
  };
  const button=(label:string,task:()=>Promise<void>)=>h('button.btn',{disabled:working,onclick:()=>void perform(task)},label);
  const download=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(view.receipt,null,2)+'\n'],{type:'application/json'}));
    const link=h('a',{href:url,download:`gitzilla-receipt-${id}.json`});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const request=async()=>{
    if(!account)return;
    const reply=await api<{message?:string;view?:ReceiptView}>('/challenge',{wallet:account.address});
    if(dead())return;
    if(reply.view){view=reply.view;message='';}else message=reply.message??'';
  };
  const registry=getWallets();
  function renderWallets(){
    if(dead())return;
    const available=registry.get().filter(w=>w.features['standard:connect']&&w.features['solana:signMessage']&&w.chains.some(chain=>chain.startsWith('solana:')));
    wallets.replaceChildren(...available.map(w=>{
      const b=button('Connect wallet',async()=>{
        let connected;
        try{connected=await (w.features['standard:connect'] as Connection).connect();}
        catch{throw new Error('Wallet connection cancelled. You can still download the receipt.');}
        if(dead())return;
        const next=connected.accounts.find(a=>a.chains.some(chain=>chain.startsWith('solana:'))&&a.features.includes('solana:signMessage'));
        if(!next)throw new Error('Choose a Solana account that supports message signing.');
        wallet=w;account=next;message='';await request();
      });b.append(h('span',{translate:'no'},` · ${w.name}`));return b;
    }));
    if(!available.length)wallets.append(h('p.dim',null,'No compatible wallet detected. You can download the signed receipt without one.'));
    if(isMobile&&!options.scoped&&!available.length&&location.protocol==='https:'){
      if(mobileTicket&&mobileTicket.expiresAt>Date.now()){
        wallets.append(h('p',null,'Choose your wallet below. Keep the original game tab open.'));
        for(const name of ['Phantom','Solflare'] as MobileWallet[]){
          const link=h('a.btn',{href:walletBrowseUrl(name,location.origin,id,mobileTicket.ticket,locale()),'data-wallet':name,target:'_blank',rel:'noopener noreferrer',referrerpolicy:'no-referrer'},name==='Phantom'?'Open in Phantom':'Open in Solflare');
          link.addEventListener('click',event=>{if(!mobileTicket||mobileTicket.expiresAt<=Date.now()){event.preventDefault();mobileTicket=undefined;status.textContent=t('The wallet link expired. Create a new one.');render(false);}});
          wallets.append(link);
        }
        wallets.append(h('p.dim',null,'If the wallet does not open, install its app, return here, and create a new link.'));
        wallets.append(button('Create a new wallet link',async()=>{mobileTicket=await api<{ticket:string;expiresAt:number}>('/handoff',{});}));
      }else wallets.append(button('Connect with a mobile wallet',async()=>{mobileTicket=await api<{ticket:string;expiresAt:number}>('/handoff',{});}));
    }
    if(isMobile&&!options.scoped&&!available.length&&location.protocol!=='https:')wallets.append(h('p.dim',null,'Open the HTTPS game address to connect a mobile wallet.'));
    if(options.scoped&&!available.length)wallets.append(h('p.dim',null,'Open this page inside your wallet app, then approve its connection request. If this browser cannot connect, return to the original game tab and choose another wallet.'));

    wallets.hidden=!!account||view.status==='pending'||view.status==='finalized'||!view.anchorAvailable;
  }
  function render(updateStatus=true){
    if(dead())return;
    if(updateStatus)status.textContent=t(view.status==='finalized'?'Finalized on Solana Devnet.':view.status==='pending'?'Anchor pending. Check its status before retrying.':view.status==='expired'?'The transaction expired without finalizing. Sign again to retry.':view.status==='failed'?'The transaction failed. Sign again to retry.':'Signed by Gitzilla. Download it with or without a wallet.');
    controls.replaceChildren(button('Download signed receipt',async()=>download()));
    if(view.explorer)controls.append(h('a.btn',{href:view.explorer,target:'_blank',rel:'noopener noreferrer'},'View on Devnet explorer'));
    if(view.status==='pending')controls.append(button('Check anchor status',async()=>{view=await api<ReceiptView>('/refresh',{});message='';}));
    else if(view.status!=='finalized'&&account&&view.anchorAvailable){
      controls.append(h('code',{translate:'no'},account.address));
      if(message)controls.append(button('Sign message and anchor',async()=>{
        if(!wallet||!account)return;
        const bytes=new TextEncoder().encode(message);
        let signed;
        try{[signed]=await (wallet.features as unknown as SolanaSignMessageFeature)['solana:signMessage'].signMessage({account,message:bytes});}
        catch{throw new Error('Signing cancelled. Your receipt is still available to download.');}
        if(dead())return;
        if(!signed||signed.signature.length!==64||signed.signedMessage.length!==bytes.length||!bytes.every((b,i)=>b===signed.signedMessage[i]))throw new Error('The wallet changed the signing message. Nothing was published.');
        try{view=await api<ReceiptView>('/publish',{wallet:account.address,signature:encode58(signed.signature)});}
        catch(error){message='';try{view=await api<ReceiptView>();}catch{}throw error;}
        message='';
      }));
      else controls.append(button('Prepare signing message',request));
      if(view.status==='unclaimed')controls.append(button('Change wallet',async()=>{account=undefined;wallet=undefined;message='';}));
    }
    if(!view.anchorAvailable)controls.append(h('p.dim',null,'This receipt uses an archived signing key. Its signed download remains verifiable.'));
    preview.textContent=message;preview.hidden=!message;details.hidden=!message;
    renderWallets();
  }
  el.replaceChildren(h('h2.panel-title',null,'MATCH RECEIPT'),h('p',null,'A server-attested match result, not proof of fair gameplay or an NFT. Devnet history may be reset. Save the signed download.'),explain,status,controls,wallets,details);
  const resume=()=>{
    if(!options.scoped&&!document.hidden&&!working)void perform(async()=>{
      view=await api<ReceiptView>();
      if(view.status==='pending')view=await api<ReceiptView>('/refresh',{});
    });
  };
  document.addEventListener('visibilitychange',resume);
  const offRegister=registry.on('register',()=>renderWallets()),offUnregister=registry.on('unregister',()=>renderWallets());
  render();
  return ()=>{document.removeEventListener('visibilitychange',resume);offRegister();offUnregister();};
}
