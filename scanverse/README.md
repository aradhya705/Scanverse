# ScanVerse

**AI-powered document scanner** — snap or upload a photo, get an auto-cropped,
perspective-corrected, enhanced, OCR'd document you can search, sign, compress,
and export. Dark-violet glassmorphism UI with a light theme, mobile-first with
bottom navigation, installable as a PWA.

![stack](https://img.shields.io/badge/React-18-61dafb) ![stack](https://img.shields.io/badge/TypeScript-5-3178c6) ![stack](https://img.shields.io/badge/FastAPI-0.115-009688) ![stack](https://img.shields.io/badge/OpenCV-4.10-5c3ee8) ![stack](https://img.shields.io/badge/PostgreSQL-16-336791)

## What's built

**Scan pipeline**

- Auto **edge detection** (three independent OpenCV strategies + sub-pixel corner
  refinement + confidence score) → perspective correction → deskew → filters
- 18 filters: Original, Auto, Color Boost, Clean Document, Black & White,
  High Contrast, Grayscale, Magic Color, Soft, Bright, Dark, Warm, Cool,
  Blueprint, Newspaper, Pencil, Ink, Vintage — each with live intensity /
  brightness / contrast / saturation / sharpness sliders
- Shadow removal, white balance, denoise, CLAHE contrast, sharpening
- Multi-page documents: retake, crop (draggable corners), rotate, cleanup brush
  (stain inpainting), duplicate, delete, reorder, edit text

**OCR & text**

- EasyOCR with per-line confidence, low-confidence flags, auto-deskew + shadow
  removal before recognition, multi-language support (`en, es, fr, de, hi, …`)
- Full-document OCR in one call, copy, export as **TXT / DOCX / PDF**

**Compression (target-size driven)**

- Compress to a specific size: 50 KB → 100 MB, or any custom value (KB / MB / GB)
- Binary-searches quality then scale to land just under your target while
  keeping the highest visual quality; reports original/compressed size,
  reduction %, target-achieved, quality & scale used
- Images (JPG/PNG/WEBP/TIFF/HEIC) **and** PDFs

**PDF & image tools**

- PDF: merge, split (per-page zip), extract pages, delete pages, rearrange pages
- Images: compress, convert (PNG/JPG/WEBP/TIFF/BMP/GIF, HEIC readable), images → PDF, PDF → images (zip)

**Signatures**

- Draw with finger / mouse / stylus, or upload a signature image
- Color + thickness, placement presets, size & opacity → composited onto any page

**Documents & organization**

- Rename (inline + later), auto filename, categories, tags, favorites, full-text
  search (title + OCR text), folders via category
- Dashboard: stats, storage usage meter, recently edited, recent activity,
  quick tools

**Auth & security**

- JWT auth, rate-limited login/register, **password reset** (dev-mode token
  flow, SMTP-ready), strong-password validation, bcrypt hashing, upload
  content validation (magic bytes + decompress check), size limits, security
  headers, HSTS in production, refuses to boot on a default `SECRET_KEY`

**Frontend**

- React 18 + TypeScript + Vite, Tailwind, Framer Motion, React Query,
  React Router, React Dropzone, Zustand-style hooks, Axios
- Dark (black/deep-purple/violet, glassmorphism) + light theme with toggle
- Mobile bottom nav + center FAB, hamburger drawer on tablets, route-level
  code splitting, loading skeletons, toasts, animated transitions
- PWA: installable, offline app shell, camera capture (`sw.js`)

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Framer Motion, React Query, React Router, React Dropzone, Axios |
| Backend | FastAPI, SQLAlchemy, Alembic, OpenCV, EasyOCR, Pillow, PyMuPDF, python-docx, reportlab |
| Database | PostgreSQL 16 |
| Infra | Docker Compose, Nginx reverse proxy |

## Quick start (Docker Compose — one command)

```bash
cp backend/.env.example backend/.env
# edit backend/.env and set a real SECRET_KEY

docker compose up --build
```

Open **http://localhost:8080**.

- Everything (frontend + API + media) is served through the Nginx proxy on `:8080`.
- API docs (auto-generated Swagger): `http://localhost:8080/docs` or directly `http://localhost:8000/docs`.
- Postgres is exposed on `:5432` for local debugging.

> First boot takes a few extra minutes while EasyOCR downloads its models.

**First run checklist**

1. `docker compose up --build`
2. Visit `/register` and create an account
3. **New Scan** → drop a photo of a document (or "Use camera" on a phone)
4. Adjust corner handles if needed → pick a filter → **Apply**
5. **Edit text** (OCR) → export as PDF/DOCX/TXT
6. Try **Compress PDF**, **Sign**, or the **PDF Tools** page

## Documentation

- [Installation & Docker setup](docs/INSTALLATION.md)
- [Environment variables](docs/ENVIRONMENT.md)
- [API reference](docs/API.md)
- [Project architecture](docs/ARCHITECTURE.md)
- [Deployment & troubleshooting](docs/DEPLOYMENT.md)
- [Deploying the frontend on Vercel](docs/VERCEL.md)
- [Roadmap & deferred features](docs/ROADMAP.md)

## Local development (without Docker)

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # point DATABASE_URL at a local Postgres
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
default (see `vite.config.ts`); when running the backend locally instead of in
Docker, set `VITE_API_PROXY_TARGET=http://localhost:8000` before `npm run dev`.

## How the scan pipeline works

1. **Upload** (`POST /api/v1/scan/upload`) — saves the original and runs
   `detect_document_corners` (three detection strategies scored on geometry +
   agreement) to guess the four page corners plus a confidence score.
2. **Adjust** — the frontend shows those corners as draggable handles
   (`CornerAdjuster.tsx`) for low-confidence detections.
3. **Process** (`POST /api/v1/scan/pages/{id}/process`) — perspective warp,
   rotation, then a filter preset with live adjustments → processed image +
   thumbnail.
4. **OCR** (`POST /api/v1/ocr/pages/{id}`) — EasyOCR on a pre-OCR pipeline
   (deskew, shadow removal, CLAHE), stored per-page and rolled up into the
   document's searchable `ocr_text`.
5. **Export** (`GET /api/v1/export/documents/{id}?format=pdf|docx|txt`).

## Testing

```bash
# Backend (in the backend container or a venv with deps installed)
cd backend && python -m pytest

# Frontend type-check + production build
cd frontend && npm run build
```

## License

© ScanVerse. All rights reserved.
