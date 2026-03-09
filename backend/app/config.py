from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    REDIS_URL: str = "redis://localhost:6379"
    SECRET_KEY: str = ""
    ALLOWED_ORIGINS: str = "http://localhost:3000"
    DEV_BYPASS_AUTH: bool = False
    ADMIN_EMAIL_ALLOWLIST: str = "dbssus123@gmail.com"
    UPLOAD_DIR: str = "/var/lib/lumen/uploads"
    SUPABASE_STORAGE_BUCKET: str = "uploads"
    LOCAL_UPLOAD_BACKUP_ENABLED: bool = True
    STORAGE_INTEGRITY_CHECK_INTERVAL_HOURS: int = 6
    STORAGE_INTEGRITY_UPLOAD_SCAN_LIMIT: int = 1000
    STORAGE_INTEGRITY_SHARED_SCAN_LIMIT: int = 1000
    STORAGE_INTEGRITY_LOCK_TTL_SECONDS: int = 900
    STORAGE_INTEGRITY_ALERT_DEDUP_HOURS: int = 6

    BILLING_ENABLED: bool = False
    BILLING_PROVIDER: str = "manual"
    CHECKOUT_URL_PRO: str = ""
    CHECKOUT_URL_TEAM: str = ""
    CONTACT_SALES_EMAIL: str = "sales@labbase.ai"

    OPENAI_API_KEY: str = ""
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-large"
    KNOWLEDGE_EMBEDDING_PROVIDER: str = "auto"
    KIMI_API_KEY: str = ""
    KIMI_BASE_URL: str = "https://api.moonshot.cn/v1"
    KIMI_EMBEDDING_MODEL: str = "text-embedding-v1"
    KNOWLEDGE_INDEX_CHUNK_SIZE: int = 1200
    KNOWLEDGE_INDEX_CHUNK_OVERLAP: int = 220
    KNOWLEDGE_INDEX_TOP_K: int = 8
    KNOWLEDGE_SEMANTIC_LINK_MIN_SCORE: float = 0.58
    KNOWLEDGE_NIGHTLY_REINDEX_HOUR: int = 3

    @field_validator("KNOWLEDGE_EMBEDDING_PROVIDER")
    @classmethod
    def validate_embedding_provider(cls, v: str) -> str:
        normalized = (v or "auto").strip().lower()
        allowed = {"auto", "openai", "kimi", "deterministic"}
        if normalized not in allowed:
            raise ValueError("KNOWLEDGE_EMBEDDING_PROVIDER must be one of auto/openai/kimi/deterministic")
        return normalized

    @field_validator("DATABASE_URL", "ANTHROPIC_API_KEY", "SECRET_KEY")
    @classmethod
    def validate_required(cls, v: str, info) -> str:
        if not v or v.startswith("dev-"):
            raise ValueError(f"{info.field_name} is not properly configured")
        return v

    class Config:
        env_file = ".env"

settings = Settings()
