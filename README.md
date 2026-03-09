# Lumen (LearnableCat)

Research knowledge base platform (Next.js + FastAPI + Postgres + Redis + Celery).

## Option A: Local Run (Docker)

### 1) Start

```bash
cd D:/learnablecat/lumen
bash scripts/option_a_up.sh
```

Services:
- Frontend: http://localhost:3100
- Backend: http://localhost:8100
- Nginx: http://localhost:8088
- Postgres: localhost:5433
- Redis: localhost:6380

### 2) Smoke Test

```bash
bash scripts/option_a_smoke.sh
```

### 3) Stop

```bash
bash scripts/option_a_down.sh
```

### 4) Strict Auth Check (when DEV_BYPASS_AUTH=false)

```bash
bash scripts/auth_strict_check.sh
```

## Dev Notes

- Dev bypass auth is disabled by default:
  - `NEXT_PUBLIC_DEV_BYPASS_AUTH=false`
  - `DEV_BYPASS_AUTH=false`
- Backend supports a temporary dev auth bridge only when `DEV_BYPASS_AUTH=true`.
- Production hardening needed:
  - RLS policies
  - Storage real integration
  - AI summary real worker flow
