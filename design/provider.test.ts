import { describe, expect, it, vi } from 'vitest';
import { GeminiHttpError, geminiJson } from './provider.ts';

const schema = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] };
const options = { apiKey: 'test-secret', model: 'gemini-3.8-flash', api: 'interactions' as const };
const payload = (value: unknown) => new Response(JSON.stringify(value));

describe('Gemini Interactions wire format', () => {
  it('requests stateless structured JSON and extracts only model answer text', async () => {
    const fetcher = vi.fn().mockResolvedValue(payload({ status: 'completed', steps: [
      { type: 'user_input', content: [{ type: 'text', text: 'ignore me' }] },
      { type: 'thought', content: [{ type: 'text', text: 'private reasoning' }] },
      { type: 'model_output', content: [{ type: 'image', data: 'ignore' }, { type: 'text', thought: true, text: 'ignore thought' }, { type: 'text', text: '{"title":' }, { type: 'text', text: '"Verified"}' }] },
    ] }));
    expect(await geminiJson('Public repo', schema, { ...options, fetch: fetcher })).toEqual({ title: 'Verified' });
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(request.headers['x-goog-api-key']).toBe('test-secret');
    expect(request.body).not.toContain('test-secret');
    expect(JSON.parse(request.body)).toEqual({ model: options.model, input: 'Public repo', store: false,
      response_format: { type: 'text', mime_type: 'application/json', schema }, generation_config: { max_output_tokens: 4096 } });
  });
  it('also reads the earlier outputs layout', async () => {
    const fetcher = vi.fn().mockResolvedValue(payload({ status: 'completed', outputs: [{ type: 'thought', text: 'ignore' }, { type: 'text', text: '{"title":"Earlier"}' }] }));
    expect(await geminiJson('Public', schema, { ...options, fetch: fetcher })).toEqual({ title: 'Earlier' });
  });
  it.each(['incomplete', 'failed', 'cancelled', 'requires_action', 'in_progress', undefined])('rejects non-completed status %s even with valid JSON text', async status => {
    const fetcher = vi.fn().mockResolvedValue(payload({ status, outputs: [{ type: 'text', text: '{"title":"Partial"}' }] }));
    await expect(geminiJson('Public', schema, { ...options, fetch: fetcher })).rejects.toThrow('Incomplete Gemini');
  });
  it.each([{ outputs: [] }, { outputs: [{ type: 'thought', text: '{}' }] }, { outputs: [{ type: 'text', text: 'not json' }] }])('rejects missing or malformed answer output', async ({ outputs }) => {
    const fetcher = vi.fn().mockResolvedValue(payload({ status: 'completed', outputs }));
    await expect(geminiJson('Public', schema, { ...options, fetch: fetcher })).rejects.toThrow();
  });
  it('sanitizes HTTP errors rather than exposing provider bodies', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('sensitive provider body', { status: 404 }));
    await expect(geminiJson('Public', schema, { ...options, fetch: fetcher })).rejects.toMatchObject({ status: 404, message: 'Gemini HTTP 404' });
    expect(new GeminiHttpError(429).message).not.toContain('test-secret');
  });
  it('retains legacy schema generation and excludes reasoning parts', async () => {
    const fetcher = vi.fn().mockResolvedValue(payload({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'ignore' }, { text: '{"title":"Legacy"}' }] } }] }));
    expect(await geminiJson('Public', schema, { ...options, api: 'generateContent', fetch: fetcher })).toEqual({ title: 'Legacy' });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).generationConfig).toEqual({ responseMimeType: 'application/json', responseJsonSchema: schema });
  });
  it('rejects truncated legacy results', async () => {
    const fetcher = vi.fn().mockResolvedValue(payload({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] }));
    await expect(geminiJson('Public', schema, { ...options, api: 'generateContent', fetch: fetcher })).rejects.toThrow('Incomplete Gemini');
  });
});
