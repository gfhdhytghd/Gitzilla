/** Independent verifier's protocol copy: parity-tested against the app signing message. */
export function walletBindingMessage(binding:{o:string;id:string;d:string;w:string;n:string;e:number},attestor:string):string {
  return ['Gitzilla wallet binding v1',`Origin: ${binding.o}`,'Network: solana:devnet',`Receipt: ${binding.id}`,`Digest: ${binding.d}`,`Wallet: ${binding.w}`,`Attestor: ${attestor}`,`Nonce: ${binding.n}`,`Expires: ${new Date(binding.e).toISOString()}`,'Bind this wallet to this server-attested result. No token transfer or mainnet transaction.'].join('\n');
}
