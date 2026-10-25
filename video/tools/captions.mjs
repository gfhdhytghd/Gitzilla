// VO → timed caption chunks. Splits each line at sentence/comma breaks (≤ 44 chars a chunk), spreads the chunks over
// the clip by character count, then snaps every boundary to the nearest real pause in the audio (ffmpeg silencedetect).
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const root = new URL("../", import.meta.url).pathname;
const { lines } = JSON.parse(readFileSync(`${root}vo/lines.json`, "utf8"));
const MAX = 44;
function chunks(text) {
  const parts = text.replace(/D\.N\.A\./g, "DNA").split(/(?<=[.,:?!])\s+/);
  const out = [];
  for (const p of parts) {
    const last = out.at(-1);
    if (last && (last + " " + p).length <= MAX && !/[.?!:]$/.test(last)) out[out.length - 1] = last + " " + p;
    else if (p.length > MAX) {           // split a long clause into balanced pieces at word breaks
      const words = p.split(" "), target = p.length / Math.ceil(p.length / MAX);
      let a = "";
      for (const w of words) { if (a && (a + " " + w).length > target + 4) { out.push(a); a = w; } else a = a ? `${a} ${w}` : w; }
      out.push(a);
    } else out.push(p);
  }
  return out;
}
const result = {};
for (const [id, text] of Object.entries(lines)) {
  const f = `${root}vo/${id}.wav`;
  const res = require_ffmpeg(f);
  const dur = res.dur, pauses = res.pauses;
  const cs = chunks(text);
  const total = cs.reduce((a, c) => a + c.length, 0);
  let acc = 0; const bounds = [0];
  for (let i = 0; i < cs.length - 1; i++) {
    acc += cs[i].length;
    const guess = res.speechStart + (res.speechEnd - res.speechStart) * acc / total;
    const near = pauses.map((p) => ({ p, d: Math.abs(p - guess) })).sort((a, b) => a.d - b.d)[0];
    bounds.push(near && near.d < 0.6 ? near.p : guess);
  }
  bounds.push(dur);
  result[id] = { dur, chunks: cs.map((text, i) => ({ text, from: +bounds[i].toFixed(2), to: +bounds[i + 1].toFixed(2) })) };
}
function require_ffmpeg(f) {
  const r = (() => { try { return execFileSync("sh", ["-c", `ffmpeg -hide_banner -i "${f}" -af silencedetect=n=-38dB:d=0.12 -f null - 2>&1`], { encoding: "utf8" }); } catch (e) { return e.stdout ?? ""; } })();
  const dur = Number(/Duration: (\d+):(\d+):([\d.]+)/.exec(r).slice(1).reduce((a, x, i) => a + Number(x) * [3600, 60, 1][i], 0));
  const starts = [...r.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const ends = [...r.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  const speechStart = starts[0] === 0 || (starts[0] ?? 1) < 0.05 ? ends[0] ?? 0 : 0;
  const lastStart = starts.at(-1) ?? dur;
  const speechEnd = lastStart > dur - 0.6 && lastStart > speechStart + 0.5 ? lastStart : dur;
  const pauses = starts.map((s, i) => [s, ends[i]]).filter(([s, e]) => e !== undefined && s > speechStart + 0.2 && e < speechEnd - 0.1).map(([s, e]) => (s + e) / 2);
  return { dur, speechStart, speechEnd, pauses };
}
writeFileSync(`${root}src/captions.json`, JSON.stringify(result, null, 1));
for (const [id, r] of Object.entries(result)) console.log(id, r.dur.toFixed(2), r.chunks.map((c) => `[${c.from}-${c.to}] ${c.text}`).join("\n   "));
