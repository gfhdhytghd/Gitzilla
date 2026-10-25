// Verify the TTS by asking Gemini to transcribe each clip (key read from file, never printed).
import { readFileSync } from "node:fs";
const key = readFileSync(`${process.env.HOME}/data/HackPSU/.env`, "utf8").match(/^GEMINI[-_]API[-_]KEY=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
for (const f of process.argv.slice(2)) {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: "audio/wav", data: readFileSync(f).toString("base64") } }, { text: "Transcribe this audio verbatim. Then on a new line rate delivery 1-5 and note any glitches, mispronunciations or odd pauses in one short sentence." }] }] }),
  });
  const j = await res.json();
  console.log(`== ${f}\n${j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? JSON.stringify(j).slice(0, 200)}`);
}
