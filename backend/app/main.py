from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import (
    auth, users, daily_logs, ai_summaries, research_notes, shared_posts,
    tags, comments, notifications, schedule, uploads, bookmarks, graph,
    search, activity, admin, kanban, projects
)
from app.config import settings

app = FastAPI(title="Lumen API", version="1.0.0")

_base_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(',')] if settings.ALLOWED_ORIGINS else ["http://localhost:3000"]
# Allow any origin on the same WSL2/LAN host for local dev (port variants)
import socket as _socket
try:
    _wsl_ip = _socket.gethostbyname(_socket.gethostname())
except Exception:
    _wsl_ip = None
origins = list(dict.fromkeys(
    _base_origins + [
        "http://localhost:3000", "http://localhost:3100",
        *([ f"http://{_wsl_ip}:3000", f"http://{_wsl_ip}:3100"] if _wsl_ip else [])
    ]
))

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

@app.on_event("startup")
async def run_migrations():
    from sqlalchemy import text
    from app.database import engine
    if engine:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft'"))
            conn.execute(text("ALTER TABLE shared_posts ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'shared'"))

            # Projects tables
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS projects (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name VARCHAR(200) NOT NULL,
                    description TEXT,
                    invite_token VARCHAR(64) UNIQUE NOT NULL,
                    created_by_id UUID NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS project_members (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL,
                    role VARCHAR(20) NOT NULL DEFAULT 'member',
                    joined_at TIMESTAMPTZ DEFAULT now(),
                    CONSTRAINT uq_project_members_project_user UNIQUE (project_id, user_id)
                )
            """))

            # Add nullable project_id FK to content tables
            conn.execute(text("ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL"))
            conn.execute(text("ALTER TABLE research_notes ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL"))
            conn.execute(text("ALTER TABLE shared_posts ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL"))

            conn.commit()


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
