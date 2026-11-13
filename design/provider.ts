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
  constructor(public status: number, public responseMessage?: string) { super(`Gemini HTTP ${status}${responseMessage ? `: ${responseMessage}` : ''}`); }
}
/** Safe request diagnostics: never include response bodies, request headers or credentials. */
export class ProviderRequestError extends Error {
  constructor(message: string, readonly kind: 'http' | 'timeout' | 'incomplete', readonly finishReason?: string) { super(message); }
}

/** Read only Gemini's structured error message, never raw bodies or extra details. */
async function geminiErrorMessage(response: Response, apiKey: string): Promise<string | undefined> {
  try {
    const payload = await response.json(), detail: unknown = payload?.error?.message;
    if (typeof detail !== 'string') return;
    let message = detail;
    // Providers can echo request credentials in an error; redact before diagnostics.
    for (const secret of new Set([apiKey, encodeURIComponent(apiKey)])) if (secret) message = message.split(secret).join('[REDACTED]');
    return message.replace(/\s+/g, ' ').trim().slice(0, 2000) || undefined;
  } catch { return; }
}

/** Plain REST, no conversation state. Errors include only a bounded, redacted provider message. */
export async function geminiJson(prompt: string, schema: object, options: {
  apiKey: string; model: string; api: GeminiApi; timeoutMs?: number; maxOutputTokens?: number; thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH'; fetch?: typeof globalThis.fetch;
  parseJson?: (text: string) => unknown;
  onContent?: (text: string, finishReason?: string) => void;
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
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema,
          ...(options.maxOutputTokens !== undefined ? { maxOutputTokens: options.maxOutputTokens } : {}),
          ...(options.thinkingLevel ? { thinkingConfig: { thinkingLevel: options.thinkingLevel } } : {}) },
      }),
    });
    if (!response.ok) throw new GeminiHttpError(response.status, await geminiErrorMessage(response, options.apiKey));
    const payload = await response.json();
    let content: string;
    if (interactions) {
      // Current REST uses model_output steps; earlier Interactions responses use outputs.
      const blocks = Array.isArray(payload.steps)
        ? payload.steps.filter((step: { type?: string }) => step.type === 'model_output')
          .flatMap((step: { content?: unknown[] }) => Array.isArray(step.content) ? step.content : [])
        : Array.isArray(payload.outputs) ? payload.outputs : [];
      content = blocks.filter((block: { type?: string; text?: string; thought?: boolean }) => block.type === 'text' && typeof block.text === 'string' && !block.thought)
        .map((block: { text: string }) => block.text).join('');
      options.onContent?.(content, typeof payload.status === 'string' ? payload.status : undefined);
      if (payload.status !== 'completed') throw new ProviderRequestError('Incomplete Gemini interaction', 'incomplete', payload.status);
    } else {
      const candidate = payload.candidates?.[0];
      content = candidate?.content?.parts?.filter((part: { text?: string; thought?: boolean }) => typeof part.text === 'string' && !part.thought)
        .map((part: { text: string }) => part.text).join('') ?? '';
      const finish = typeof candidate?.finishReason === 'string' ? candidate.finishReason : undefined;
      options.onContent?.(content, finish);
      if (finish && finish !== 'STOP') throw new ProviderRequestError(`Incomplete Gemini generation (finishReason=${finish.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)})`, 'incomplete', finish);
    }
    return (options.parseJson ?? JSON.parse)(content);
  } catch (error) {
    if (controller.signal.aborted) throw new ProviderRequestError(`Gemini request timed out after ${options.timeoutMs ?? 8000} ms`, 'timeout');
    throw error;
  } finally { clearTimeout(timer); }
}

export const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
export const DEEPSEEK_MODEL = 'deepseek-flash';
export async function deepseekJson(prompt: string, options: {
  apiKey: string; model?: string; timeoutMs?: number; maxTokens?: number; thinking?: boolean; reasoningEffort?: 'low' | 'high'; fetch?: typeof globalThis.fetch;
  parseJson?: (text: string) => unknown;
  onContent?: (text: string, finishReason?: string) => void;
}): Promise<unknown> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  try {
    const response = await (options.fetch ?? globalThis.fetch)(DEEPSEEK_URL, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify({ model: options.model ?? DEEPSEEK_MODEL, thinking: { type: options.thinking ? 'enabled' : 'disabled' },
        ...(options.thinking ? { reasoning_effort: options.reasoningEffort ?? 'high' } : {}),
        messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' },
        max_tokens: options.maxTokens ?? 4096, stream: false }),
    });
    if (!response.ok) throw new ProviderRequestError(`DeepSeek HTTP ${response.status}`, 'http');
    const payload = await response.json();
    const choice = payload.choices?.[0];
    const content = choice?.message?.content, finish = typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined;
    if (typeof content === 'string') options.onContent?.(content, finish);
    if (finish !== 'stop' || typeof content !== 'string') throw new ProviderRequestError(`Incomplete DeepSeek response (finish_reason=${(finish ?? 'missing').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)})`, 'incomplete', finish);
    return (options.parseJson ?? JSON.parse)(content);
  } catch (error) {
    if (controller.signal.aborted) throw new ProviderRequestError(`DeepSeek request timed out after ${options.timeoutMs ?? 20000} ms`, 'timeout');
    throw error;
  } finally { clearTimeout(timer); }
}
