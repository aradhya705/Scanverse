# ScanVerse

An AI-powered document scanner: snap or upload a photo, get an auto-cropped,
perspective-corrected, filtered, and OCR'd document you can search and export.

This is the **core-pipeline build**: auth, upload/capture, edge detection,
perspective correction, enhancement filters, multi-page editing, OCR, search,
favorites, and PDF/DOCX/TXT export — all working end to end on a real
Postgres + FastAPI + React stack behind Docker Compose. It also ships an
Adobe-Scan-style single-page review screen (Retake / Crop / Rotate / Filters /
Cleanup / Edit text / Delete), a black-and-pink dark theme by default, and PWA
support (installable, offline app shell, camera capture) for phone use. See
[`docs/ROADMAP.md`](docs/ROADMAP.md) for what's intentionally not built yet
(PDF merge/split/compress tools, folders, e-signatures, ID-card dual-side
mode, analytics charts) and how the codebase is structured so those slot in
without a rewrite.

## Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Framer Motion, React Query, React Router, React Dropzone, React Hook Form, Axios
- **Backend**: FastAPI, OpenCV, EasyOCR, Pillow, PyMuPDF, python-docx
- **Database**: PostgreSQL + SQLAlchemy + Alembic
- **Infra**: Docker Compose, Nginx reverse proxy

## Quick start (Docker Compose)

```bash
cp backend/.env.example backend/.env
# edit backend/.env and set a real SECRET_KEY

docker compose up --build
```

Then open **http://localhost:8080**.

- Frontend + API are both served through the Nginx reverse proxy on `:8080`.
- The backend is also reachable directly on `:8000` for API debugging (Swagger docs at `http://localhost:8000/docs`).
- Postgres is reachable on `:5432` if you want to inspect it with a client.

First boot will take a few minutes the first time EasyOCR downloads its
detection/recognition models — subsequent runs are fast.

### First run checklist

1. `docker compose up --build`
2. Visit `http://localhost:8080/register` and create an account
3. Go to **New Scan**, drop in a photo of a document (or use "Use camera" on a phone/webcam-enabled browser)
4. Drag the corner handles if the auto-detected crop needs adjusting, pick a filter, click **Apply crop & filter**
5. Click **Extract text (OCR)**, then **Export** as PDF/DOCX/TXT

## Local development (without Docker)

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # point DATABASE_URL at a local Postgres, or run one via `docker compose up db`
alembic upgrade head
uvicorn app.main:app --reload
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` and `/media` to `http://backend:8000` by
default (see `vite.config.ts`); when running the backend locally instead of
in Docker, set `VITE_API_PROXY_TARGET=http://localhost:8000` before `npm run dev`.

## Project structure

```
backend/
  app/
    core/       # settings, JWT/password hashing
    db/         # SQLAlchemy models + session
    schemas/    # Pydantic request/response models
    services/   # image processing, OCR, export — the actual CV/AI engine
    api/routes/ # auth, documents, scan, ocr, export
  alembic/      # migrations
frontend/
  src/
    api/        # typed Axios client
    components/ # CornerAdjuster, FilterPicker, PageThumbnail, Sidebar, Logo
    pages/      # Landing, Login, Register, Dashboard, NewScan, Documents, DocumentDetail, Settings
    context/    # auth state
nginx/          # top-level reverse proxy config
docs/           # architecture notes + roadmap
```

## How the scan pipeline works

1. **Upload** (`POST /api/v1/scan/upload`) — saves the original image and runs
   OpenCV contour detection (`app/services/image_processing.py::detect_document_corners`)
   to guess the four page corners plus a confidence score.
2. **Adjust** — the frontend shows those corners as draggable handles
   (`CornerAdjuster.tsx`) over the original photo so low-confidence detections
   can be corrected by hand.
3. **Process** (`POST /api/v1/scan/pages/{id}/process`) — applies a perspective
   warp using the (possibly adjusted) corners, then a filter preset
   (auto-enhance, color boost, clean document, black & white, etc.) with
   adjustable brightness/contrast/saturation/sharpness/intensity, and writes a
   processed image + thumbnail.
4. **OCR** (`POST /api/v1/ocr/pages/{id}`) — runs EasyOCR against the
   processed image, stores per-page text, and rolls it up into the parent
   document's searchable `ocr_text`.
5. **Export** (`GET /api/v1/export/documents/{id}?format=pdf|docx|txt`) —
   combines all pages (in their current order) into one downloadable file.

Multi-page documents share one `Document` row with ordered `Page` children,
so reordering, duplicating, and rotating pages are all page-level operations
that don't touch sibling pages.

## Security notes for production use

- Change `SECRET_KEY` in `backend/.env` before deploying anywhere reachable.
- The Postgres and backend ports are published to the host for local
  debugging; remove the `ports:` entries for `db` and `backend` in
  `docker-compose.yml` for a production deployment and let Nginx be the only
  public entry point.
- File uploads are restricted to `jpg/jpeg/png/webp` and validated by
  extension; add content-type/magic-byte validation before accepting
  untrusted uploads at scale.
