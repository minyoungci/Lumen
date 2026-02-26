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

    BILLING_ENABLED: bool = False
    BILLING_PROVIDER: str = "manual"
    CHECKOUT_URL_PRO: str = ""
    CHECKOUT_URL_TEAM: str = ""
    CONTACT_SALES_EMAIL: str = "sales@labbase.ai"

    @field_validator("DATABASE_URL", "ANTHROPIC_API_KEY", "SECRET_KEY")
    @classmethod
    def validate_required(cls, v: str, info) -> str:
        if not v or v.startswith("dev-"):
            raise ValueError(f"{info.field_name} is not properly configured")
        return v

    class Config:
        env_file = ".env"

settings = Settings()
