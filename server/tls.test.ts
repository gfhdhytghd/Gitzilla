import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { loadTls } from './tls.ts';

it('generates and reuses a cert covering localhost and LAN IPv4/IPv6, regenerating for a new IP', () => {
  const root = mkdtempSync(join(tmpdir(), 'repo-kaiju-tls-'));
  vi.stubEnv('HTTPS_KEY', ''); vi.stubEnv('HTTPS_CERT', '');
  try {
    expect(loadTls(root, false)).toBeUndefined();
    const first = loadTls(root, true, ['192.0.2.10', '2001:db8::1'])!;
    const cert = new X509Certificate(first.cert);
    expect(cert.checkHost('localhost')).toBe('localhost');
    for (const ip of ['127.0.0.1', '::1', '192.0.2.10', '2001:db8::1']) expect(cert.checkIP(ip)).toBeTruthy();
    expect(loadTls(root, true, ['192.0.2.10', '2001:db8::1'])!.cert.equals(first.cert)).toBe(true);
    const changed = loadTls(root, true, ['192.0.2.11'])!;
    expect(new X509Certificate(changed.cert).checkIP('192.0.2.11')).toBe('192.0.2.11');
    expect(changed.cert.equals(first.cert)).toBe(false);
    vi.stubEnv('HTTPS_KEY', changed.keyPath); vi.stubEnv('HTTPS_CERT', changed.certPath);
    const supplied = loadTls(root, true)!;
    expect(supplied.generated).toBe(false);
    expect(supplied.cert.equals(readFileSync(changed.certPath))).toBe(true);
  } finally {
    vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true });
  }
}, 10_000);
