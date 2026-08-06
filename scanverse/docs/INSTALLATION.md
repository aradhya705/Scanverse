# Installation

## Option A — Docker Compose (recommended)

Prerequisites: Docker + Docker Compose v2.

```bash
# 1. Create the backend env file from the template
cp backend/.env.example backend/.env

# 2. (Recommended) set a real secret key
#    edit backend/.env and replace SECRET_KEY=replace-this-with-a-long-random-string
#    with e.g. `python -c "import secrets; print(secrets.token_urlsafe(48))"`

# 3. Build and start everything
docker compose up --build
```

- Frontend: **http://localhost:8080**
- API (Swagger docs): **http://localhost:8080/docs** (or directly `http://localhost:8000/docs`)
- Postgres: `localhost:5432` (user/password/db all `scanverse`)

Stop with `Ctrl+C`; remove containers + volumes with `docker compose down -v` (this deletes all data).

> First boot is slower: the backend image installs EasyOCR/torch, and on the
> first OCR run EasyOCR downloads its detection/recognition models.

### Health checks

- `docker compose ps` — all three services should be `healthy`/`running`.
- `curl http://localhost:8080/health` → `{"status":"ok"}`

## Option B — Local development (no Docker)

**Backend**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # set DATABASE_URL to your local Postgres

# run a Postgres if you don't have one: docker compose up db
alembic upgrade head
uvicorn app.main:app --reload      # http://localhost:8000/docs
```

**Frontend**

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

The Vite dev server proxies `/api` and `/media` to the backend. In Docker the
proxy target is `http://backend:8000` (see `frontend/vite.config.ts`); when the
backend runs locally instead, start the dev server with:

```bash
VITE_API_PROXY_TARGET=http://localhost:8000 npm run dev
```

## First-run checklist

1. Open `/register`, create an account.
2. **New Scan** → drop a photo of a document, or use **Use camera** on a phone/webcam.
3. Drag corner handles if the auto-crop is off → pick a filter → **Apply**.
4. **Edit text** → **Re-run OCR** to extract text.
5. **Save PDF** (or DOCX/TXT).
6. Try **Compress PDF**, **Sign**, and the **PDF Tools** page.

## Running the tests

**Backend** (inside the container, or any venv with `requirements.txt` installed):

```bash
cd backend
python -m unittest discover -s tests -v   # or: python -m pytest
```

The suite covers the CV engine (corner detection, warp, filters, cleanup,
deskew), target-size image/PDF compression, PDF merge/split/extract/delete/
rearrange, signature compositing, and image conversion — 41 tests, no database
required.

**Frontend**:

```bash
cd frontend
npm run build     # TypeScript check + production bundle
```
