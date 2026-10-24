// Colors for the Genesis cinematic: GitHub-ish language colors (file tiles, language bar) and the UI ramp.

export const LANG_COLOR: Record<string, string> = {
  rust: "#dea584", c: "#8a96b0", "c++": "#f34b7d", go: "#00add8", typescript: "#3178c6", javascript: "#f1e05a",
  python: "#3572a5", "jupyter notebook": "#da5b0b", r: "#198ce7", julia: "#a270ba", java: "#b07219", kotlin: "#a97bff",
  "c#": "#178600", ruby: "#cc342d", php: "#4f5d95", lua: "#000080", shell: "#89e051", html: "#e34c26", css: "#663399",
  scss: "#c6538c", vue: "#41b883", swift: "#f05138", zig: "#ec915c", haskell: "#5e5086", markdown: "#6f9b85",
  json: "#cbcb41", yaml: "#cb171e", toml: "#9c4221", makefile: "#427819", dockerfile: "#384d54", roff: "#ecdebe",
  "objective-c": "#438eff", dart: "#00b4ab", elixir: "#6e4a7e", scala: "#c22d40", text: "#8aa39a",
};

const EXT: Record<string, string> = {
  rs: "rust", c: "c", h: "c", cc: "c++", cpp: "c++", hpp: "c++", cxx: "c++", go: "go", ts: "typescript", tsx: "typescript",
  mts: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", py: "python", pyi: "python",
  ipynb: "jupyter notebook", r: "r", jl: "julia", java: "java", kt: "kotlin", kts: "kotlin", cs: "c#", rb: "ruby",
  php: "php", lua: "lua", sh: "shell", bash: "shell", zsh: "shell", fish: "shell", html: "html", htm: "html", css: "css",
  scss: "scss", vue: "vue", swift: "swift", zig: "zig", hs: "haskell", md: "markdown", rst: "markdown", txt: "text",
  json: "json", yml: "yaml", yaml: "yaml", toml: "toml", mk: "makefile", m: "objective-c", dart: "dart", ex: "elixir",
  exs: "elixir", scala: "scala", "1": "roff",
};

export function langOfPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  if (/^makefile$/i.test(base)) return "makefile";
  if (/^dockerfile/i.test(base)) return "dockerfile";
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  return EXT[ext] ?? "text";
}

export function langColor(lang: string): string {
  return LANG_COLOR[lang.toLowerCase()] ?? hashColor(lang);
}

function hashColor(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  const pool = ["#7fd1b9", "#e58fc2", "#9fb4ff", "#e8c26a", "#8fe36b", "#ff9a7a", "#b08cff", "#6fd0e8"];
  return pool[(h >>> 0) % pool.length];
}

/** Bright, readable variant of any color for glows / labels on the dark CRT background. */
export function brighten(hex: string, amt = 0.35): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(v + (255 - v) * amt);
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export const UI = {
  bg: "#05070a",
  bg2: "#0a1118",
  grid: "#0f1c18",
  line: "#1d3b2b",
  green: "#39ff88",
  greenD: "#1a8a4a",
  cyan: "#3de8ff",
  red: "#ff3355",
  amber: "#ffb000",
  yellow: "#ffd23d",
  magenta: "#ff3d7f",
  text: "#d9ffe9",
  dim: "#6f9b85",
  dimmer: "#35574a",
};

/** Part → wire color for the map stage. */
export const PART_COLOR: Record<string, string> = {
  class: "#3de8ff", weapon: "#ffd23d", skill: "#b98cff", stats: "#39ff88", palette: "#ff9de2", limb: "#ffb000",
  heart: "#ff3355", weakpoint: "#ff3355", eyes: "#fff4c4", minions: "#9dff5a", attack: "#ff7a3d", theme: "#3de8ff",
  name: "#ffffff", glyphs: "#39ff88", cape: "#7ad7ff", scars: "#ff8a8a",
};

/** Boss archetypes (BossKit.archetype): accent color, name-card label, and the behavior preset in a few words. */
export const ARCH_LOOK: Record<string, { label: string; accent: string; accent2: string; form: string; moves: string }> = {
  kaiju: { label: "KAIJU", accent: "#5ff3ff", accent2: "#c8fbff", form: "upright saurian · glowing fins", moves: "stomp-walk · tail sweep · </> breath" },
  hydra: { label: "HYDRA", accent: "#ffcf4a", accent2: "#fff1b0", form: "many heads · wings", moves: "flies in arcs · a beam per head · dive bomb" },
  mecha: { label: "MECHA", accent: "#ff3b3b", accent2: "#ffb0a0", form: "armored machine · visor eyes", moves: "jet hops · rocket fists · missile barrage" },
  abyssal: { label: "ABYSSAL", accent: "#ff2d6a", accent2: "#5ff3ff", form: "crystal serpent · glowing veins", moves: "burrows · crystal eruptions · emerge strike" },
};
