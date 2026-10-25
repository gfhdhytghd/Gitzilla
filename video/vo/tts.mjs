// Gemini TTS for the pitch voiceover. Reads the key from ~/data/HackPSU/.env (never printed).
// Usage: node tts.mjs [id ...]   (no ids = all lines in lines.json). Writes <id>.wav (24 kHz mono 16-bit).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const env = readFileSync(`${process.env.HOME}/data/HackPSU/.env`, "utf8");
const key = env.match(/^GEMINI[-_]API[-_]KEY=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!key) throw new Error("no Gemini key");
const lines = JSON.parse(readFileSync(new URL("./lines.json", import.meta.url)));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(lines.lines);
const model = process.env.TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
for (const id of ids) {
  const text = `${lines.style}\n\n${lines.lines[id]}`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: lines.voice } } } } }),
  });
  const j = await res.json().catch(() => ({}));
  const data = j?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!res.ok || !data) { console.log(id, "FAILED", res.status, JSON.stringify(j).slice(0, 300)); process.exitCode = 1; continue; }
  const pcm = Buffer.from(data.data, "base64");
  const rate = Number(/rate=(\d+)/.exec(data.mimeType)?.[1] ?? 24000);
  writeFileSync(new URL(`./${id}.wav`, import.meta.url), wav(pcm, rate));
  console.log(id, "ok", (pcm.length / 2 / rate).toFixed(2), "s", data.mimeType);
}
