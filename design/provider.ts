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
