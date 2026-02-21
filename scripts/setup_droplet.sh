#!/usr/bin/env bash
# setup_droplet.sh — Ubuntu 22.04 DigitalOcean Droplet 초기 설정
# 실행: sudo bash setup_droplet.sh
set -euo pipefail

echo "=== [1/5] 시스템 패키지 업데이트 ==="
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git ufw

echo "=== [2/5] UFW 방화벽 설정 ==="
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable
echo "방화벽 상태:"
ufw status

echo "=== [3/5] Docker 설치 ==="
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "Docker 설치 완료:"
  docker --version
else
  echo "Docker 이미 설치됨: $(docker --version)"
fi

# Docker Compose v2 확인 (Docker Desktop에 기본 포함)
if ! docker compose version &> /dev/null; then
  apt-get install -y docker-compose-plugin
fi
echo "Docker Compose: $(docker compose version)"

echo "=== [4/5] Swap 설정 (2GB RAM 보조) ==="
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap 2GB 활성화 완료"
else
  echo "Swap 이미 존재함"
fi
free -h

echo "=== [5/5] 디렉토리 준비 ==="
mkdir -p /opt/labbase
mkdir -p /var/www/certbot
mkdir -p /etc/letsencrypt

echo ""
echo "✅ Droplet 초기 설정 완료!"
echo ""
echo "다음 단계:"
echo "  1. .env.prod 파일 작성: /opt/labbase/.env.prod"
echo "  2. 배포 실행: bash /opt/labbase/scripts/deploy.sh <repo-url> <domain>"
