#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://localhost:8100/api/v1}"
USER_ID="00000000-0000-0000-0000-000000000001"

echo "[smoke] health"
curl -fsS "${BASE%/api/v1}/health" >/dev/null

echo "[smoke] users/me"
curl -fsS -H "X-User-Id: $USER_ID" "$BASE/users/me" >/dev/null

STAMP=$(date +%s)
TAG_NAME="smoke-$STAMP"

echo "[smoke] tags create/list"
TAG_CREATE=$(curl -fsS -X POST -H "Content-Type: application/json" -H "X-User-Id: $USER_ID" \
  -d "{\"name\":\"$TAG_NAME\",\"color\":\"blue\"}" \
  "$BASE/tags")

TAG_ID=$(TAG_CREATE="$TAG_CREATE" python3 - <<'PY'
import json,os
obj=json.loads(os.environ['TAG_CREATE'])
print(obj['data']['id'])
PY
)

curl -fsS -H "X-User-Id: $USER_ID" "$BASE/tags?search=smoke" >/dev/null

echo "[smoke] daily log put/get"
TODAY=$(date +%F)
curl -fsS -X PUT -H "Content-Type: application/json" -H "X-User-Id: $USER_ID" \
  -d '{"content":{"text":"smoke log"},"word_count":2}' \
  "$BASE/daily-logs/$TODAY" >/dev/null
curl -fsS -H "X-User-Id: $USER_ID" "$BASE/daily-logs/$TODAY" >/dev/null

# cleanup tag
echo "[smoke] cleanup"
curl -fsS -X DELETE -H "X-User-Id: $USER_ID" "$BASE/tags/$TAG_ID" >/dev/null || true

echo "[smoke] done"
