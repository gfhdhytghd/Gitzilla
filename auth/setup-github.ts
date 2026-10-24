// One-off: copy AUTH0_GITHUB_CLIENT_ID / AUTH0_GITHUB_CLIENT_SECRET from .env into the Auth0 "github" connection
// via the logged-in Auth0 CLI (secret goes over stdin, never printed). `npx tsx auth/setup-github.ts`
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from './index.ts';

const env = { ...parseEnv(readFileSync(resolve(import.meta.dirname, '../.env'), 'utf8')), ...process.env };
const clientId = env.AUTH0_GITHUB_CLIENT_ID, clientSecret = env.AUTH0_GITHUB_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error('Set AUTH0_GITHUB_CLIENT_ID and AUTH0_GITHUB_CLIENT_SECRET in .env');
const connection = env.AUTH0_GITHUB_CONNECTION_ID || 'con_eH7WbBKkVA3S6KxO';
// PATCH replaces `options` wholesale, so send the complete set.
const body = JSON.stringify({ options: {
  client_id: clientId, client_secret: clientSecret, read_user: true, repo: true,
  scope: ['read:user', 'repo'], set_user_root_attributes: 'on_each_login',
} });
const out = spawnSync('auth0', ['api', 'patch', `connections/${connection}`, '--data', '@-'], { input: body, encoding: 'utf8' });
if (out.status !== 0) { console.error(out.stderr); process.exit(1); }
const result = JSON.parse(out.stdout);
console.log(`github connection updated: own keys=${result.options?.client_id === clientId}, scope=${result.options?.scope}`);
