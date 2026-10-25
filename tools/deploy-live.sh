#!/usr/bin/env bash
# Deploy a commit (default: main) to the stable live server on :5173.
# Live runs from the ../gitzilla-live worktree in herdr pane $LIVE_PANE; agents develop on :5175.
# Fails loudly unless a process started by THIS deploy ends up listening on :5173 (an old server
# holding the port used to make the restart silently no-op while the client files changed).
set -euo pipefail
REF=${1:-main}
LIVE=$(cd "$(dirname "$0")/../../gitzilla-live" && pwd)
LIVE_PANE=${LIVE_PANE:-wQ:pS}
listener() { ss -ltnp 2>/dev/null | awk '/:5173 /' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }

git -C "$LIVE" checkout --detach -q "$REF"
(cd "$LIVE" && npm run build --silent >/dev/null)
herdr pane send-keys "$LIVE_PANE" ctrl+c >/dev/null
for _ in $(seq 10); do [ -z "$(listener)" ] && break; sleep 0.5; done
old=$(listener)
if [ -n "$old" ]; then echo "killing stale :5173 listener pid $old"; kill "$old"; sleep 1; fi
started=$(date +%s)
herdr pane run "$LIVE_PANE" "PORT=5173 PUBLIC_URL=https://gitzilla.wilflin.me npm start" >/dev/null
for _ in $(seq 40); do
  pid=$(listener)
  if [ -n "$pid" ] && [ "$(date -d "$(ps -o lstart= -p "$pid")" +%s)" -ge "$((started - 1))" ] && curl -fs -o /dev/null http://localhost:5173/; then
    echo "live @ $(git -C "$LIVE" log --oneline -1) (pid $pid)"; exit 0
  fi
  sleep 0.5
done
echo "DEPLOY FAILED: no fresh server listening on :5173" >&2; exit 1
