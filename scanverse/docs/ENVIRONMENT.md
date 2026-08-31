# Environment variables

## Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `ENVIRONMENT` | `development` | `development` or `production`. Production refuses to boot on the default `SECRET_KEY`, enables HSTS, and hides reset tokens from API responses. |
| `DATABASE_URL` | `postgresql://scanverse:scanverse@db:5432/scanverse` | SQLAlchemy Postgres connection string. The `db:5432` host works inside Docker Compose; use `localhost` for a local Postgres. |
| `SECRET_KEY` | `change-me-in-production-please` | JWT signing key. **Must be a long random string before any real deployment.** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Access-token lifetime in minutes (24h default). |
| `UPLOAD_DIR` | `/app/uploads` | Where uploaded originals + processed/thumbnail images live. |
| `EXPORT_DIR` | `/app/exports` | Where exports and tool outputs (PDFs, zips) are written. |
| `MAX_UPLOAD_MB` | `25` | Per-file upload cap, enforced on every upload endpoint. |
| `CORS_ORIGINS` | `["http://localhost:5173", "http://localhost:8080", "http://localhost"]` | Allowed origins (JSON list). |
| `OCR_LANGUAGES` | `["en"]` | Default EasyOCR languages. |

The template ships as `backend/.env.example`:

```ini
ENVIRONMENT=development
DATABASE_URL=postgresql://scanverse:scanverse@db:5432/scanverse
SECRET_KEY=replace-this-with-a-long-random-string
ACCESS_TOKEN_EXPIRE_MINUTES=1440
UPLOAD_DIR=/app/uploads
EXPORT_DIR=/app/exports
MAX_UPLOAD_MB=25
CORS_ORIGINS=["http://localhost:5173","http://localhost:8080","http://localhost"]
OCR_LANGUAGES=["en"]
```

`docker-compose.yml` loads `backend/.env` via `env_file:` and overrides
`DATABASE_URL` to always point at the Compose `db` service.

## Frontend

| Variable | Default | Description |
|---|---|---|
| `VITE_API_PROXY_TARGET` | `http://backend:8000` | Dev-server proxy target for `/api` and `/media` (see `frontend/vite.config.ts`). Set to `http://localhost:8000` when the backend runs locally. |

Client-side settings (no env vars):

- `scanverse_theme` — `light` or `dark` (localStorage)
- `scanverse_ocr_lang` — default OCR language
- `scanverse_default_filter` — filter applied to new pages
- `scanverse_token` / `scanverse_user` — auth session

## Changing settings

- Docker: edit `backend/.env`, then `docker compose up -d --build backend`.
- Local: edit `.env`, restart uvicorn.
