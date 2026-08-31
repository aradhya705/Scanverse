import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.routes import auth, documents, export, image_tools, media, ocr, pdf_tools, scan, stats
from app.core.config import settings
from app.core.limiter import limiter
from app.db.database import Base, engine

logger = logging.getLogger("scanverse")

# Create tables on startup for local/dev convenience. In production, Alembic
# migrations (see alembic/) are the source of truth for schema changes.
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    logger.warning(f"create_all failed (may need migration): {e}")

# Ensure new columns exist (handles cases where Alembic migration hasn't run)
try:
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE pages ADD COLUMN IF NOT EXISTS original_data BYTEA"))
        conn.execute(text("ALTER TABLE pages ADD COLUMN IF NOT EXISTS processed_data BYTEA"))
        conn.commit()
except Exception:
    pass  # Column already exists or DB not ready

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.EXPORT_DIR, exist_ok=True)

if settings.SECRET_KEY == "change-me-in-production-please":
    if settings.ENVIRONMENT == "production":
        # In production, log a warning instead of crashing —
        # Railway/Render may auto-generate SECRET_KEY via env vars.
        logger.warning(
            "SECRET_KEY is still the default placeholder. Set a real, random "
            "SECRET_KEY in backend/.env before running in production — "
            "leaving it unchanged lets anyone forge valid auth tokens."
        )
    else:
        logger.warning(
            "SECRET_KEY is the default placeholder value. This is fine for local "
            "development but MUST be changed before deploying anywhere reachable."
        )

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="AI-powered document scanning API — edge detection, perspective "
    "correction, enhancement filters, OCR, and export.",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Baseline hardening headers on every response.

    - X-Content-Type-Options blocks MIME-sniffing (relevant since this API
      serves user-uploaded files under /media).
    - X-Frame-Options / frame-ancestors block clickjacking via iframe embed.
    - Referrer-Policy avoids leaking full URLs (which may contain document
      IDs) to third-party sites via the Referer header.
    - Strict-Transport-Security is only meaningful once served over HTTPS
      (e.g. behind the production Nginx config), so it's a no-op locally.
    """
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(), geolocation=()"
    if settings.ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


app.mount("/media/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
app.mount("/media/exports", StaticFiles(directory=settings.EXPORT_DIR), name="exports")

app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(documents.router, prefix=settings.API_V1_PREFIX)
app.include_router(scan.router, prefix=settings.API_V1_PREFIX)
app.include_router(ocr.router, prefix=settings.API_V1_PREFIX)
app.include_router(export.router, prefix=settings.API_V1_PREFIX)
app.include_router(pdf_tools.router, prefix=settings.API_V1_PREFIX)
app.include_router(image_tools.router, prefix=settings.API_V1_PREFIX)
app.include_router(stats.router, prefix=settings.API_V1_PREFIX)
app.include_router(media.router, prefix=settings.API_V1_PREFIX)


@app.get("/health")
def health_check():
    return {"status": "ok"}
