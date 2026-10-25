import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getBase58Decoder, getBase58Encoder } from '@solana/kit';
import { canonical, RECEIPT_PREFIX, type ReceiptPayload, type SignedReceipt } from '../../shared/receipt';
const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
export const base58 = (bytes: Uint8Array) => getBase58Decoder().decode(bytes);
export const from58 = (value: string) => new Uint8Array(getBase58Encoder().encode(value));
export const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export const keyFromSeed = (seed: Uint8Array) => createPrivateKey({key:Buffer.concat([PKCS8,seed]),format:'der',type:'pkcs8'});
export const publicBytes = (seed: Uint8Array) => new Uint8Array(createPublicKey(keyFromSeed(seed)).export({format:'der',type:'spki'}).subarray(-32));
export function verifyEd25519(publicKey: string, message: Uint8Array, signature: string) {
  try {
    const key=from58(publicKey), sig=from58(signature);
    return key.length===32 && sig.length===64 && verify(null,message,createPublicKey({key:Buffer.concat([SPKI,key]),format:'der',type:'spki'}),sig);
  } catch { return false; }
}
export function loadSeed(path: string): Uint8Array {
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  if (!existsSync(path)) {
    try { writeFileSync(path,randomBytes(32),{mode:0o600,flag:'wx'}); }
    catch(error) { if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error; }
  }
  const file=statSync(path);if(!file.isFile() || (file.mode&0o077)!==0)throw new Error('Attestor key must be a private file');
  const seed=readFileSync(path);if(seed.length!==32)throw new Error('Invalid attestor key');return seed;
}
export function receiptDigest(payload: ReceiptPayload, salt: string) {
  return hash(canonical(payload)+'\0'+salt);
}
export function signReceipt(payload: ReceiptPayload, seed: Uint8Array): SignedReceipt {
  const salt=randomBytes(32).toString('hex'),digest=receiptDigest(payload,salt);
  return {payload,salt,digest,attestor:base58(publicBytes(seed)),signature:base58(sign(null,Buffer.from(RECEIPT_PREFIX+digest),keyFromSeed(seed)))};
}
export function verifyReceipt(receipt: SignedReceipt) {
  return receiptDigest(receipt.payload,receipt.salt)===receipt.digest
    && verifyEd25519(receipt.attestor,Buffer.from(RECEIPT_PREFIX+receipt.digest),receipt.signature);
}
