# Project architecture

```
scanverse/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, CORS, security headers, static mounts
│   │   ├── core/              # settings, JWT/password hashing, rate limiter
│   │   ├── db/                # SQLAlchemy models + session
│   │   ├── schemas/           # Pydantic request/response models
│   │   ├── services/          # the actual CV/AI/export engine
│   │   ├── api/routes/        # auth, documents, scan, ocr, export, pdf-tools, image-tools, stats
│   │   └── utils/             # file helpers (validation, user dirs)
│   ├── alembic/               # schema migrations
│   └── tests/                 # unit tests (no DB required)
├── frontend/
│   ├── src/
│   │   ├── api/               # typed Axios client (single seam to the backend)
│   │   ├── components/        # CornerAdjuster, FilterPicker, PageThumbnail, SignaturePad, MobileNav, …
│   │   ├── context/           # auth + toast state
│   │   ├── pages/             # one lazy-loaded module per route
│   │   ├── types/             # shared TS types mirroring the API schemas
│   │   └── styles/            # Tailwind theme (black/deep-purple/violet, glass)
│   ├── nginx.container.conf   # SPA serving inside the frontend image
│   └── Dockerfile             # multi-stage build → nginx
├── nginx/nginx.conf           # top-level reverse proxy (8080)
├── docker-compose.yml         # db + backend + frontend + nginx
└── docs/
```

## Backend layering

`routes → services → (cv2 / PIL / fitz / easyocr)` — route modules handle HTTP
concerns (validation, auth, file limits) and delegate every heavy operation to
a service module:

| Service | Responsibility |
|---|---|
| `image_processing.py` | Corner/edge detection (3 strategies + sub-pixel refinement), perspective warp, auto-enhance (white balance, shadow removal, denoise, CLAHE), 18 filter presets, cleanup inpainting, deskew, OCR prep, thumbnails |
| `ocr_service.py` | EasyOCR wrapper with language validation + confidence reporting |
| `export_service.py` | PDF (PyMuPDF), DOCX (python-docx), TXT generation |
| `pdf_compression_service.py` | Target-size PDF compression: binary-searches JPEG quality, steps down render scale, reports `target_achieved` |
| `image_compression_service.py` | Same target-size strategy for images; lossy (JPEG/WEBP) vs lossless (PNG/TIFF) paths |
| `pdf_tools_service.py` | Merge / split / extract / delete / rearrange via `insert_pdf` (lossless page copying) |
| `image_conversion_service.py` | Format conversion (flattens transparency onto white for JPEG), PDF↔images, zip packaging |
| `signature_service.py` | Pastes a transparent PNG signature at fractional coordinates |

## Data model

- `users` — email, bcrypt hash, name
- `documents` — `owner_id`, `title`, `category` (folders), `tags` (JSON),
  `is_favorite`, `ocr_text` (searchable), timestamps
- `pages` — belongs to a document, `order_index`, `original_path` /
  `processed_path` / `thumbnail_path` (on disk), `corners`, `filter_applied`
  (Postgres enum), `rotation`, adjustment floats, `ocr_text`

Every row is scoped to its owner: routes always join through
`owner_id == current_user.id` before touching anything, so cross-user access
returns 404, not 403 (no information leak).

## Key flows

**Scan → export.** Upload → `detect_document_corners` → store corners →
frontend lets the user adjust → `process` (warp + rotate + filter) → processed
image + thumbnail written, old ones removed → OCR stores per-page text and
rolls it up into `document.ocr_text` → export rebuilds PDF/DOCX/TXT from the
current page images in current order.

**Compress to a size.** The compressor re-encodes every page image at a given
JPEG quality; if the result is still above the target, it steps the render
scale down and repeats (a bounded binary search over quality × a fixed scale
ladder). The best result that fits is returned; if nothing fits, the smallest
result is returned with `target_achieved=false` so the UI can explain.

## Frontend conventions

- All HTTP goes through `src/api/client.ts` — typed functions + axios
  interceptors (auth header, 401 → redirect, blob downloads for exports).
- Data fetching via React Query; mutations invalidate `["document", id]` /
  `["documents"]` / `["stats"]` keys so every screen stays fresh.
- Routes are lazy-loaded (`React.lazy` + `Suspense`) for code splitting.
- Theme: `.dark` class on `<html>`, persisted in `scanverse_theme`.
- Mobile: bottom nav + center FAB (`MobileNav.tsx`) below `lg`; hamburger
  drawer for intermediate widths; safe-area padding for notched phones.

## Performance decisions

- Detection downscales to 800px before contour-finding; processed images are
  JPEG q92, thumbnails q80 at ≤320px.
- Uploads stream to disk in chunks with a hard byte cap instead of being
  buffered whole.
- Binary-search compression keeps the number of full re-renders small
  (~7 iterations × ≤5 scales worst case).
- Route-level chunks + `immutable` cache headers on hashed assets (nginx).

## Known trade-offs

- OCR runs synchronously in the request (fine for single pages; multi-page
  documents should move to a worker queue — see ROADMAP).
- EasyOCR holds models in process memory; scale OCR as a dedicated worker for
  multi-replica deployments.
- Corner detection is classical OpenCV (fast, dependency-light) rather than a
  learned segmentation model; the manual corner handles exist for low-contrast
  edge cases.
- Files live on local disk (`/app/uploads`, `/app/exports`); swapping to
  S3-compatible storage is isolated to `app/utils/files.py` + the static
  mounts in `main.py`.
