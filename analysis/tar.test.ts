import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { archive, splitChunks, tarMember } from './fixtures.ts';
import { extractTarGz } from './tar.ts';

describe('streaming tar/gzip source extraction', () => {
  it('handles small stream chunks, strips the enclosing directory, keeps manifests, and skips vendor/binary/build files', async () => {
    const result = await extractTarGz(splitChunks(archive([
      { path: 'src/main.ts', text: 'export const kaiju = 1;' },
      { path: 'go.mod', text: 'module example.com/kaiju' },
      { path: 'package.json', text: '{"name":"kaiju"}' },
      { path: 'vendor/foreign.c', text: 'vendor' },
      { path: 'node_modules/x/main.js', text: 'dependency' },
      { path: 'dist/app.js', text: 'compiled' },
      { path: 'src/payload.py', text: '\0binary' },
      { path: 'logo.png', text: 'image' },
    ])));
    expect(result.map(f => f.path)).toEqual(['src/main.ts', 'go.mod', 'package.json']);
    expect(result[0].text).toBe('export const kaiju = 1;');
  });
  it('retains only complete files within byte, count, and individual-file limits', async () => {
    const data = archive([{ path: 'a.ts', text: 'a' }, { path: 'b.ts', text: 'b'.repeat(100) }, { path: 'c.ts', text: 'c' }]);
    expect((await extractTarGz(splitChunks(data), { maxFiles: 1 })).map(f => f.path)).toEqual(['a.ts']);
    expect((await extractTarGz(splitChunks(data), { maxFileBytes: 10 })).map(f => f.path)).toEqual(['a.ts', 'c.ts']);
    expect((await extractTarGz(splitChunks(data), { maxBytes: 1100 })).map(f => f.path)).toEqual(['a.ts']);
  });
  it('honors GNU long names and PAX paths, and ignores links and traversal paths', async () => {
    const longName = `repo-HEAD/${'long-directory/'.repeat(10)}main.ts`;
    const payload = `path=${longName}\n`;
    let length = Buffer.byteLength(payload) + 3;
    while (Buffer.byteLength(`${length} ${payload}`) !== length) length = Buffer.byteLength(`${length} ${payload}`);
    const data = gzipSync(Buffer.concat([
      tarMember('././@LongLink', longName + '\0', 'L'), tarMember('short', 'let a = 1'),
      tarMember('pax', `${length} ${payload}`, 'x'), tarMember('short', 'let b = 2'),
      tarMember('repo-HEAD/link.ts', 'elsewhere', '2'), tarMember('repo-HEAD/../escape.ts', 'nope'),
      Buffer.alloc(1024),
    ]));
    const result = await extractTarGz(splitChunks(data));
    expect(result.map(f => f.path)).toEqual([longName.split('/').slice(1).join('/'), longName.split('/').slice(1).join('/')]);
  });
  it('rejects damaged gzip and incomplete tar instead of pretending the data is complete', async () => {
    await expect(extractTarGz(splitChunks(Buffer.from('not gzip')))).rejects.toThrow();
    await expect(extractTarGz(splitChunks(gzipSync(tarMember('repo/a.ts', 'abc').subarray(0, 513))))).rejects.toThrow('Truncated');
  });
});
