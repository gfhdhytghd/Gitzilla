// Coordinator-authorized private, non-watching copy of the current tree. Only generated bootstrap config differs.
import { cpSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(process.argv[2] || 'qa/artifacts/rematch-private-server-2026-10-25');
const snapshot = join(output, 'source');
if (existsSync(snapshot)) throw new Error('Refusing to overwrite an existing diagnostic snapshot; choose a fresh output directory');
mkdirSync(snapshot, { recursive: true });
for (const dir of ['analysis', 'auth', 'client', 'data', 'design', 'genesis', 'hall', 'public', 'rubric', 'server', 'shared', 'sim']) {
  cpSync(join(root, dir), join(snapshot, dir), { recursive: true });
}
for (const file of ['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'index.html']) cpSync(join(root, file), join(snapshot, file));
symlinkSync(join(root, 'node_modules'), join(snapshot, 'node_modules'), 'dir');
const mainPath = join(snapshot, 'server/main.ts'), main = readFileSync(mainPath, 'utf8');
const needle = 'server: { port, middlewareMode: true, hmr: { server },';
if (!main.includes(needle)) throw new Error('Private bootstrap seam changed; no product changes made');
writeFileSync(mainPath, main.replace(needle, "cacheDir: resolve(root, 'qa-vite-cache'), server: { port, middlewareMode: true, hmr: false, watch: null,"));
const hashes: Record<string, string> = {};
function hashDir(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) hashDir(path);
    else if (entry.isFile()) hashes[relative(snapshot, path)] = createHash('sha256').update(readFileSync(path)).digest('hex');
  }
}
for (const dir of ['client', 'server', 'shared', 'sim']) hashDir(join(snapshot, dir));
writeFileSync(join(output, 'source-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), root, snapshot,
  alteration: 'Generated server/main.ts Vite options only: hmr:false, watch:null, private cacheDir. All gameplay, simulation and rendering code copied unchanged.', hashes }, null, 2));
const child = spawn(process.execPath, ['--import', 'tsx', join(snapshot, 'server/main.ts')], { cwd: snapshot, stdio: 'inherit', env: {
  ...process.env, NODE_ENV: 'development', PORT: '5191', PUBLIC_URL: 'http://localhost:5191', REPO_KAIJU_HTTPS: '0', HTTP_REDIRECT_PORT: '0',
  ROOMS_FILE: join(output, 'rooms.json'), TRACES_DIR: join(output, 'traces'), ROYALE_HALL_FILE: join(output, 'royale-hall.json'),
} });
writeFileSync(join(output, 'server-pid.json'), JSON.stringify({ launcher: process.pid, server: child.pid, port: 5191 }));
console.log(`PRIVATE rematch server PID ${child.pid}; port 5191; room state ${join(output, 'rooms.json')}`);
process.once('SIGTERM', () => child.kill('SIGTERM')); process.once('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code, signal) => { console.log(`PRIVATE server exited code=${code} signal=${signal}`); process.exitCode = code ?? 0; });
