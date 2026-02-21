#!/usr/bin/env bash
# deploy.sh — DigitalOcean Droplet 원클릭 배포 스크립트
# 사전 조건: setup_droplet.sh 실행 완료, .env.prod 파일 준비
set -euo pipefail

REPO_URL="${1:-}"
DOMAIN="${2:-}"
APP_DIR="/opt/labbase"

if [[ -z "$REPO_URL" || -z "$DOMAIN" ]]; then
  echo "Usage: $0 <git-repo-url> <domain>"
  echo "  예: $0 https://github.com/yourorg/labbase.git lab.yourdomain.com"
  exit 1
fi

echo "=== [1/6] 레포 클론 ==="
if [[ -d "$APP_DIR" ]]; then
  cd "$APP_DIR" && git pull
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "=== [2/6] .env.prod 확인 ==="
if [[ ! -f "$APP_DIR/.env.prod" ]]; then
  echo "ERROR: $APP_DIR/.env.prod 파일이 없습니다."
  echo "아래 항목을 채워 .env.prod를 생성하세요:"
  cat <<'EOF'
DOMAIN=lab.yourdomain.com
DATABASE_URL=postgresql://labbase:STRONGPASSWORD@postgres:5432/labbase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
SECRET_KEY=$(openssl rand -hex 32)
EOF
  exit 1
fi

# .env.prod에서 DOMAIN 읽기
source "$APP_DIR/.env.prod"

echo "=== [3/6] SSL 인증서 발급 (Let's Encrypt) ==="
if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  # 임시 nginx(80포트)로 ACME challenge 처리
  docker run --rm -p 80:80 \
    -v /etc/letsencrypt:/etc/letsencrypt \
    -v /var/www/certbot:/var/www/certbot \
    certbot/certbot certonly --standalone \
    -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN"
  echo "SSL 인증서 발급 완료: /etc/letsencrypt/live/$DOMAIN"
else
  echo "기존 인증서 사용: /etc/letsencrypt/live/$DOMAIN"
fi

echo "=== [4/6] nginx.prod.conf 도메인 치환 ==="
sed "s/\${DOMAIN}/$DOMAIN/g" "$APP_DIR/nginx.prod.conf" > /tmp/nginx.prod.rendered.conf
cp /tmp/nginx.prod.rendered.conf "$APP_DIR/nginx.prod.conf"

echo "=== [5/6] Docker Compose 빌드 & 시작 ==="
cd "$APP_DIR"
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull --ignore-pull-failures || true
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "=== [6/6] 헬스체크 ==="
sleep 10
if curl -sf "https://$DOMAIN/api/health" > /dev/null 2>&1; then
  echo "✅ 배포 완료: https://$DOMAIN"
else
  echo "⚠️  헬스체크 실패. 로그 확인:"
  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=30 backend
fi

echo ""
echo "Certbot 자동 갱신 설정:"
echo "  echo '0 0 1 * * root certbot renew --quiet && docker compose -f $APP_DIR/docker-compose.yml -f $APP_DIR/docker-compose.prod.yml restart nginx' >> /etc/crontab"
