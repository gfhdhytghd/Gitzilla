import { expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'three/addons/libs/fflate.module.js';
import { compactUSDText, compactUSDZ } from './spatial-usdz';

it('compacts numeric literals without rewriting quoted labels or asset references', () => {
  const text = '#usda 1.0\n def Mesh "Boss1.2345678" {\n point3f[] points = [(480.00000, -0.00000, 0.12345678)]\n asset t = @textures/v1.2345678.png@\n }';
  const result = compactUSDText(text);
  expect(result).toContain('[(480, 0, 0.12346)]');
  expect(result).toContain('"Boss1.2345678"'); expect(result).toContain('@textures/v1.2345678.png@');
  expect(result).toMatch(/^#usda 1\.0\n/); // Required USD magic/version must stay exact.
});

it('preserves stored entries, root-first ordering and64-byte alignment for every USDZ file', () => {
  const png = new Uint8Array([137, 80, 78, 71, 0, 1, 2, 3]);
  const data = compactUSDZ(zipSync({ 'model.usda': strToU8('#usda 1.0\nfloat a = 1.0000000'),
    'geometries/a.usda': strToU8('#usda 1.0\nfloat b = 0.30000000'), 'textures/color.png': png }, { level: 0 }));
  const unpacked = unzipSync(data); expect(Object.keys(unpacked)[0]).toBe('model.usda');
  expect(strFromU8(unpacked['model.usda'])).toMatch(/^#usda 1\.0\n/);
  expect(unpacked['textures/color.png']).toEqual(png); expect(strFromU8(unpacked['model.usda'])).toContain('float a = 1');
  const view = new DataView(data.buffer); let offset = 0, entries = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    expect(view.getUint16(offset + 8, true)).toBe(0); // STORE, never deflate
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    expect(start % 64).toBe(0);
    offset = start + view.getUint32(offset + 18, true); entries++;
  }
  expect(entries).toBe(3);
});
