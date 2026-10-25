#!/usr/bin/env bash
# Invoked by deploy-vultr.sh on the provisioned host, as root.
set -euo pipefail
umask 077
SHA=${1:?commit required}
STAGING=${2:?staging directory required}
[[ $SHA =~ ^[a-f0-9]{40}$ && $STAGING =~ ^/tmp/gitzilla-deploy\.[A-Za-z0-9]+$ ]] || exit 2
[[ $EUID == 0 ]] || { echo 'Remote deployment requires root' >&2; exit 2; }
exec 9>/run/lock/gitzilla-deploy.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 2; }
NODE=/usr/local/bin/node
[[ $("$NODE" -p 'Number(process.versions.node.split(".")[0])') -ge 26 ]] || { echo 'Node 26 or newer required' >&2; exit 2; }
BASE=/opt/gitzilla
STATE=/var/lib/gitzilla
ENVFILE=/etc/gitzilla/runtime.env
STAMP=$(date -u +%Y%m%dT%H%M%SZ)-$$
RELEASE=$BASE/releases/$STAMP-${SHA:0:12}
mkdir -p "$RELEASE" "$STATE/cache" /var/backups/gitzilla
chmod 700 /var/backups/gitzilla
chmod 755 "$BASE/releases" "$RELEASE"
tar -xzf "$STAGING/source.tar.gz" -C "$RELEASE"
printf '%s\n' "$SHA" > "$RELEASE/REVISION"
ln -s "$STATE/cache" "$RELEASE/.cache"
# Validate configuration without sourcing secrets or allowing missing identity
# to silently create a new sponsor. Store public verification facts only.
python3 - "$ENVFILE" "$RELEASE" "$STAGING/preflight.json" <<'PY'
import json, pwd, re, stat, sys
from pathlib import Path
from urllib.parse import urlsplit
envfile, release, output = map(Path, sys.argv[1:])
assert envfile.is_file() and stat.S_IMODE(envfile.stat().st_mode) == 0o600, 'Runtime env must be 0600'
env = {}
for line in envfile.read_text().splitlines():
    m = re.match(r'^\s*([A-Z][A-Z0-9_]*)=(.*?)\s*$', line)
    if m:
        k, v = m.groups()
        env[k] = json.loads(v) if v.startswith('"') else v.strip("'")
origin = env.get('PUBLIC_URL', '').rstrip('/')
assert origin.startswith('https://') and urlsplit(origin).path in ('', '/'), 'HTTPS PUBLIC_URL required'
assert env.get('PORT', '5173') == '5173', 'Expected app port 5173'
has_receipts = (release/'server/receipts/service.ts').exists()
enabled = has_receipts and env.get('SOLANA_RECEIPTS_ENABLED') != '0'
if origin == 'https://gitzilla.wilflin.me':
    assert has_receipts and enabled, 'Production deploy must retain the receipts implementation and enabled state'
if env.get('SOLANA_RECEIPTS_ENABLED') == '1':
    assert has_receipts, 'This revision would remove enabled receipts'
if enabled:
    directory = Path(env.get('SOLANA_RECEIPTS_DIR', ''))
    assert directory.is_absolute() and directory.is_relative_to('/var/lib/gitzilla'), 'Configure private persistent SOLANA_RECEIPTS_DIR under /var/lib/gitzilla'
    assert stat.S_IMODE(directory.stat().st_mode) == 0o700, 'Receipts directory must be 0700'
    uid = pwd.getpwnam('gitzilla').pw_uid
    assert directory.stat().st_uid == uid, 'Receipts directory must belong to the service user'
    seed = Path(env.get('SOLANA_ATTESTOR_KEY_FILE', str(directory/'attestor.seed')))
    assert seed.is_relative_to(directory), 'Attestor seed must be inside backed-up receipts directory'
    for file in (seed, directory/'receipts.sqlite'):
        assert file.is_file() and not file.is_symlink() and stat.S_IMODE(file.stat().st_mode) == 0o600, 'Missing or insecure existing receipts state; migrate it first'
        assert file.stat().st_uid == uid, 'Receipts files must belong to the service user'
    assert seed.stat().st_size == 32, 'Invalid existing attestor seed'
