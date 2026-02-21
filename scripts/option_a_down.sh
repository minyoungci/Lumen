#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p /tmp/docker-config-openclaw
cat > /tmp/docker-config-openclaw/config.json <<'JSON'
{
  "auths": {
    "registry.cloudflare.com": {}
  }
}
JSON

DOCKER_CONFIG=/tmp/docker-config-openclaw docker-compose down

echo "[option_a_down] stopped"
