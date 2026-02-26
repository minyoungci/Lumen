from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from pathlib import Path
import redis
from app.routers import (
    auth, users, daily_logs, ai_summaries, research_notes, shared_posts,
    tags, comments, notifications, schedule, uploads, bookmarks, graph,
    search, activity, admin, kanban, projects, site_settings, billing
)
from app.config import settings
from app.database import engine
from app.services.storage_service import storage_service

app = FastAPI(title="Lumen API", version="1.0.0")

_base_origins = (
    [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
    if settings.ALLOWED_ORIGINS
    else ["http://localhost:3000"]
)
origins = list(dict.fromkeys(_base_origins))

# Keep permissive localhost/WSL origins only in explicit dev bypass mode.
if settings.DEV_BYPASS_AUTH:
    import socket as _socket

    try:
        _wsl_ip = _socket.gethostbyname(_socket.gethostname())
    except Exception:
        _wsl_ip = None

    origins = list(
        dict.fromkeys(
            origins
            + [
                "http://localhost:3000",
                "http://localhost:3100",
                *([f"http://{_wsl_ip}:3000", f"http://{_wsl_ip}:3100"] if _wsl_ip else []),
            ]
        )
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-User-Id", "X-User-Role"],
)

PREFIX = "/api/v1"
app.include_router(auth.router, prefix=f"{PREFIX}/auth", tags=["Auth"])
app.include_router(users.router, prefix=f"{PREFIX}/users", tags=["Users"])
app.include_router(daily_logs.router, prefix=f"{PREFIX}/daily-logs", tags=["Daily Logs"])
app.include_router(ai_summaries.router, prefix=f"{PREFIX}/admin", tags=["AI Summaries"])
app.include_router(research_notes.router, prefix=f"{PREFIX}/research-notes", tags=["Research Notes"])
app.include_router(shared_posts.router, prefix=f"{PREFIX}/shared-posts", tags=["Shared Posts"])
app.include_router(tags.router, prefix=f"{PREFIX}/tags", tags=["Tags"])
app.include_router(comments.router, prefix=f"{PREFIX}/comments", tags=["Comments"])
app.include_router(notifications.router, prefix=f"{PREFIX}/notifications", tags=["Notifications"])
app.include_router(schedule.router, prefix=f"{PREFIX}/schedule", tags=["Schedule"])
app.include_router(uploads.router, prefix=f"{PREFIX}/uploads", tags=["Uploads"])
app.include_router(bookmarks.router, prefix=f"{PREFIX}/bookmarks", tags=["Bookmarks"])
app.include_router(graph.router, prefix=f"{PREFIX}/graph", tags=["Graph"])
app.include_router(search.router, prefix=f"{PREFIX}/search", tags=["Search"])
app.include_router(activity.router, prefix=f"{PREFIX}/activity", tags=["Activity"])
app.include_router(admin.router, prefix=f"{PREFIX}/admin", tags=["Admin"])
app.include_router(kanban.router, prefix=f"{PREFIX}/kanban", tags=["Kanban"])
app.include_router(projects.router, prefix=f"{PREFIX}/projects", tags=["Projects"])
app.include_router(site_settings.router, prefix=f"{PREFIX}/site-settings", tags=["Site Settings"])
app.include_router(billing.router, prefix=f"{PREFIX}/billing", tags=["Billing"])

upload_root = Path(settings.UPLOAD_DIR)
upload_root.mkdir(parents=True, exist_ok=True)
app.mount("/uploads/files", StaticFiles(directory=str(upload_root)), name="uploads-files")


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/ready")
async def readiness_check(response: Response):
    checks = {
        "db": False,
        "redis": False,
        "storage": False,
    }

    if engine is not None:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            checks["db"] = True
        except Exception:
            checks["db"] = False

    try:
        client = redis.from_url(settings.REDIS_URL)
        checks["redis"] = bool(client.ping())
    except Exception:
        checks["redis"] = False

    checks["storage"] = storage_service.is_storage_ready()

    ready = all(checks.values())
    if not ready:
        response.status_code = 503

    return {
        "status": "ready" if ready else "degraded",
        "checks": checks,
    }
