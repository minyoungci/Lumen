#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://localhost:8100/api/v1}"

code_no_token=$(curl -sS -o /tmp/lb_no_token.json -w '%{http_code}' "$BASE/users/me")
code_x_user=$(curl -sS -o /tmp/lb_x_user.json -w '%{http_code}' -H 'X-User-Id: 00000000-0000-0000-0000-000000000001' "$BASE/users/me")
code_fake_bearer=$(curl -sS -o /tmp/lb_fake_bearer.json -w '%{http_code}' -H 'Authorization: Bearer fake.token.value' "$BASE/users/me")

if [[ "$code_no_token" != "401" ]]; then
  echo "[FAIL] no token expected 401 got $code_no_token"
  cat /tmp/lb_no_token.json
  exit 1
fi

if [[ "$code_x_user" != "401" ]]; then
  echo "[FAIL] X-User-Id expected 401 got $code_x_user"
  cat /tmp/lb_x_user.json
  exit 1
fi

if [[ "$code_fake_bearer" != "401" ]]; then
  echo "[FAIL] fake bearer expected 401 got $code_fake_bearer"
  cat /tmp/lb_fake_bearer.json
  exit 1
fi

echo "[PASS] strict auth check"
