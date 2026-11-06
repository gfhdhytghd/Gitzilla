// Enable email OTP for the existing classroom application using the authenticated Auth0 CLI.
// Never reads dotenv, creates credentials, or prints secrets. Run: npx tsx auth/setup-email.ts [client-id]
import { spawnSync } from 'node:child_process';

type App = { client_id: string; name: string };
type Connection = { id: string; name: string; strategy: string };
function api<T>(method: 'get' | 'post' | 'patch', path: string, data?: unknown): T {
  const result = spawnSync('auth0', ['api', method, path, ...(data ? ['--data', '@-'] : [])], {
    input: data ? JSON.stringify(data) : undefined, encoding: 'utf8', timeout: 30_000,
  });
  if (result.status !== 0) {
    // Auth0 error bodies can carry request details. Report the action, not credentials or raw responses.
    throw new Error(`Auth0 ${method.toUpperCase()} ${path.split('?')[0]} failed. Run auth0 login and check your tenant permissions.`);
  }
  return result.stdout.trim() ? JSON.parse(result.stdout) as T : undefined as T;
}
try {
  const apps = api<App[]>('get', 'clients?fields=client_id,name&include_fields=true');
  const candidates = apps.filter(a => process.argv[2] ? a.client_id === process.argv[2] : a.name === 'Repo Kaiju');
  if (candidates.length !== 1) throw new Error('Select one existing application: npx tsx auth/setup-email.ts <client-id>');
  const clientId = candidates[0].client_id;
  const connections = api<Connection[]>('get', 'connections?strategy=email&fields=id,name,strategy&include_fields=true');
  let connection = connections.find(c => c.name === 'email' && c.strategy === 'email');
  if (!connection) connection = api<Connection>('post', 'connections', { name: 'email', strategy: 'email', enabled_clients: [clientId] });
  else api('patch', `connections/${connection.id}/clients`, [{ client_id: clientId, status: true }]);
  const prompts = api<{ universal_login_experience?: string; identifier_first?: boolean }>('get', 'prompts');
  if (prompts.universal_login_experience !== 'new' || !prompts.identifier_first) api('patch', 'prompts', { universal_login_experience: 'new', identifier_first: true });
  const verified = api<Connection>('get', `connections/${connection.id}?fields=id,name,strategy&include_fields=true`);
  const verifiedPrompts = api<{ universal_login_experience?: string; identifier_first?: boolean }>('get', 'prompts');
  let enabled = false, next: string | undefined;
  do {
    const page = api<{ clients: { client_id: string }[]; next?: string }>('get', `connections/${connection.id}/clients${next ? `?from=${encodeURIComponent(next)}` : ''}`);
    enabled ||= page.clients.some(c => c.client_id === clientId); next = page.next;
  } while (!enabled && next);
  if (!enabled || verified.strategy !== 'email' || verifiedPrompts.universal_login_experience !== 'new' || !verifiedPrompts.identifier_first) throw new Error('Email login configuration did not pass readback verification');
  console.log('Verified: email OTP enabled for the selected application; Universal Login is modern.');
  console.log('Next: configure a production email provider, then test delivery and login with a real inbox.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Email login setup failed'); process.exitCode = 1;
}
