#!/usr/bin/env bash
# ─────────────────────────────────────────────
# Lumen — Cloudflare Tunnel 배포 스크립트
# ─────────────────────────────────────────────
set -euo pipefail

COMPOSE="docker-compose -f docker-compose.yml -f docker-compose.tunnel.yml --env-file .env.prod"
cd "$(dirname "$0")/.."

echo "=== Lumen Cloudflare Tunnel 배포 ==="

# .env.prod 확인
if [ ! -f .env.prod ]; then
  echo "❌ .env.prod 파일이 없습니다."
  echo "   cp .env.prod.example .env.prod  후 값을 채워주세요."
  exit 1
fi

# CLOUDFLARE_TUNNEL_TOKEN 확인
TOKEN=$(grep -E "^CLOUDFLARE_TUNNEL_TOKEN=" .env.prod | cut -d= -f2-)
if [ -z "$TOKEN" ] || [ "$TOKEN" = "eyJ..." ]; then
  echo "❌ .env.prod 에 CLOUDFLARE_TUNNEL_TOKEN이 설정되지 않았습니다."
  echo "   Cloudflare Zero Trust 대시보드에서 터널 토큰을 복사하세요."
  exit 1
fi

# DOMAIN 확인
DOMAIN=$(grep -E "^DOMAIN=" .env.prod | cut -d= -f2-)
if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "lumen.yourdomain.com" ]; then
  echo "❌ .env.prod 에 DOMAIN이 설정되지 않았습니다."
  exit 1
fi

echo "📡 도메인: https://$DOMAIN"
echo ""

echo "1/3  이미지 빌드..."
$COMPOSE build --no-cache

echo "2/3  서비스 시작..."
$COMPOSE up -d

echo "3/3  상태 확인 (10초 대기)..."
sleep 10
$COMPOSE ps

echo ""
echo "✅ 배포 완료!"
echo ""
echo "유용한 명령어:"
echo "  로그 전체:       $COMPOSE logs -f"
echo "  터널 로그만:     $COMPOSE logs -f cloudflared"
echo "  서비스 중지:     $COMPOSE down"
echo "  서비스 재시작:   $COMPOSE restart"
