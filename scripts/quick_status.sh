#!/usr/bin/env bash
set -euo pipefail

BASE_API="${1:-http://localhost:8100}"
BASE_WEB="${2:-http://localhost:3100}"

curl -fsS "$BASE_API/health" >/dev/null && echo "[ok] backend health"
curl -fsS "$BASE_WEB/login" >/dev/null && echo "[ok] frontend /login"

echo "[ok] quick status done"
