#!/usr/bin/env bash
# Deploy a commit (default: main) to the stable live server on :5173.
# Live runs from the ../gitzilla-live worktree in herdr pane $LIVE_PANE; agents develop on :5175.
# Fails loudly unless a process started by THIS deploy ends up listening on :5173 (an old server
# holding the port used to make the restart silently no-op while the client files changed).
set -euo pipefail
REF=${1:-main}
LIVE=$(cd "$(dirname "$0")/../../gitzilla-live" && pwd)
LIVE_PANE=${LIVE_PANE:-wQ:pS}
pid_started() { local ticks btime; ticks=$(awk '{print $22}' "/proc/$1/stat"); btime=$(awk '/^btime/{print $2}' /proc/stat); echo $(( btime + ticks / $(getconf CLK_TCK) )); }
listener() { ss -ltnp 2>/dev/null | awk '/:5173 /' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true; }

prev=$(git -C "$LIVE" rev-parse HEAD)
git -C "$LIVE" checkout -q -- package-lock.json 2>/dev/null || true
git -C "$LIVE" checkout --detach -q "$REF"
# dependencies changed since the last deploy (e.g. three): install exactly what the lockfile pins
if ! git -C "$LIVE" diff --quiet "$prev" HEAD -- package.json package-lock.json || [ ! -d "$LIVE/node_modules" ]; then
  (cd "$LIVE" && npm ci --silent >/dev/null)
fi
(cd "$LIVE" && npm run build --silent >/dev/null)
herdr pane send-keys "$LIVE_PANE" ctrl+c >/dev/null
for _ in $(seq 10); do [ -z "$(listener)" ] && break; sleep 0.5; done
old=$(listener)
if [ -n "$old" ]; then echo "killing stale :5173 listener pid $old"; kill "$old"; sleep 1; fi
started=$(date +%s)
# optional private runtime settings (e.g. Solana receipts), kept outside the checkout
LIVE_ENV=${LIVE_ENV:-$HOME/.config/gitzilla/live.env}
herdr pane run "$LIVE_PANE" "set -a; [ -f '$LIVE_ENV' ] && . '$LIVE_ENV'; set +a; PORT=5173 PUBLIC_URL=https://gitzilla.wilflin.me npm start" >/dev/null
for _ in $(seq 40); do
  pid=$(listener)
  # process start time in epoch seconds, locale-independent: boot time + start ticks / CLK_TCK
  if [ -n "$pid" ] && [ "$(pid_started "$pid")" -ge "$((started - 1))" ] && curl -fs -o /dev/null http://localhost:5173/; then
    echo "live @ $(git -C "$LIVE" log --oneline -1) (pid $pid)"; exit 0
  fi
  sleep 0.5
done
echo "DEPLOY FAILED: no fresh server listening on :5173" >&2; exit 1
