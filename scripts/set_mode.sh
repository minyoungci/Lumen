#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
if [[ "$MODE" != "dev" && "$MODE" != "prod" ]]; then
  echo "Usage: bash scripts/set_mode.sh [dev|prod]"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[set_mode] .env not found: $ENV_FILE"
  exit 1
fi

if [[ "$MODE" == "dev" ]]; then
  BACKEND_VAL="true"
  FRONTEND_VAL="true"
else
  BACKEND_VAL="false"
  FRONTEND_VAL="false"
fi

export ENV_FILE BACKEND_VAL FRONTEND_VAL

python3 - <<'PY'
from pathlib import Path
import os

env_path = Path(os.environ['ENV_FILE'])
backend = os.environ['BACKEND_VAL']
frontend = os.environ['FRONTEND_VAL']

lines = env_path.read_text().splitlines()
out = []
seen_backend = False
seen_front = False

for line in lines:
    if line.startswith('DEV_BYPASS_AUTH='):
        out.append(f'DEV_BYPASS_AUTH={backend}')
        seen_backend = True
    elif line.startswith('NEXT_PUBLIC_DEV_BYPASS_AUTH='):
        out.append(f'NEXT_PUBLIC_DEV_BYPASS_AUTH={frontend}')
        seen_front = True
    else:
        out.append(line)

if not seen_front:
    out.append(f'NEXT_PUBLIC_DEV_BYPASS_AUTH={frontend}')
if not seen_backend:
    out.append(f'DEV_BYPASS_AUTH={backend}')

env_path.write_text('\n'.join(out) + '\n')
PY

echo "[set_mode] mode=$MODE"
grep -E '^(NEXT_PUBLIC_DEV_BYPASS_AUTH|DEV_BYPASS_AUTH)=' "$ENV_FILE"
