// Tiny tar builder used by tests: no fixture checkout, network, or third-party tar dependency.
import { gzipSync } from 'node:zlib';
import type { SourceFile } from './files.ts';

export function tarMember(name: string, content: string | Buffer, type = '0'): Buffer {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const header = Buffer.alloc(512);
  header.write(name, 0, Math.min(100, Buffer.byteLength(name)));
  header.write('0000644\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
  header.write('00000000000\0', 136);
  header.fill(32, 148, 156);
  header.write(type, 156);
  header.write('ustar\0', 257);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
  return Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512)]);
}
export function archive(files: SourceFile[]): Buffer {
  return gzipSync(Buffer.concat([...files.map(file => tarMember(`repo-HEAD/${file.path}`, file.text)), Buffer.alloc(1024)]));
}
export async function* splitChunks(buffer: Buffer, size = 37): AsyncGenerator<Buffer> {
  for (let offset = 0; offset < buffer.length; offset += size) yield buffer.subarray(offset, offset + size);
}
