import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Server/tool use only. Never import this module into the browser bundle. */
export function parseEnvValue(contents: string, names: readonly string[]): string | undefined {
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([\w-]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || !names.includes(match[1])) continue;
    const raw = match[2];
    const value = raw.startsWith('"') || raw.startsWith("'")
      ? raw.slice(1, raw.indexOf(raw[0], 1) < 0 ? undefined : raw.indexOf(raw[0], 1))
      : raw.replace(/\s+#.*$/, '').trim();
    if (value) return value;
  }
}
export async function readProviderSetting(rootDir: string, ...names: string[]): Promise<string | undefined> {
  for (const name of names) if (process.env[name]?.trim()) return process.env[name]!.trim();
  for (const filename of [resolve(rootDir, '.env'), resolve(rootDir, '../.env')]) {
    try { const value = parseEnvValue(await readFile(filename, 'utf8'), names); if (value) return value; }
    catch { /* Optional configuration. */ }
  }
}

export type GeminiApi = 'interactions' | 'generateContent';
export class GeminiHttpError extends Error {
  constructor(public status: number) { super(`Gemini HTTP ${status}`); }
}

/** Plain REST, no conversation state. Never include response bodies or credentials in errors. */
export async function geminiJson(prompt: string, schema: object, options: {
  apiKey: string; model: string; api: GeminiApi; timeoutMs?: number; fetch?: typeof globalThis.fetch;
}): Promise<unknown> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    const interactions = options.api === 'interactions';
    const url = interactions ? 'https://generativelanguage.googleapis.com/v1beta/interactions'
      : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`;
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey },
      body: JSON.stringify(interactions ? {
        model: options.model, input: prompt, store: false,
        response_format: { type: 'text', mime_type: 'application/json', schema },
        generation_config: { max_output_tokens: 4096 },
      } : {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema },
      }),
    });
    if (!response.ok) throw new GeminiHttpError(response.status);
    const payload = await response.json();
    let content: string;
    if (interactions) {
      if (payload.status !== 'completed') throw new Error('Incomplete Gemini interaction');
      // Current REST uses model_output steps; earlier Interactions responses use outputs.
      const blocks = Array.isArray(payload.steps)
        ? payload.steps.filter((step: { type?: string }) => step.type === 'model_output')
          .flatMap((step: { content?: unknown[] }) => Array.isArray(step.content) ? step.content : [])
        : Array.isArray(payload.outputs) ? payload.outputs : [];
      content = blocks.filter((block: { type?: string; text?: string; thought?: boolean }) => block.type === 'text' && typeof block.text === 'string' && !block.thought)
        .map((block: { text: string }) => block.text).join('');
    } else {
      const candidate = payload.candidates?.[0];
      if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error('Incomplete Gemini generation');
      content = candidate?.content?.parts?.filter((part: { text?: string; thought?: boolean }) => typeof part.text === 'string' && !part.thought)
        .map((part: { text: string }) => part.text).join('') ?? '';
    }
    return JSON.parse(content);
  } finally { clearTimeout(timer); }
}

export const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
export const DEEPSEEK_MODEL = 'deepseek-flash';
export async function deepseekJson(prompt: string, options: {
  apiKey: string; model?: string; timeoutMs?: number; maxTokens?: number; fetch?: typeof globalThis.fetch;
}): Promise<unknown> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  try {
    const response = await (options.fetch ?? globalThis.fetch)(DEEPSEEK_URL, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify({ model: options.model ?? DEEPSEEK_MODEL, thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' },
        max_tokens: options.maxTokens ?? 4096, stream: false }),
    });
    if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
    const payload = await response.json();
    const choice = payload.choices?.[0];
    if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') throw new Error('Incomplete DeepSeek response');
    return JSON.parse(choice.message.content);
  } finally { clearTimeout(timer); }
}
