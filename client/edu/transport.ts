import type { Rubric } from '../../shared/types.ts';
import { parseRubric } from '../../rubric/index.ts';

export type ParseInput = { text: string; filename?: string } | { file: File };
export type ParseFn = (input: ParseInput) => Promise<Rubric>;

async function responseError(response: Response): Promise<Error> {
  const text = await response.text();
  try { return new Error((JSON.parse(text) as { error?: string }).error || `Request failed (${response.status})`); }
  catch { return new Error(text || `Request failed (${response.status})`); }
}

/** Raw-body upload matches server/edu-http.ts. Local parsing is only for a standalone preview. */
export function serverParse(opts: { room?: string; token?: string } = {}): ParseFn {
  return async input => {
    const isFile = 'file' in input;
    const name = isFile ? input.file.name : input.filename ?? 'rubric.md';
    const type = /\.pdf$/i.test(name) ? 'application/pdf' : isFile ? input.file.type || 'text/markdown' : 'text/markdown';
    const qs = new URLSearchParams({ filename: name, ...(opts.room ? { room: opts.room } : {}) });
    let response: Response | undefined;
    try {
      response = await fetch(`/api/rubric/parse?${qs}`, {
        method: 'POST', headers: { 'Content-Type': type, ...(opts.token ? { 'X-Room-Token': opts.token } : {}) },
        body: isFile ? input.file : input.text,
      });
    } catch {
      if (opts.room) throw new Error('Cannot reach the room server. Your current rubric has not changed.');
    }
    if (response?.ok) return await response.json() as Rubric;
    if (!opts.room && (!response || response.status === 404) && !/pdf/i.test(type)) {
      return parseRubric(isFile ? await input.file.text() : input.text, name);
    }
    if (response) throw await responseError(response);
    throw new Error('PDF preview needs the room server. Upload .md/.txt or paste text instead.');
  };
}

/** Do not hide owner/auth failures by silently exporting another local data set. */
export async function fetchFeedbackExport(room: string, token: string | undefined, format: 'csv' | 'md'): Promise<string> {
  const response = await fetch(`/api/room/${encodeURIComponent(room)}/feedback.${format}`, {
    headers: token ? { 'X-Room-Token': token } : {}, cache: 'no-store',
  });
  if (!response.ok) throw await responseError(response);
  return response.text();
}
