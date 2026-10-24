import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

export function lanAddresses(): string[] {
  return [...new Set(Object.values(networkInterfaces()).flatMap(addresses =>
    (addresses || []).filter(address => !address.internal).map(address => address.address.split('%')[0]),
  ))].sort((a, b) => Number(a.includes(':')) - Number(b.includes(':')));
}

export function urlHost(address: string): string { return address.includes(':') ? `[${address}]` : address; }

export interface TlsOptions {
  key: Buffer;
  cert: Buffer;
  keyPath: string;
  certPath: string;
  generated: boolean;
}

/** Opt-in for dev:https; regular dev stays HTTP unless an explicit cert pair is provided. */
export function loadTls(root: string, auto: boolean, addresses = lanAddresses()): TlsOptions | undefined {
  const suppliedKey = process.env.HTTPS_KEY;
  const suppliedCert = process.env.HTTPS_CERT;
  if (suppliedKey || suppliedCert) {
    if (!suppliedKey || !suppliedCert) throw new Error('Set both HTTPS_KEY and HTTPS_CERT, or unset both for dev:https automatic certificates.');
    return { key: readFileSync(suppliedKey), cert: readFileSync(suppliedCert), keyPath: suppliedKey, certPath: suppliedCert, generated: false };
  }
  if (!auto) return undefined;
  const directory = join(root, '.cache', 'tls');
  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'cert.pem');
  const ips = [...new Set(['127.0.0.1', '::1', ...addresses])];
  let reusable = false;
  if (existsSync(keyPath) && existsSync(certPath)) {
    try {
      const certificate = new X509Certificate(readFileSync(certPath));
      reusable = Date.parse(certificate.validTo) > Date.now() + 86_400_000
        && !!certificate.checkHost('localhost') && ips.every(ip => !!certificate.checkIP(ip));
    } catch { /* Regenerate an expired, damaged, or outdated LAN certificate. */ }
  }
  if (!reusable) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const san = ['DNS:localhost', ...ips.map(ip => `IP:${ip}`)].join(',');
    console.log('Generating local HTTPS certificate with openssl...');
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '30',
      '-keyout', keyPath, '-out', certPath, '-subj', '/CN=Repo Kaiju Local Development',
      '-addext', `subjectAltName=${san}`,
      '-addext', 'basicConstraints=critical,CA:TRUE',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
  }
  return { key: readFileSync(keyPath), cert: readFileSync(certPath), keyPath, certPath, generated: true };
}