output.write_text(json.dumps({'origin': origin.rstrip('/'), 'receipts': enabled}))
PY
cd "$RELEASE"
npm ci --no-audit --no-fund > "$STAGING/install.log" 2>&1 || { echo "Dependency installation failed; active service unchanged" >&2; exit 1; }
npm run build > "$STAGING/build.log" 2>&1 || { echo "Build failed; active service unchanged" >&2; exit 1; }
chmod -R go+rX "$RELEASE"
OLDLINK=$(readlink "$BASE/current" || true)
cp /etc/systemd/system/gitzilla.service "$STAGING/previous.service"
OLDPID=$(systemctl show gitzilla --value -p MainPID)
OLDSTART=$(systemctl show gitzilla --value -p ExecMainStartTimestampMonotonic)
SWITCHED=0
# shellcheck disable=SC2329 # Invoked by the EXIT trap, including rollback failures.
rollback() {
  local status=$?
  trap - EXIT
  if (( status != 0 && SWITCHED )); then
    echo 'Deployment failed; restoring previous release and service' >&2
    systemctl stop gitzilla || true
    cp "$STAGING/previous.service" /etc/systemd/system/gitzilla.service
    if [[ -n $OLDLINK ]]; then
      ln -s "$OLDLINK" "$BASE/.current-rollback-$$"
      mv -Tf "$BASE/.current-rollback-$$" "$BASE/current"
    else
      rm -f "$BASE/current"
    fi
    systemctl daemon-reload
    systemctl start gitzilla || true
    local healthy=0
    for _ in {1..30}; do
      if systemctl is-active --quiet gitzilla && curl -fsS --max-time 2 http://127.0.0.1:5173/api/hall >/dev/null; then healthy=1; break; fi
      sleep 1
    done
    (( healthy )) && echo 'Rollback health check passed' >&2 || echo 'ROLLBACK UNHEALTHY: inspect systemctl status gitzilla' >&2
  fi
  exit "$status"
}
trap rollback EXIT
SWITCHED=1
systemctl stop gitzilla
# A quiescent backup includes SQLite/WAL, the unchanged seed, rooms and halls.
tar -czf "/var/backups/gitzilla/$STAMP.tar.gz" -C "$STATE" .
chmod 600 "/var/backups/gitzilla/$STAMP.tar.gz"
ln -s "$RELEASE" "$BASE/.current-next-$$"
mv -Tf "$BASE/.current-next-$$" "$BASE/current"
cat > /etc/systemd/system/gitzilla.service <<'UNIT'
[Unit]
Description=Gitzilla
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=gitzilla
Group=gitzilla
WorkingDirectory=/opt/gitzilla/current
EnvironmentFile=/etc/gitzilla/runtime.env
ExecStart=/usr/local/bin/node /opt/gitzilla/current/node_modules/tsx/dist/cli.mjs server/main.ts
Restart=on-failure
RestartSec=3
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/gitzilla
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl start gitzilla
for _ in {1..30}; do
  PID=$(systemctl show gitzilla --value -p MainPID)
  START=$(systemctl show gitzilla --value -p ExecMainStartTimestampMonotonic)
  if [[ $PID =~ ^[1-9][0-9]*$ && $PID != "$OLDPID" && $START -gt $OLDSTART ]] && systemctl is-active --quiet gitzilla; then
    # The socket must belong to this service, not an old process on the port.
    OWNED=0
    while read -r listener; do
      if grep -q '/gitzilla.service' "/proc/$listener/cgroup" 2>/dev/null; then OWNED=1; fi
    done < <(ss -ltnp 'sport = :5173' | grep -oE 'pid=[0-9]+' | cut -d= -f2)
    if (( OWNED )) && curl -fsS --max-time 3 http://127.0.0.1:5173/api/hall > "$STAGING/health.json" && python3 -c 'import json,sys; assert isinstance(json.load(open(sys.argv[1])),dict)' "$STAGING/health.json"; then
      if python3 -c 'import json,sys; sys.exit(not json.load(open(sys.argv[1]))["receipts"])' "$STAGING/preflight.json"; then
        curl -fsS --max-time 3 http://127.0.0.1:5173/.well-known/gitzilla-attestor.json > "$STAGING/attestor.json"
        python3 - "$STAGING/attestor.json" <<'PY'
import json,sys
v=json.load(open(sys.argv[1]))
assert v.get('current') == '7qT6auzXr8EWbLXSkcFTksbFudi7i9sdfw4qRcUfngAu', 'Unexpected attestor identity'
PY
      fi
      printf 'Deployed %s; fresh PID %s; /api/hall healthy\n' "$SHA" "$PID"
      echo 'Origin, DNS, runtime credentials and persistent state were not changed.'
      exit 0
    fi
  fi
  sleep 1
done
echo 'New release failed the fresh-process health check' >&2
exit 1
