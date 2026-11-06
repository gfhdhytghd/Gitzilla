/** Optional teacher-authored resource; only ordinary web links are accepted. */
export function normalizeGuideUrl(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Use a full http:// or https:// guide link (maximum 2048 characters).');
  const link = value.trim();
  if (!link) return undefined;
  try {
    const url = new URL(link);
    if (!/^https?:\/\//i.test(link) || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch {
    throw new Error('Use a full http:// or https:// guide link without a username or password.');
  }
}

/** Bound authored content before trimming, for identical browser/server validation. */
export const GUIDE_TEXT_MAX_CHARS = 32_000;
export const GUIDE_FILE_MAX_BYTES = 128_000;

export function normalizeGuideText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > GUIDE_TEXT_MAX_CHARS) {
    throw new Error(`Use plain text or Markdown instructions (maximum ${GUIDE_TEXT_MAX_CHARS} characters).`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/.test(value)) {
    throw new Error('Use valid text without binary content or invalid encoding.');
  }
  return value.replace(/\r\n?/g, '\n').trim() || undefined;
}

/** File names and size are checked before reading; content is checked separately. */
export function validateGuideFile(file: { name: string; size: number }): void {
  if (!/\.md$/i.test(file.name)) throw new Error('Choose a Markdown (.md) file.');
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('The Markdown file is empty.');
  if (file.size > GUIDE_FILE_MAX_BYTES) throw new Error(`Choose a Markdown file no larger than ${GUIDE_FILE_MAX_BYTES} bytes.`);
}
