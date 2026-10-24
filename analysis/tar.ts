import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { shouldKeep, type SourceFile } from './files.ts';

export const ARCHIVE_LIMITS = {
  maxBytes: 40 * 1024 * 1024,
  maxFiles: 20_000,
  maxFileBytes: 1024 * 1024,
};
export interface ArchiveLimits { maxBytes?: number; maxFiles?: number; maxFileBytes?: number }

function cString(buffer: Buffer): string {
  return buffer.toString('utf8').split('\0', 1)[0];
}
function tarNumber(buffer: Buffer): number {
  if (buffer[0] & 0x80) {
    let value = buffer[0] & 0x7f;
    for (let i = 1; i < buffer.length; i++) value = value * 256 + buffer[i];
    return value;
  }
  return parseInt(cString(buffer).trim() || '0', 8);
}
function paxPath(buffer: Buffer): string | undefined {
  let offset = 0;
  while (offset < buffer.length) {
    const space = buffer.indexOf(32, offset);
    if (space < 0) break;
    const length = Number(buffer.toString('ascii', offset, space));
    if (!length || offset + length > buffer.length) break;
    const record = buffer.toString('utf8', space + 1, offset + length - 1);
    if (record.startsWith('path=')) return record.slice(5);
    offset += length;
  }
}

/** Reads gzip/tar incrementally; retains source text, never writes archive members to disk.
 * A capped archive is a deterministic prefix sample, containing only complete files. */
export async function extractTarGz(
  input: AsyncIterable<Uint8Array>, overrides: ArchiveLimits = {},
): Promise<SourceFile[]> {
  const limits = { ...ARCHIVE_LIMITS, ...overrides };
  const source = Readable.from(input);
  const gunzip = createGunzip();
  source.on('error', error => gunzip.destroy(error));
  source.pipe(gunzip);
  const files: SourceFile[] = [];
  let pending = Buffer.alloc(0);
  let expanded = 0;
  let file: { name: string; size: number; remaining: number; padding: number; type: string; keep: boolean; chunks: Buffer[] } | undefined;
  let nextName: string | undefined;
  let stopped = false;
  try {
    archive: for await (const raw of gunzip) {
      const chunk = raw as Buffer;
      const available = Math.max(0, limits.maxBytes - expanded);
      pending = Buffer.concat([pending, chunk.subarray(0, available)]);
      expanded += chunk.length;
      while (true) {
        if (!file) {
          if (pending.length < 512) break;
          const header = pending.subarray(0, 512);
          pending = pending.subarray(512);
          if (header.every(byte => byte === 0)) { stopped = true; break archive; }
          const size = tarNumber(header.subarray(124, 136));
          if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid tar member size');
          const type = String.fromCharCode(header[156] || 48);
          const prefix = cString(header.subarray(345, 500));
          const headerName = `${prefix ? prefix + '/' : ''}${cString(header.subarray(0, 100))}`;
          const name = nextName ?? headerName;
          if (type !== 'x' && type !== 'g' && type !== 'L') nextName = undefined;
          // GitHub archives have one enclosing owner-revision directory.
          const relative = name.replace(/^\.\//, '').split('/').slice(1).join('/');
          const regular = type === '0';
          const safe = relative !== '' && !relative.split('/').includes('..') && !relative.startsWith('/');
          const keep = size <= limits.maxFileBytes && (type === 'x' || type === 'L' || (regular && safe && shouldKeep(relative)));
          file = { name: relative, size, remaining: size, padding: (512 - size % 512) % 512, type, keep, chunks: [] };
        }
        if (file.remaining) {
          if (!pending.length) break;
          const take = Math.min(file.remaining, pending.length);
          if (file.keep) file.chunks.push(Buffer.from(pending.subarray(0, take)));
          file.remaining -= take;
          pending = pending.subarray(take);
          if (file.remaining) break;
        }
        if (file.padding) {
          const take = Math.min(file.padding, pending.length);
          file.padding -= take;
          pending = pending.subarray(take);
          if (file.padding) break;
        }
        if (file.keep) {
          const content = Buffer.concat(file.chunks);
          if (file.type === 'L') nextName = cString(content).trim();
          else if (file.type === 'x') nextName = paxPath(content);
          else if (!content.includes(0)) files.push({ path: file.name, text: content.toString('utf8') });
        }
        file = undefined;
        if (files.length >= limits.maxFiles) { stopped = true; break archive; }
      }
      if (expanded >= limits.maxBytes) { stopped = true; break; }
    }
    if (!stopped && (file || pending.some(byte => byte !== 0))) throw new Error('Truncated tar archive');
    return files;
  } finally {
    source.unpipe(gunzip);
    source.destroy();
    gunzip.destroy();
  }
}
