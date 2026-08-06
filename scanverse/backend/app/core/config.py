from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Central application configuration, sourced from environment variables."""

    PROJECT_NAME: str = "ScanVerse API"
    API_V1_PREFIX: str = "/api/v1"

    # "development" (default) or "production" — gates a few safety checks
    # (refusing to boot on a default SECRET_KEY, enabling HSTS) that would be
    # too strict for local dev but matter once something is deployed.
    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: str = "postgresql://scanverse:scanverse@db:5432/scanverse"

    # Auth
    SECRET_KEY: str = "change-me-in-production-please"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Storage
    UPLOAD_DIR: str = "/app/uploads"
    EXPORT_DIR: str = "/app/exports"
    MAX_UPLOAD_MB: int = 25

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:8080", "http://localhost"]

    # OCR
    OCR_LANGUAGES: list[str] = ["en"]

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
