import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
interface QR {
  addData(data: string, mode: 'Byte'): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, column: number): boolean;
}
const qrcode = require('./vendor/qrcode.cjs') as (version: number, correction: 'M') => QR;

function encode(text: string): QR {
  const qr = qrcode(0, 'M');
  // The vendored byte encoder expects one JS character per byte.
  qr.addData(Buffer.from(text, 'utf8').toString('latin1'), 'Byte');
  qr.make();
  return qr;
}

export function qrSvg(text: string): string {
  const qr = encode(text);
  const count = qr.getModuleCount();
  const size = count + 8;
  const cells: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) cells.push(`M${col + 4},${row + 4}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 6}" height="${size * 6}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${cells.join('')}" fill="#000"/></svg>`;
}

/** Two QR module rows per terminal line; explicit colors also work on dark terminals. */
export function qrTerminal(text: string): string {
  const qr = encode(text);
  const count = qr.getModuleCount();
  const size = count + 8;
  const dark = (row: number, col: number) => row >= 4 && col >= 4 && row < count + 4 && col < count + 4 && qr.isDark(row - 4, col - 4);
  const rows: string[] = [];
  for (let row = 0; row < size; row += 2) {
    let line = '';
    for (let col = 0; col < size; col++) {
      const top = dark(row, col), bottom = dark(row + 1, col);
      line += top ? (bottom ? '█' : '▀') : (bottom ? '▄' : ' ');
    }
    rows.push(`\x1b[30;47m${line}\x1b[0m`);
  }
  return rows.join('\n');
}
