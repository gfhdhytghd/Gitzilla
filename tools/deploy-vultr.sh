#!/usr/bin/env bash
# Deploy an immutable commit to the existing Vultr host. Never changes DNS,
# PUBLIC_URL, credentials, or Solana identity. Run staging checks first.
set -euo pipefail
if [[ ${1:-} == --help ]]; then
  echo 'Usage: tools/deploy-vultr.sh <commit-or-ref>'
  echo 'Overrides: VULTR_SSH_CONFIG, VULTR_HOST (SSH alias, default gitzilla-vultr-test)'
  exit 0
fi
ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
SHA=$(git -C "$ROOT" rev-parse --verify "${1:-HEAD}^{commit}")
HOST=${VULTR_HOST:-gitzilla-vultr-test}
CONFIG=${VULTR_SSH_CONFIG:-$HOME/.local/state/gitzilla-vultr-test/ssh_config}
[[ $HOST =~ ^[A-Za-z0-9._-]+$ && -f $CONFIG ]] || { echo 'Missing SSH config or invalid host alias' >&2; exit 1; }
SSH=(ssh -o BatchMode=yes -F "$CONFIG")
SCP=(scp -q -o BatchMode=yes -F "$CONFIG")
LOCAL=$(mktemp -d)
REMOTE=''
cleanup() {
  rm -rf -- "$LOCAL"
  if [[ $REMOTE =~ ^/tmp/gitzilla-deploy\.[A-Za-z0-9]+$ ]]; then
    "${SSH[@]}" "$HOST" "rm -rf -- '$REMOTE'" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
git -C "$ROOT" archive --format=tar.gz --output="$LOCAL/source.tar.gz" "$SHA"
REMOTE=$("${SSH[@]}" "$HOST" 'mktemp -d /tmp/gitzilla-deploy.XXXXXXXX')
[[ $REMOTE =~ ^/tmp/gitzilla-deploy\.[A-Za-z0-9]+$ ]] || { echo 'Invalid remote staging directory' >&2; exit 1; }
"${SCP[@]}" "$LOCAL/source.tar.gz" "$ROOT/tools/deploy-vultr-remote.sh" "$HOST:$REMOTE/"
echo "Deploying committed revision $SHA to $HOST (existing origin and state preserved)"
"${SSH[@]}" "$HOST" "bash '$REMOTE/deploy-vultr-remote.sh' '$SHA' '$REMOTE'"
