# Roadmap

This build focused on making the **core scan pipeline genuinely solid** —
edge detection, perspective correction, filters, multi-page editing, OCR,
export, and auth — rather than spreading effort thin across every feature in
the original brief. Everything below is deferred, not abandoned, and the
codebase is laid out so each of these is an additive slice, not a rewrite.

**Since the initial build:** target-size PDF compression
(`app/services/pdf_compression_service.py` + `/pdf-tools`), standalone
target-size image compression for JPG/PNG/WEBP/TIFF/HEIC
(`app/services/image_compression_service.py` + `/image-tools`, its own
"Image Tools" page), and 10 additional filters (Magic Color, Grayscale,
Soft, Bright, Dark, Blueprint, Newspaper, Pencil, Ink, Vintage — 18 total)
have been added on top of the original 9.

**Latest pass — detection, OCR, security, and mobile/UX polish:**

- **Advanced document detection** (`image_processing.py::detect_document_corners`)
  now runs three independent strategies (Canny edges, adaptive-threshold +
  morphological closing, saturation-channel edges) instead of one, scores
  candidates on geometry (aspect ratio + how close to 90° each corner is) as
  well as area so a stray high-contrast region can't win just by being big,
  refines corners to sub-pixel accuracy via `cv2.cornerSubPix`, and boosts
  confidence when multiple strategies agree.
- **OCR upgrades**: a dedicated pre-OCR pipeline
  (`image_processing.py::prepare_for_ocr`) auto-deskews, removes shadows, and
  lifts contrast before EasyOCR runs — separate from the on-screen filter,
  since what looks good to a human and what reads best to OCR aren't the same
  image. Per-line results are now flagged `low_confidence` below a threshold,
  responses include `average_confidence` / `low_confidence_line_count`, and
  `POST /ocr/documents/{id}` OCRs every page of a document in one call
  instead of looping `/ocr/pages/{id}` per page. `runOcr` on the frontend now
  surfaces confidence via a toast after each run.
- **Security**: the `slowapi` limiter was already a dependency but wasn't
  actually applied anywhere — `/auth/login` and `/auth/register` are now
  rate-limited per IP. Uploads to `/scan/upload` and `/scan/pages/{id}/retake`
  are now verified as genuine, decodable images matching their claimed
  extension (`utils/files.py::validate_image_content`) rather than trusting
  the filename, and the `MAX_UPLOAD_MB` limit — already enforced on the
  image-tools endpoints — is now enforced there too. Passwords require a
  minimum length and a mix of letters/numbers. Baseline security response
  headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS when `ENVIRONMENT=production`) are added to
  every response, and the app now refuses to boot with the default
  `SECRET_KEY` when `ENVIRONMENT=production`.
- **UI/UX**: a global toast notification system
  (`context/ToastContext.tsx` + `components/ToastViewport.tsx`) replaces
  silent success/failure for background actions (OCR, export, favorite,
  upload, retake, cleanup). The sidebar (previously desktop-only, with no
  mobile handling at all) now collapses into a hamburger-triggered slide-in
  drawer below the `lg` breakpoint, with a mobile top bar in
  `DashboardLayout.tsx`. Route changes now animate via `framer-motion`
  instead of hard-cutting between pages.

## Deferred features and where they'd land

| Feature | Where it plugs in |
|---|---|
| Organize into folders | `Document.category` already exists as a column and is exposed/filterable in the API — a "Folders" sidebar view grouping by `category` is the fastest path; a dedicated `Folder` table is the more scalable path if folders need to be user-created/renamed independent of documents. |
| Sign documents (draw/type signature) | A signature pad component (canvas-based) producing a PNG, composited onto a page via a new `app/services/signature_service.py` (Pillow paste at chosen coordinates) + `POST /scan/pages/{id}/sign`. |
| ID card mode (scan both sides into one doc) | A "capture mode" toggle in `NewScan.tsx` that, instead of ending the session after one photo, prompts immediately for a second photo and tags both pages with `category="ID Card"`; no schema change needed. |
| PDF merge / split / password-protect | New `app/services/pdf_tools_service.py` (PyMuPDF already a dependency) + additions to `app/api/routes/pdf_tools.py` (compression already lives there). Frontend: a "PDF Tools" page reusing `PageThumbnail`-style selection UI. |
| Smart categories / auto-tagging | A classification step after OCR in `ocr.py`'s `run_ocr_on_page`, writing to `Document.category` / `Document.tags` (columns already exist and are already exposed in the API and UI). |
| Analytics dashboard with charts | New `app/api/routes/analytics.py` aggregating `Document`/`Page` counts by date; frontend chart library (recharts) on a new `Analytics.tsx` page linked from the sidebar. |
| Full-text OCR search ranking | `documents.py`'s `list_documents` already does an `ILIKE` search over `ocr_text`; swapping to Postgres `tsvector` full-text search is a migration + query change, no API shape change. |
| Chat with documents (RAG), summarization, translation | New service module calling an LLM API, keyed off `Document.ocr_text`. The document/page schema already carries the text needed as context. |
| Duplicate detection, semantic search | Would introduce an embeddings column/table; additive migration, no changes to existing tables. |
| Cloud storage integration | `app/utils/files.py` is the single seam where "local disk" is assumed — swapping to S3-compatible storage means changing that module and the static-file serving in `main.py`, not the routes that call it. |
| Native mobile app | The REST API under `/api/v1` is already the same surface a mobile client would use — no web-specific assumptions in the backend. The PWA (installable, camera capture, offline shell) covers most "app-like on a phone" needs without a separate codebase. |

## Fixes made alongside the feature work

- **`bcrypt` pin** (`backend/requirements.txt`): `passlib==1.7.4` is incompatible
  with `bcrypt>=4.1`'s backend detection, which made `/auth/register` and
  `/auth/login` throw on a fresh install. Pinned to `bcrypt==4.0.1`.
- **`alembic/versions/0001_initial.py`**: the `filtertype` Postgres enum was
  created explicitly and then implicitly re-created by `op.create_table`,
  which fails outright on a brand-new database (`type "filtertype" already
  exists`). Fixed by passing `create_type=False` on the column's enum once
  it's already been created.

## Known trade-offs in the current build

- OCR runs synchronously inside the request; for large multi-page documents,
  this should move to a background task/queue (Celery, arq, or FastAPI
  `BackgroundTasks` as a first step) so uploads don't block on model
  inference.
- EasyOCR loads its models into process memory on first use and keeps them
  cached — fine for a single backend replica, but multi-replica deployments
  should either pin OCR to a dedicated worker service or use a shared model
  cache.
- Corner detection uses classical OpenCV contour-finding (Canny + polygon
  approximation), which is fast and dependency-light but less robust than a
  learned segmentation model on low-contrast backgrounds (e.g., a white page
  on a white table). The manual corner-adjustment UI exists specifically to
  cover that gap.
