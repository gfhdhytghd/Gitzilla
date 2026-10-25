import {staticFile} from 'remotion';

// Gitzilla's own palette (client/style.css): CRT black, terminal green, hot pink, amber.
export const C = {
  bg: '#05070b',
  panel: 'rgba(6, 10, 14, 0.86)',
  green: '#3dff8b',
  mint: '#7dffc0',
  pink: '#ff3d8b',
  amber: '#ffd23d',
  cyan: '#4fd8ff',
  ink: '#e9fff2',
  mute: '#8aa597',
};

export const F = {
  pix: '"Press Start 2P", monospace',
  small: '"Silkscreen", monospace',
  body: '"Unifont", monospace',
  term: '"VT323", monospace',
};

export const FPS = 30;
export const BAR = 2; // seconds; 120 BPM 4/4, every cut on a bar (music/compose.py)
export const W = 1920, H = 1080;

export const FONT_CSS = `
@font-face { font-family: "Press Start 2P"; src: url(${staticFile('fonts/PressStart2P.woff2')}) format("woff2"); }
@font-face { font-family: "Silkscreen"; font-weight: 400; src: url(${staticFile('fonts/Silkscreen-400.woff2')}) format("woff2"); }
@font-face { font-family: "Silkscreen"; font-weight: 700; src: url(${staticFile('fonts/Silkscreen-700.woff2')}) format("woff2"); }
@font-face { font-family: "VT323"; src: url(${staticFile('fonts/VT323.woff2')}) format("woff2"); }
@font-face { font-family: "Unifont"; src: url(${staticFile('fonts/unifont-18.0.01.woff2')}) format("woff2"); }
`;

export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const s2f = (s) => Math.round(s * FPS);
