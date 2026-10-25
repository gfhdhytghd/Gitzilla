/** Compact ASCII numbers, without ZIP compression (USDZ requires stored entries)
 * or changing quoted names/asset references. Keep every file64-byte aligned. */
import { unzipSync, zipSync, strFromU8, strToU8 } from 'three/addons/libs/fflate.module.js';

export function compactUSDText(text: string): string {
  return text.replace(/#[^\n]*|"(?:\\.|[^"\\])*"|@[^@]*@|[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?/g, token => {
    if (token[0] === '#' || token[0] === '"' || token[0] === '@') return token;
    return String(Number(Number(token).toPrecision(5)));
  }).replace(/^[ \t]+/gm, '');
}

export function compactUSDZ(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const source = unzipSync(data), files: Parameters<typeof zipSync>[0] = {};
  let offset = 0;
  for (const [name, original] of Object.entries(source)) {
    const bytes = name.endsWith('.usda') ? strToU8(compactUSDText(strFromU8(original))) : original;
    const header = 30 + strToU8(name).length;
    let extra = 0;
    if ((offset + header) % 64 !== 0) {
      const padding = (64 - ((offset + header + 4) % 64)) % 64;
      files[name] = [bytes, { extra: { 12345: new Uint8Array(padding) } }]; extra = 4 + padding;
    } else files[name] = bytes;
    offset += header + extra + bytes.length;
  }
  return new Uint8Array(zipSync(files, { level: 0 }));
}
