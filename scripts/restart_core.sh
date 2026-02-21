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

export DOCKER_CONFIG=/tmp/docker-config-openclaw

# compose v1 workaround for WSL ContainerConfig error
# remove mutable services first, then recreate

docker-compose rm -sf backend celery-worker celery-beat frontend || true
docker-compose up -d --no-build backend celery-worker celery-beat frontend nginx

docker-compose ps
