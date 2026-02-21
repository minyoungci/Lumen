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
export DOCKER_BUILDKIT=0

# Build images first to avoid compose/buildx plugin issues in some WSL setups
docker build -t labbase_backend:latest ./backend
docker build -t labbase_celery-worker:latest ./backend
docker build -t labbase_celery-beat:latest ./backend
docker build -t labbase_frontend:latest ./frontend

# docker-compose v1 in this environment may fail to recreate some services
# with: KeyError: 'ContainerConfig'. Pre-remove mutable app services to avoid it.
docker-compose rm -sf backend celery-worker celery-beat frontend || true

docker-compose up -d --no-build

docker-compose exec -T backend sh -lc 'PYTHONPATH=/app python scripts/seed_dev_user.py' || true

echo "[option_a_up] done"
echo "- Frontend: http://localhost:3100"
echo "- Backend:  http://localhost:8100"
echo "- Nginx:    http://localhost:8088"
