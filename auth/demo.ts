// Standalone login check: `npx tsx auth/demo.ts` → open http://localhost:5174 (registered as a dev callback).
// Exercises the real Auth0 tenant + GitHub without the game server. Never prints tokens.
import { createServer } from 'node:http';
import { authEnabled, getGithubToken, handleAuthRoute } from './index.ts';

const page = `<!doctype html><meta charset=utf-8><title>Gitzilla auth check</title>
<body style="font:14px monospace;background:#111;color:#9f9;padding:16px">
<h3>$ gitzilla auth check</h3><div id=me>…</div><ol id=repos></ol>
<script>
(async () => {
  const me = await (await fetch('/api/me')).json();
  const el = document.getElementById('me');
  if (!me.user) { el.innerHTML = 'signed out — <a style="color:#ff0" href="/auth/login?returnTo=/">Connect GitHub</a>'; return; }
  el.innerHTML = '<img src="' + me.user.avatar + '" width=24> @' + me.user.login + ' (' + me.user.userId + ') — token on server: <b id=tok>?</b> — <a style="color:#ff0" href="/auth/logout?returnTo=/">sign out</a>';
  document.getElementById('tok').textContent = await (await fetch('/token')).text();
  const r = await fetch('/api/me/repos');
  const repos = await r.json();
  if (!r.ok) { document.getElementById('repos').textContent = r.status + ' ' + repos.error; return; }
  document.getElementById('repos').innerHTML = repos.map(x => '<li>' + x.full_name + (x.private ? ' 🔒' : '') + ' [' + (x.language || '-') + '] ★' + x.stars + ' ' + x.pushed_at + '</li>').join('');
})();
</script>`;

if (!authEnabled()) throw new Error('AUTH0_* not configured');
createServer((req, res) => {
  void (async () => {
    if (await handleAuthRoute(req, res)) return;
    if (req.url === '/token') { res.end((await getGithubToken(req)) ? 'yes' : 'no'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page);
  })().catch(error => { console.error(error); res.writeHead(500); res.end(String(error)); });
}).listen(5174, () => console.log('auth demo: http://localhost:5174'));
