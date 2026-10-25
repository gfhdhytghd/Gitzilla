/** Wallet signatures are 64 bytes; this small codec stays in the lazy receipt chunk. */
export function encode58(bytes:Uint8Array):string {
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n=0n;for(const byte of bytes)n=(n<<8n)+BigInt(byte);
  let out='';while(n){out=alphabet[Number(n%58n)]+out;n/=58n;}
  for(const byte of bytes){if(byte!==0)break;out='1'+out;}
  return out;
}
