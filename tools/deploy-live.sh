#!/usr/bin/env bash
# Deploy a commit (default: main) to the stable live server on :5173.
# Live runs from the ../gitzilla-live worktree in herdr pane $LIVE_PANE; agents develop on :5175.
set -euo pipefail
REF=${1:-main}
LIVE=$(cd "$(dirname "$0")/../../gitzilla-live" && pwd)
LIVE_PANE=${LIVE_PANE:-wQ:pS}
git -C "$LIVE" checkout --detach -q "$REF"
(cd "$LIVE" && npm run build --silent >/dev/null)
herdr pane send-keys "$LIVE_PANE" ctrl+c >/dev/null
sleep 1
herdr pane run "$LIVE_PANE" "PORT=5173 PUBLIC_URL=https://gitzilla.wilflin.me npm start" >/dev/null
for _ in $(seq 20); do curl -fs -o /dev/null http://localhost:5173/ && break; sleep 0.5; done
echo "live @ $(git -C "$LIVE" log --oneline -1)"
